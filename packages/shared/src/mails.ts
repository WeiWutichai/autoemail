import { z } from 'zod';
import { paginationQuerySchema } from './pagination';

export const MAIL_STATUSES = ['PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD', 'CANCELLED'] as const;
export const mailStatusSchema = z.enum(MAIL_STATUSES);
export type MailStatus = z.infer<typeof mailStatusSchema>;

export const MAIL_EVENTS = [
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'RETRY',
  'DEAD',
  'CANCELLED',
] as const;
export type MailEvent = (typeof MAIL_EVENTS)[number];

export const mailSummarySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  scheduledAt: z.string(),
  sentAt: z.string().nullable(),
  nextRetryAt: z.string().nullable(),
  status: mailStatusSchema,
  attempts: z.number().int(),
  toAddrs: z.array(z.string()),
  subject: z.string().nullable(),
  erpRefId: z.string().nullable(),
  connectionName: z.string().nullable(),
  templateCode: z.string().nullable(),
  templateVersion: z.number().int().nullable(),
  smtpConfigName: z.string().nullable(),
  messageId: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type MailSummaryDto = z.infer<typeof mailSummarySchema>;

export const mailLogSchema = z.object({
  id: z.string().uuid(),
  event: z.enum(MAIL_EVENTS),
  detail: z.string().nullable(),
  smtpResponse: z.string().nullable(),
  createdAt: z.string(),
});
export type MailLogDto = z.infer<typeof mailLogSchema>;

export const mailDetailSchema = mailSummarySchema.extend({
  cc: z.array(z.string()),
  bcc: z.array(z.string()),
  html: z.string().nullable(),
  text: z.string().nullable(),
  /** True when the rendered content was removed by the retention job or a PDPA request. */
  contentRemoved: z.boolean(),
  logs: z.array(mailLogSchema),
});
export type MailDetailDto = z.infer<typeof mailDetailSchema>;

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().optional());

export const mailListQuerySchema = paginationQuerySchema.extend({
  status: z.preprocess(emptyToUndefined, mailStatusSchema.optional()),
  connectionId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  templateId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  /** Inclusive lower bound on created time. */
  from: optionalDate,
  /** Exclusive upper bound on created time. */
  to: optionalDate,
  /** Matches a recipient address or the ERP reference. */
  q: z.preprocess(emptyToUndefined, z.string().trim().max(320).optional()),
});
export type MailListQuery = z.infer<typeof mailListQuerySchema>;

export const mailStatsSchema = z.object({
  /** Start of "today" in MAIL_TIMEZONE. */
  since: z.string(),
  sentToday: z.number().int(),
  failedToday: z.number().int(),
  waiting: z.number().int(),
  dead: z.number().int(),
  quotas: z.array(
    z.object({
      smtpConfigId: z.string().uuid(),
      name: z.string(),
      used: z.number().int(),
      limit: z.number().int(),
      isDefault: z.boolean(),
    }),
  ),
});
export type MailStatsDto = z.infer<typeof mailStatsSchema>;
