import type { PrismaService } from '../prisma/prisma.service';
import type { OutboxRow } from './outbox-sync.service';
import { cellText, chunk } from './run-result';

const MAX_COMPANY = 200;

/** erp_ref_id of a contact collected from outbox recipients (one per address per connection). */
export const recipientRef = (email: string) => `recipient:${email}`;

/** Department of a row: the `department` column, else `dept_code`. */
function departmentOf(row: OutboxRow): string {
  return cellText(row.variables.department) || cellText(row.variables.dept_code);
}

/**
 * Upserts every address of the rows (to, cc, bcc) as an ERP contact of `connectionId`, with
 * the departments it receives mail for in `company`. Nothing is sent or enqueued.
 */
export async function collectOutboxContacts(
  prisma: PrismaService,
  connectionId: string,
  rows: OutboxRow[],
): Promise<{ created: number; updated: number }> {
  const departments = new Map<string, Set<string>>();
  for (const row of rows) {
    const dept = departmentOf(row);
    for (const email of [...row.to, ...row.cc, ...row.bcc]) {
      const set = departments.get(email) ?? new Set<string>();
      if (dept) set.add(dept);
      departments.set(email, set);
    }
  }
  const contacts = Array.from(departments, ([email, depts]) => ({
    email,
    erpRefId: recipientRef(email),
    company: Array.from(depts).sort().join(', ').slice(0, MAX_COMPANY) || null,
  }));

  let created = 0;
  let updated = 0;
  const syncedAt = new Date();
  for (const batch of chunk(contacts, 500)) {
    const existing = await prisma.contact.findMany({
      where: { connectionId, erpRefId: { in: batch.map((c) => c.erpRefId) } },
      select: { erpRefId: true },
    });
    const known = new Set(existing.map((c) => c.erpRefId));
    const fresh = batch.filter((c) => !known.has(c.erpRefId));
    if (fresh.length > 0) {
      const { count } = await prisma.contact.createMany({
        data: fresh.map((c) => ({ ...c, source: 'ERP' as const, connectionId, syncedAt })),
        skipDuplicates: true,
      });
      created += count;
    }
    for (const part of chunk(
      batch.filter((c) => known.has(c.erpRefId)),
      100,
    )) {
      await prisma.$transaction(
        part.map((c) =>
          prisma.contact.updateMany({
            where: { connectionId, erpRefId: c.erpRefId },
            data: { company: c.company, syncedAt },
          }),
        ),
      );
      updated += part.length;
    }
  }
  return { created, updated };
}
