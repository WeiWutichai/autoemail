import { z } from 'zod';

/** Sample data used for preview / test send (template variables by name). */
export const templateVariablesSchema = z.record(z.unknown());
export type TemplateVariables = z.infer<typeof templateVariablesSchema>;

export const mailTemplateSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  subjectTpl: z.string(),
  bodyHtmlTpl: z.string(),
  bodyTextTpl: z.string().nullable(),
  sampleVariables: templateVariablesSchema.nullable(),
  isActive: z.boolean(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MailTemplateDto = z.infer<typeof mailTemplateSchema>;

export const mailTemplateVersionSchema = z.object({
  version: z.number().int(),
  subjectTpl: z.string(),
  bodyHtmlTpl: z.string(),
  bodyTextTpl: z.string().nullable(),
  createdAt: z.string(),
});
export type MailTemplateVersionDto = z.infer<typeof mailTemplateVersionSchema>;

const codeField = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use lower-case letters, digits, _ or -');
const nameField = z.string().trim().min(1).max(100);
const subjectField = z.string().trim().min(1).max(500);
const htmlField = z.string().min(1).max(200_000);
const textField = z.string().max(100_000);

export const createMailTemplateSchema = z.object({
  code: codeField,
  name: nameField,
  subjectTpl: subjectField,
  bodyHtmlTpl: htmlField,
  bodyTextTpl: textField.nullable().default(null),
  sampleVariables: templateVariablesSchema.nullable().default(null),
  isActive: z.boolean().default(true),
});
export type CreateMailTemplateInput = z.infer<typeof createMailTemplateSchema>;

/** Changing subject / body creates a new version; `code` is fixed after creation. */
export const updateMailTemplateSchema = z
  .object({
    name: nameField,
    subjectTpl: subjectField,
    bodyHtmlTpl: htmlField,
    bodyTextTpl: textField.nullable(),
    sampleVariables: templateVariablesSchema.nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });
export type UpdateMailTemplateInput = z.infer<typeof updateMailTemplateSchema>;

export const renderTemplateInputSchema = z.object({
  subjectTpl: z.string().max(500),
  bodyHtmlTpl: z.string().max(200_000),
  bodyTextTpl: z.string().max(100_000).nullable().default(null),
  variables: templateVariablesSchema.default({}),
});
export type RenderTemplateInput = z.infer<typeof renderTemplateInputSchema>;

export const renderedMailSchema = z.object({
  subject: z.string(),
  html: z.string(),
  text: z.string(),
});
export type RenderedMail = z.infer<typeof renderedMailSchema>;

export const testSendInputSchema = z.object({
  to: z.string().trim().toLowerCase().email().max(320),
  variables: templateVariablesSchema.default({}),
  /** Defaults to the default SMTP config. */
  smtpConfigId: z.string().uuid().optional(),
});
export type TestSendInput = z.infer<typeof testSendInputSchema>;

export const testSendResultSchema = z.object({
  ok: z.boolean(),
  queueId: z.string().uuid(),
  messageId: z.string().optional(),
  error: z.string().optional(),
});
export type TestSendResult = z.infer<typeof testSendResultSchema>;
