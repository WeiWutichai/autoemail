import { z } from 'zod';

export const MAX_SUPPRESSION_REASON_LENGTH = 200;

export const suppressedEmailSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type SuppressedEmailDto = z.infer<typeof suppressedEmailSchema>;

export const createSuppressionSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  reason: z
    .string()
    .trim()
    .max(MAX_SUPPRESSION_REASON_LENGTH)
    .nullable()
    .default(null)
    .transform((v) => v || null),
});
export type CreateSuppressionInput = z.infer<typeof createSuppressionSchema>;
