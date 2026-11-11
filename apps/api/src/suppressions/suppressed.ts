import type { PrismaService } from '../prisma/prisma.service';

/** The subset of `addresses` (lower-cased) that is on the suppression list. */
export async function findSuppressed(
  prisma: PrismaService,
  addresses: Iterable<string>,
): Promise<Set<string>> {
  const unique = Array.from(new Set(Array.from(addresses, (a) => a.toLowerCase())));
  if (unique.length === 0) return new Set();
  const rows = await prisma.suppressedEmail.findMany({
    where: { email: { in: unique } },
    select: { email: true },
  });
  return new Set(rows.map((r) => r.email));
}
