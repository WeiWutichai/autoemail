import { z } from 'zod';
import { paginationQuerySchema } from './pagination';

export const auditLogSchema = z.object({
  id: z.string().uuid(),
  adminEmail: z.string().nullable(),
  action: z.string(),
  target: z.string().nullable(),
  diff: z.record(z.unknown()).nullable(),
  ip: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditLogDto = z.infer<typeof auditLogSchema>;

export const auditListQuerySchema = paginationQuerySchema.extend({
  action: z.preprocess((v) => (v === '' ? undefined : v), z.string().max(100).optional()),
});
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

/** PDPA: erase personal data stored for one email address. */
export const pdpaEraseInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});
export type PdpaEraseInput = z.infer<typeof pdpaEraseInputSchema>;

export const pdpaEraseResultSchema = z.object({
  contactsDeleted: z.number().int(),
  mailsScrubbed: z.number().int(),
});
export type PdpaEraseResult = z.infer<typeof pdpaEraseResultSchema>;
