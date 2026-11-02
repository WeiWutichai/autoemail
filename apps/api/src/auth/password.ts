import bcrypt from 'bcryptjs';

export const BCRYPT_COST = 12;

/** Valid cost-12 hash of a random string; compared against when the email is unknown to keep timing uniform. */
const DUMMY_HASH = '$2b$12$oVEtHHRWAa.n7DF9VX2kBOH6ZOyKNWsevEXeywldhoSncdG9Uu0qO';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(
  plain: string,
  hash: string | null | undefined,
): Promise<boolean> {
  const ok = await bcrypt.compare(plain, hash ?? DUMMY_HASH);
  return ok && hash != null;
}
