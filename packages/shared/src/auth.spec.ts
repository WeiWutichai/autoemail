import { createAdminUserSchema, loginSchema, updateAdminUserSchema } from './auth';

describe('auth schemas', () => {
  it('normalizes login email', () => {
    expect(loginSchema.parse({ email: ' Admin@Example.COM ', password: 'x' }).email).toBe(
      'admin@example.com',
    );
  });

  it('rejects short passwords on create', () => {
    const result = createAdminUserSchema.safeParse({
      email: 'a@b.co',
      name: 'A',
      password: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one field on update', () => {
    expect(updateAdminUserSchema.safeParse({}).success).toBe(false);
    expect(updateAdminUserSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});
