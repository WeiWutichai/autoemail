import { createSmtpConfigSchema, updateSmtpConfigSchema } from './smtp';
import {
  createMailTemplateSchema,
  renderTemplateInputSchema,
  testSendInputSchema,
} from './templates';

describe('smtp schemas', () => {
  it('applies Gmail-friendly defaults and normalizes the sender', () => {
    const parsed = createSmtpConfigSchema.parse({
      name: 'Workspace',
      host: 'smtp.gmail.com',
      port: 587,
      username: 'noreply@example.com',
      password: 'abcd efgh ijkl mnop',
      fromName: 'ERP',
      fromEmail: 'NoReply@Example.com',
    });
    expect(parsed).toMatchObject({
      secure: false,
      dailyLimit: 2000,
      isDefault: false,
      fromEmail: 'noreply@example.com',
    });
  });

  it('rejects empty updates and bad hosts', () => {
    expect(updateSmtpConfigSchema.safeParse({}).success).toBe(false);
    expect(updateSmtpConfigSchema.safeParse({ host: 'smtp gmail' }).success).toBe(false);
  });
});

describe('template schemas', () => {
  it('validates the code format', () => {
    const base = { name: 'PR', subjectTpl: 'x', bodyHtmlTpl: '<p>x</p>' };
    expect(createMailTemplateSchema.safeParse({ ...base, code: 'pr_pending' }).success).toBe(true);
    expect(createMailTemplateSchema.safeParse({ ...base, code: 'PR Pending' }).success).toBe(false);
  });

  it('defaults render variables and requires a test recipient', () => {
    expect(
      renderTemplateInputSchema.parse({ subjectTpl: 'a', bodyHtmlTpl: 'b' }).variables,
    ).toEqual({});
    expect(testSendInputSchema.safeParse({ variables: {} }).success).toBe(false);
  });
});
