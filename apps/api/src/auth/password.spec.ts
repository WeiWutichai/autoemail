import { BCRYPT_COST, hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('hashes with bcrypt cost 12 and verifies', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash).toMatch(new RegExp(`^\\$2[aby]\\$${BCRYPT_COST}\\$`));
    await expect(verifyPassword('correct horse', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  it('returns false when there is no hash', async () => {
    await expect(verifyPassword('anything', null)).resolves.toBe(false);
  });
});
