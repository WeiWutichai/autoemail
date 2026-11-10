import { z } from 'zod';

export const DB_TYPES = ['MSSQL', 'ORACLE', 'MYSQL', 'POSTGRES'] as const;
export const dbTypeSchema = z.enum(DB_TYPES);
export type DbType = z.infer<typeof dbTypeSchema>;

export const DEFAULT_PORTS: Record<DbType, number> = {
  MSSQL: 1433,
  ORACLE: 1521,
  MYSQL: 3306,
  POSTGRES: 5432,
};

export const erpConnectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  dbType: dbTypeSchema,
  host: z.string(),
  port: z.number().int(),
  database: z.string(),
  username: z.string(),
  hasPassword: z.boolean(),
  ssl: z.boolean(),
  trustServerCert: z.boolean(),
  isActive: z.boolean(),
  lastTestAt: z.string().nullable(),
  lastTestOk: z.boolean().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ErpConnectionDto = z.infer<typeof erpConnectionSchema>;

const nameField = z.string().trim().min(1).max(100);
/** `SERVER\INSTANCE` is allowed for SQL Server named instances. */
const hostField = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9._:\-\\[\]]+$/, 'Invalid host');
const portField = z.number().int().min(1).max(65535);
const databaseField = z.string().trim().min(1).max(128);
const usernameField = z.string().trim().min(1).max(128);
const passwordField = z.string().min(1).max(256);

export const createErpConnectionSchema = z.object({
  name: nameField,
  dbType: dbTypeSchema,
  host: hostField,
  port: portField,
  database: databaseField,
  username: usernameField,
  password: passwordField.optional(),
  ssl: z.boolean().default(false),
  trustServerCert: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type CreateErpConnectionInput = z.infer<typeof createErpConnectionSchema>;

/** Omitting `password` keeps the stored one. */
export const updateErpConnectionSchema = z
  .object({
    name: nameField,
    dbType: dbTypeSchema,
    host: hostField,
    port: portField,
    database: databaseField,
    username: usernameField,
    password: passwordField,
    ssl: z.boolean(),
    trustServerCert: z.boolean(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });
export type UpdateErpConnectionInput = z.infer<typeof updateErpConnectionSchema>;

/**
 * Tests settings from the connection dialog before saving. Without `password`, the stored
 * password of `connectionId` is used (editing an existing connection).
 */
export const testErpConnectionDraftSchema = z.object({
  connectionId: z.string().uuid().optional(),
  dbType: dbTypeSchema,
  host: hostField,
  port: portField,
  database: databaseField,
  username: usernameField,
  password: passwordField.optional(),
  ssl: z.boolean().default(false),
  trustServerCert: z.boolean().default(false),
});
export type TestErpConnectionDraftInput = z.infer<typeof testErpConnectionDraftSchema>;

export const testConnectionResultSchema = z.object({
  ok: z.boolean(),
  testedAt: z.string(),
  latencyMs: z.number().int().nonnegative(),
  error: z.string().optional(),
});
export type TestConnectionResult = z.infer<typeof testConnectionResultSchema>;
