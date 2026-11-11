import { z } from 'zod';
import { paginationQuerySchema } from './pagination';

export const contactSourceSchema = z.enum(['ERP', 'MANUAL']);
export type ContactSource = z.infer<typeof contactSourceSchema>;

export const contactSchema = z.object({
  id: z.string().uuid(),
  /** ERP = pulled by a sync; MANUAL = added by an admin. */
  source: contactSourceSchema,
  /** Always set for ERP contacts; optional for manual ones. */
  connectionId: z.string().uuid().nullable(),
  connectionName: z.string().nullable(),
  erpRefId: z.string().nullable(),
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
  source: z.preprocess(emptyToUndefined, contactSourceSchema.optional()),
});
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((v) => v || null);

/** An address added by hand (source MANUAL). */
export const createContactSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  name: optionalText(200),
  phone: optionalText(50),
  /** Company or department. */
  company: optionalText(200),
  /** Optional database the address belongs to. */
  connectionId: z.string().uuid().nullable().default(null),
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320),
    name: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .transform((v) => v || null),
    phone: z
      .string()
      .trim()
      .max(50)
      .nullable()
      .transform((v) => v || null),
    company: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .transform((v) => v || null),
    connectionId: z.string().uuid().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

/** Result of collecting an outbox sync's recipients into contacts (nothing is sent). */
export const collectContactsResultSchema = z.object({
  fetched: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
});
export type CollectContactsResult = z.infer<typeof collectContactsResultSchema>;
