import { z } from 'zod';
import { paginationQuerySchema } from './pagination';

export const contactSchema = z.object({
  id: z.string().uuid(),
  connectionId: z.string().uuid(),
  connectionName: z.string(),
  erpRefId: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  company: z.string().nullable(),
  raw: z.record(z.unknown()).nullable(),
  syncedAt: z.string(),
});
export type ContactDto = z.infer<typeof contactSchema>;

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

export const contactListQuerySchema = paginationQuerySchema.extend({
  connectionId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  q: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
});
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;
