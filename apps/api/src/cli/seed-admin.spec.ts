import { ensureAdmin } from './seed-admin';

vi.mock('../auth/password', () => ({ hashPassword: vi.fn(async (p: string) => `hashed:${p}`) }));

describe('ensureAdmin', () => {
  const input = { email: 'admin@example.com', password: 'password1', name: 'Administrator' };

  it('creates the admin when missing', async () => {
    const adminUser = { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() };

    await expect(ensureAdmin(adminUser as never, input)).resolves.toBe('created');
    expect(adminUser.create).toHaveBeenCalledWith({
      data: { email: input.email, name: input.name, passwordHash: 'hashed:password1' },
    });
  });

  it('leaves an existing admin untouched', async () => {
    const adminUser = { findUnique: vi.fn().mockResolvedValue({ id: 'x' }), create: vi.fn() };

    await expect(ensureAdmin(adminUser as never, input)).resolves.toBe('exists');
    expect(adminUser.create).not.toHaveBeenCalled();
  });
});
