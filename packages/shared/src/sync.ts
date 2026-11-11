import { z } from 'zod';

export const SYNC_KINDS = ['CONTACTS', 'OUTBOX'] as const;
export const syncKindSchema = z.enum(SYNC_KINDS);
export type SyncKind = z.infer<typeof syncKindSchema>;

/** Column aliases the query must return (after column mapping), per kind. */
export const REQUIRED_COLUMNS: Record<SyncKind, readonly string[]> = {
  CONTACTS: ['erp_ref_id', 'email'],
  OUTBOX: ['erp_ref_id', 'to_email'],
};

/** Columns with a special meaning; everything else becomes `raw` (contacts) or template variables (outbox). */
export const KNOWN_COLUMNS: Record<SyncKind, readonly string[]> = {
  CONTACTS: ['erp_ref_id', 'email', 'name', 'phone', 'company'],
  OUTBOX: ['erp_ref_id', 'to_email', 'cc', 'bcc', 'template_code'],
};

export const MIN_POLL_INTERVAL_SEC = 60;
export const MAX_POLL_INTERVAL_SEC = 86_400;
export const MAX_QUERY_LENGTH = 20_000;
export const PREVIEW_ROW_LIMIT = 2000;

const columnName = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Invalid column name');

/** `{ target_column: source_column }` renames applied to every fetched row. */
export const columnMappingSchema = z
  .record(columnName, columnName)
  .refine((m) => Object.keys(m).length <= 50, { message: 'Too many mappings' });
export type ColumnMapping = z.infer<typeof columnMappingSchema>;

export const syncRunResultSchema = z.object({
  startedAt: z.string(),
  durationMs: z.number().int().nonnegative(),
  fetched: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  /** First few row-level problems (never row contents beyond the ERP reference). */
  messages: z.array(z.string()),
});
export type SyncRunResult = z.infer<typeof syncRunResultSchema>;

export const syncConfigSchema = z.object({
  id: z.string().uuid(),
  connectionId: z.string().uuid(),
  connectionName: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  kind: syncKindSchema,
  querySql: z.string(),
  columnMapping: columnMappingSchema.nullable(),
  pollIntervalSec: z.number().int(),
  isActive: z.boolean(),
  lastSyncedAt: z.string().nullable(),
  lastResult: syncRunResultSchema.nullable(),
  lastError: z.string().nullable(),
  templateId: z.string().uuid().nullable(),
  templateCode: z.string().nullable(),
  smtpConfigId: z.string().uuid().nullable(),
  smtpConfigName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SyncConfigDto = z.infer<typeof syncConfigSchema>;

const nameField = z.string().trim().min(1).max(100);
export const MAX_DESCRIPTION_LENGTH = 500;
/** Blank text is stored as null. */
const descriptionField = z
  .string()
  .trim()
  .max(MAX_DESCRIPTION_LENGTH)
  .nullable()
  .transform((v) => v || null);
const queryField = z.string().trim().min(1).max(MAX_QUERY_LENGTH);
const pollField = z.number().int().min(MIN_POLL_INTERVAL_SEC).max(MAX_POLL_INTERVAL_SEC);

export const createSyncConfigSchema = z
  .object({
    connectionId: z.string().uuid(),
    name: nameField,
    description: descriptionField.default(null),
    kind: syncKindSchema,
    querySql: queryField,
    columnMapping: columnMappingSchema.nullable().default(null),
    pollIntervalSec: pollField.default(300),
    isActive: z.boolean().default(true),
    /** OUTBOX: required. */
    templateId: z.string().uuid().nullable().default(null),
    /** OUTBOX: null = default SMTP config. */
    smtpConfigId: z.string().uuid().nullable().default(null),
  })
  .refine((v) => v.kind !== 'OUTBOX' || v.templateId !== null, {
    message: 'Outbox sync requires a template',
    path: ['templateId'],
  });
export type CreateSyncConfigInput = z.infer<typeof createSyncConfigSchema>;

/** `connectionId` and `kind` are fixed after creation. */
export const updateSyncConfigSchema = z
  .object({
    name: nameField,
    description: descriptionField,
    querySql: queryField,
    columnMapping: columnMappingSchema.nullable(),
    pollIntervalSec: pollField,
    isActive: z.boolean(),
    templateId: z.string().uuid().nullable(),
    smtpConfigId: z.string().uuid().nullable(),
  })
  .partial()
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });
export type UpdateSyncConfigInput = z.infer<typeof updateSyncConfigSchema>;

export const queryPreviewInputSchema = z.object({
  connectionId: z.string().uuid(),
  kind: syncKindSchema,
  querySql: queryField,
  columnMapping: columnMappingSchema.nullable().default(null),
});
export type QueryPreviewInput = z.infer<typeof queryPreviewInputSchema>;

/** Who an outbox query would mail on its next run (preview only, nothing is enqueued). */
export const outboxPreviewSchema = z.object({
  /** Mails the next run would enqueue (new `erp_ref_id`s with a valid recipient). */
  newMails: z.number().int().nonnegative(),
  /** `erp_ref_id`s already in the queue for this connection; they will not be sent again. */
  alreadyQueued: z.number().int().nonnegative(),
  /** New mails not enqueued because every `to` address is on the suppression list. */
  suppressedMails: z.number().int().nonnegative(),
  /** Rows dropped for a duplicate `erp_ref_id` within the result. */
  duplicateRows: z.number().int().nonnegative(),
  /** Rows dropped for a missing id or a missing / invalid address. */
  invalidRows: z.number().int().nonnegative(),
  /**
   * Every address (to, cc or bcc) of the not-yet-queued mails with its mail count, most first.
   * `suppressed` addresses are on the suppression list and will not receive them.
   */
  recipients: z.array(
    z.object({
      email: z.string(),
      mails: z.number().int().positive(),
      suppressed: z.boolean(),
    }),
  ),
});
export type OutboxPreview = z.infer<typeof outboxPreviewSchema>;

export const queryPreviewResultSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.record(z.unknown())),
  rowCount: z.number().int().nonnegative(),
  missingColumns: z.array(z.string()),
  durationMs: z.number().int().nonnegative(),
  /** Set for outbox queries that have every required column; null otherwise. */
  outbox: outboxPreviewSchema.nullable(),
});
export type QueryPreviewResult = z.infer<typeof queryPreviewResultSchema>;

/** Response of "Sync now"; a failed run still returns 200 with `ok: false`. */
export const syncRunResponseSchema = z.object({
  ok: z.boolean(),
  result: syncRunResultSchema.nullable(),
  error: z.string().optional(),
});
export type SyncRunResponse = z.infer<typeof syncRunResponseSchema>;
