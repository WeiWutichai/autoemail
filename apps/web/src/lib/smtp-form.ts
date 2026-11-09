import {
  createSmtpConfigSchema,
  updateSmtpConfigSchema,
  type CreateSmtpConfigInput,
  type SmtpConfigDto,
  type UpdateSmtpConfigInput,
} from '@erp-mail/shared';

export interface SmtpForm {
  name: string;
  host: string;
  port: string;
  secure: boolean;
  username: string;
  /** Empty while editing = keep the stored password. */
  password: string;
  fromName: string;
  fromEmail: string;
  dailyLimit: string;
  isDefault: boolean;
}

export type FormResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Google Workspace with an App Password: smtp.gmail.com:587 + STARTTLS. */
export function emptySmtpForm(): SmtpForm {
  return {
    name: 'Google Workspace',
    host: 'smtp.gmail.com',
    port: '587',
    secure: false,
    username: '',
    password: '',
    fromName: 'ERP Mail Relay',
    fromEmail: '',
    dailyLimit: '2000',
    isDefault: false,
  };
}

export function formFromSmtp(smtp: SmtpConfigDto): SmtpForm {
  return {
    name: smtp.name,
    host: smtp.host,
    port: String(smtp.port),
    secure: smtp.secure,
    username: smtp.username ?? '',
    password: '',
    fromName: smtp.fromName,
    fromEmail: smtp.fromEmail,
    dailyLimit: String(smtp.dailyLimit),
    isDefault: smtp.isDefault,
  };
}

const FIELD_ERRORS: Record<string, string> = {
  name: 'กรุณากรอกชื่อ',
  host: 'Host ไม่ถูกต้อง',
  port: 'Port ต้องเป็นตัวเลข 1–65535',
  username: 'Username ไม่ถูกต้อง',
  password: 'กรุณากรอกรหัสผ่าน',
  fromName: 'กรุณากรอกชื่อผู้ส่ง',
  fromEmail: 'อีเมลผู้ส่งไม่ถูกต้อง',
  dailyLimit: 'เพดานต่อวันต้องเป็นตัวเลขอย่างน้อย 1',
};

function firstError(issues: { path: (string | number)[] }[]): string {
  return FIELD_ERRORS[String(issues[0]?.path[0] ?? '')] ?? 'ข้อมูลไม่ถูกต้อง';
}

function toPayload(form: SmtpForm) {
  return {
    name: form.name,
    host: form.host,
    port: Number(form.port),
    secure: form.secure,
    username: form.username.trim() || null,
    fromName: form.fromName,
    fromEmail: form.fromEmail,
    dailyLimit: Number(form.dailyLimit),
    isDefault: form.isDefault,
  };
}

/** Gmail shows App Passwords as "abcd efgh ijkl mnop"; spaces are not part of it. */
export function normalizeAppPassword(password: string): string {
  return /^[a-z]{4}( [a-z]{4}){3}$/.test(password.trim()) ? password.replace(/ /g, '') : password;
}

export function toCreateSmtpInput(form: SmtpForm): FormResult<CreateSmtpConfigInput> {
  const parsed = createSmtpConfigSchema.safeParse({
    ...toPayload(form),
    password: form.password ? normalizeAppPassword(form.password) : undefined,
  });
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: firstError(parsed.error.issues) };
}

export function toUpdateSmtpInput(
  form: SmtpForm,
  original: SmtpConfigDto,
): FormResult<UpdateSmtpConfigInput | null> {
  const payload = toPayload(form);
  const candidate: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    const before = original[key as keyof typeof payload];
    const same = typeof value === 'string' ? value.trim() === before : value === before;
    if (!same) candidate[key] = value;
  }
  if (form.password) candidate.password = normalizeAppPassword(form.password);
  if (Object.keys(candidate).length === 0) return { ok: true, data: null };
  const parsed = updateSmtpConfigSchema.safeParse(candidate);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: firstError(parsed.error.issues) };
}
