import type { SmtpConfig } from '@prisma/client';
import type { CryptoService } from '../common/crypto/crypto.service';
import { SmtpSendError, type MailerService } from '../mail/mailer.service';
import type { PrismaService } from '../prisma/prisma.service';
import { SmtpConfigsService } from './smtp-configs.service';

const now = new Date('2026-11-09T00:00:00Z');
const smtp: SmtpConfig = {
  id: 's1',
  name: 'Workspace',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  username: 'noreply@example.com',
  passwordEnc: 'enc:pw',
  fromName: 'ERP',
  fromEmail: 'noreply@example.com',
  dailyLimit: 2000,
  isDefault: true,
  lastTestAt: now,
  lastTestOk: true,
  createdAt: now,
  updatedAt: now,
};

function setup() {
  const tx = {
    smtpConfig: {
      updateMany: vi.fn(),
      create: vi.fn().mockResolvedValue(smtp),
      update: vi.fn().mockResolvedValue(smtp),
    },
  };
  const prisma = {
    smtpConfig: {
      findMany: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(smtp),
      count: vi.fn().mockResolvedValue(1),
      update: vi.fn(),
      delete: vi.fn(),
    },
    mailQueue: { count: vi.fn().mockResolvedValue(0) },
    erpSyncConfig: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const crypto = { encrypt: vi.fn((v: string) => `enc:${v}`) };
  const mailer = {
    send: vi.fn().mockResolvedValue({ messageId: '<m@x>', response: '250' }),
    verify: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn(),
  };
  const service = new SmtpConfigsService(
    prisma as unknown as PrismaService,
    crypto as unknown as CryptoService,
    mailer as unknown as MailerService,
  );
  return { prisma, tx, crypto, mailer, service };
}

const input = {
  name: 'Workspace',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  username: 'noreply@example.com',
  password: 'pw',
  fromName: 'ERP',
  fromEmail: 'noreply@example.com',
  dailyLimit: 2000,
  isDefault: false,
};

describe('SmtpConfigsService', () => {
  it('encrypts the password, never returns it and makes the first config default', async () => {
    const { prisma, tx, service } = setup();
    prisma.smtpConfig.count.mockResolvedValue(0);
    const dto = await service.create(input);
    const data = tx.smtpConfig.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ passwordEnc: 'enc:pw', isDefault: true });
    expect(data).not.toHaveProperty('password');
    expect(tx.smtpConfig.updateMany).toHaveBeenCalledWith({ data: { isDefault: false } });
    expect(dto).not.toHaveProperty('passwordEnc');
    expect(dto.hasPassword).toBe(true);
  });

  it('moves the default flag and resets the test on connection changes', async () => {
    const { tx, mailer, service } = setup();
    await service.update('s1', { isDefault: true, port: 465, secure: true });
    expect(tx.smtpConfig.updateMany).toHaveBeenCalledWith({
      where: { NOT: { id: 's1' } },
      data: { isDefault: false },
    });
    expect(tx.smtpConfig.update.mock.calls[0][0].data).toMatchObject({
      port: 465,
      lastTestAt: null,
      lastTestOk: null,
    });
    expect(mailer.invalidate).toHaveBeenCalledWith('s1');
  });

  it('refuses to unset the only default and to delete configs in use', async () => {
    const { prisma, service } = setup();
    await expect(service.update('s1', { isDefault: false })).rejects.toMatchObject({
      response: { code: 'SMTP_DEFAULT_REQUIRED' },
    });
    prisma.mailQueue.count.mockResolvedValue(2);
    await expect(service.remove('s1')).rejects.toMatchObject({
      response: { code: 'SMTP_IN_USE', details: { mails: 2, syncConfigs: 0 } },
    });
  });

  it('verifies or sends a test mail and records the outcome', async () => {
    const { prisma, mailer, service } = setup();
    await expect(service.test('s1', {})).resolves.toMatchObject({ ok: true });
    expect(mailer.verify).toHaveBeenCalled();

    const sent = await service.test('s1', { to: 'me@example.com' });
    expect(sent).toMatchObject({ ok: true, messageId: '<m@x>' });
    expect(mailer.send.mock.calls[0][1].to).toEqual(['me@example.com']);

    mailer.verify.mockRejectedValue(new SmtpSendError('535 bad credentials', false, 535));
    await expect(service.test('s1', {})).resolves.toMatchObject({
      ok: false,
      error: '535 bad credentials',
    });
    expect(prisma.smtpConfig.update.mock.calls.at(-1)?.[0].data.lastTestOk).toBe(false);
  });
});
