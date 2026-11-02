import { z } from 'zod';

/** bcrypt only uses the first 72 bytes of a password. */
export const passwordSchema = z.string().min(8).max(72);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(72),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const adminUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  isActive: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminUserDto = z.infer<typeof adminUserSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  user: adminUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const createAdminUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(100),
  password: passwordSchema,
});
export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;

export const updateAdminUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.isActive !== undefined, {
    message: 'At least one field is required',
  });
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
