import type { SmtpConfigDto } from '@erp-mail/shared';
import {
  emptySmtpForm,
  formFromSmtp,
  normalizeAppPassword,
  toCreateSmtpInput,
  toUpdateSmtpInput,
} from './smtp-form';

const smtp: SmtpConfigDto = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Google Workspace',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  username: 'noreply@example.com',
  hasPassword: true,
  fromName: 'ERP',
  fromEmail: 'noreply@example.com',
  dailyLimit: 2000,
  isDefault: true,
  lastTestAt: null,
  lastTestOk: null,
  createdAt: '',
  updatedAt: '',
};

describe('smtp form', () => {
  it('strips spaces from Gmail app passwords only', () => {
    expect(normalizeAppPassword('abcd efgh ijkl mnop')).toBe('abcdefghijklmnop');
    expect(normalizeAppPassword('my pass word')).toBe('my pass word');
  });

  it('builds a create payload with Gmail defaults', () => {
    const res = toCreateSmtpInput({
      ...emptySmtpForm(),
      username: 'noreply@example.com',
      password: 'abcd efgh ijkl mnop',
      fromEmail: 'noreply@example.com',
    });
    expect(res).toMatchObject({
      ok: true,
      data: { host: 'smtp.gmail.com', port: 587, secure: false, password: 'abcdefghijklmnop' },
    });
    expect(toCreateSmtpInput({ ...emptySmtpForm(), fromEmail: 'nope' })).toEqual({
      ok: false,
      error: 'อีเมลผู้ส่งไม่ถูกต้อง',
    });
  });

  it('sends only changed fields on update and keeps the password when empty', () => {
    const form = formFromSmtp(smtp);
    expect(toUpdateSmtpInput(form, smtp)).toEqual({ ok: true, data: null });
    expect(toUpdateSmtpInput({ ...form, dailyLimit: '500', password: 'new' }, smtp)).toEqual({
      ok: true,
      data: { dailyLimit: 500, password: 'new' },
    });
  });
});
