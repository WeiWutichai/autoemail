import { z } from 'zod';

export const smtpConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  host: z.string(),
  port: z.number().int(),
  secure: z.boolean(),
  username: z.string().nullable(),
  hasPassword: z.boolean(),
  fromName: z.string(),
  fromEmail: z.string(),
  dailyLimit: z.number().int(),
  isDefault: z.boolean(),
  lastTestAt: z.string().nullable(),
  lastTestOk: z.boolean().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SmtpConfigDto = z.infer<typeof smtpConfigSchema>;

const nameField = z.string().trim().min(1).max(100);
const hostField = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9.\-:[\]]+$/, 'Invalid host');
const portField = z.number().int().min(1).max(65535);
const usernameField = z.string().trim().min(1).max(320);
const passwordField = z.string().min(1).max(256);
const fromNameField = z.string().trim().min(1).max(100);
const fromEmailField = z.string().trim().toLowerCase().email().max(320);
const dailyLimitField = z.number().int().min(1).max(1_000_000);

export const createSmtpConfigSchema = z.object({
  name: nameField,
  host: hostField,
  port: portField,
  /** true = implicit TLS (465); false = STARTTLS when offered (587). */
  secure: z.boolean().default(false),
  username: usernameField.nullable().default(null),
  password: passwordField.optional(),
  fromName: fromNameField,
  fromEmail: fromEmailField,
  dailyLimit: dailyLimitField.default(2000),
  isDefault: z.boolean().default(false),
});
export type CreateSmtpConfigInput = z.infer<typeof createSmtpConfigSchema>;

/** Omitting `password` keeps the stored one. */
export const updateSmtpConfigSchema = z
  .object({
    name: nameField,
    host: hostField,
    port: portField,
    secure: z.boolean(),
    username: usernameField.nullable(),
    password: passwordField,
    fromName: fromNameField,
    fromEmail: fromEmailField,
    dailyLimit: dailyLimitField,
    isDefault: z.boolean(),
  })
  .partial()
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });
export type UpdateSmtpConfigInput = z.infer<typeof updateSmtpConfigSchema>;

/** Verifies login; with `to`, also sends a short test message. */
export const testSmtpInputSchema = z.object({
  to: z.string().trim().toLowerCase().email().max(320).optional(),
});
export type TestSmtpInput = z.infer<typeof testSmtpInputSchema>;

export const testSmtpResultSchema = z.object({
  ok: z.boolean(),
  testedAt: z.string(),
  latencyMs: z.number().int().nonnegative(),
  messageId: z.string().optional(),
  error: z.string().optional(),
});
export type TestSmtpResult = z.infer<typeof testSmtpResultSchema>;
