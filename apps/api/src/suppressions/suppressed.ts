import type { PrismaService } from '../prisma/prisma.service';

/**
 * The subset of `addresses` (lower-cased) suppressed for mails from `connectionId`:
 * entries for every database plus entries for that connection. A null connection
 * (e.g. an admin test send) only matches the every-database entries.
 */
export async function findSuppressed(
  prisma: PrismaService,
  connectionId: string | null,
  addresses: Iterable<string>,
): Promise<Set<string>> {
  const unique = Array.from(new Set(Array.from(addresses, (a) => a.toLowerCase())));
  if (unique.length === 0) return new Set();
  const rows = await prisma.suppressedEmail.findMany({
    where: {
      email: { in: unique },
      OR: [{ connectionId: null }, ...(connectionId ? [{ connectionId }] : [])],
    },
    select: { email: true },
  });
  return new Set(rows.map((r) => r.email));
}
