import type { ConfigService } from '@nestjs/config';
import type { MailQueue, SmtpConfig } from '@prisma/client';
import type { WorkerEnv } from '../config/env';
import { SmtpSendError, type MailerService } from '../mail/mailer.service';
import type { PrismaService } from '../prisma/prisma.service';
import { DeliveryService } from './delivery.service';

const now = new Date('2026-11-09T05:00:00Z');
const smtp = { id: 's1', name: 'Workspace', dailyLimit: 2000, isDefault: true } as SmtpConfig;
const mail = {
  id: 'q1',
  toAddrs: ['buyer@example.com'],
  cc: [],
  bcc: [],
  renderedSubject: 'PR PR-1',
  renderedHtml: '<p>x</p>',
  renderedText: 'x',
  attempts: 0,
  lastError: null,
  smtpConfig: null,
} as unknown as MailQueue & { smtpConfig: SmtpConfig | null };

function setup(overrides: Partial<typeof mail> = {}) {
  const prisma = {
    mailQueue: {
      findFirst: vi.fn().mockResolvedValue({ ...mail, ...overrides }),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    mailLog: { create: vi.fn() },
    smtpConfig: { findFirst: vi.fn().mockResolvedValue(smtp) },
  };
  const mailer = { send: vi.fn().mockResolvedValue({ messageId: '<m@x>', response: '250 OK' }) };
  const config = {
    get: (key: keyof WorkerEnv) =>
      ({ SEND_MAX_ATTEMPTS: 3, MAIL_TIMEZONE: 'Asia/Bangkok', STUCK_SENDING_MIN: 10 })[
        key as string
      ],
  } as unknown as ConfigService<WorkerEnv, true>;
  const service = new DeliveryService(
    prisma as unknown as PrismaService,
    mailer as unknown as MailerService,
    config,
  );
  return { prisma, mailer, service };
}

const lastUpdate = (prisma: ReturnType<typeof setup>['prisma']) =>
  prisma.mailQueue.update.mock.calls.at(-1)?.[0].data;

describe('DeliveryService.process', () => {
  it('claims, sends with the default SMTP and marks SENT', async () => {
    const { prisma, mailer, service } = setup();
    await expect(service.process('q1', now)).resolves.toBe('sent');
    expect(prisma.mailQueue.updateMany.mock.calls[0][0].data).toEqual({
      status: 'SENDING',
      smtpConfigId: 's1',
    });
    expect(prisma.mailLog.create.mock.calls[0][0].data).toMatchObject({ event: 'SENDING' });
    expect(mailer.send).toHaveBeenCalledWith(
      smtp,
      expect.objectContaining({ to: ['buyer@example.com'] }),
    );
    expect(lastUpdate(prisma)).toMatchObject({
      status: 'SENT',
      messageId: '<m@x>',
      logs: { create: { event: 'SENT', smtpResponse: '250 OK' } },
    });
  });

  it('skips mails that are not due or were claimed by someone else', async () => {
    const { prisma, mailer, service } = setup();
    prisma.mailQueue.findFirst.mockResolvedValueOnce(null);
    await expect(service.process('q1', now)).resolves.toBe('skipped');
    prisma.mailQueue.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.process('q1', now)).resolves.toBe('skipped');
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('schedules a retry with backoff on a temporary error', async () => {
    const { prisma, mailer, service } = setup({ attempts: 1 });
    mailer.send.mockRejectedValue(new SmtpSendError('421 try later', false, 421));
    await expect(service.process('q1', now)).resolves.toBe('failed');
    const data = lastUpdate(prisma);
    expect(data).toMatchObject({ status: 'FAILED', attempts: 2, lastError: '421 try later' });
    expect(data.nextRetryAt.toISOString()).toBe('2026-11-09T05:05:00.000Z');
    expect(data.logs.create).toHaveLength(1);
  });

  it('goes DEAD on a permanent error or the last attempt', async () => {
    const { prisma, mailer, service } = setup();
    mailer.send.mockRejectedValueOnce(new SmtpSendError('550 no such user', true, 550));
    await expect(service.process('q1', now)).resolves.toBe('dead');
    expect(lastUpdate(prisma)).toMatchObject({ status: 'DEAD', attempts: 1, nextRetryAt: null });
    expect(lastUpdate(prisma).logs.create.map((l: { event: string }) => l.event)).toEqual([
      'FAILED',
      'DEAD',
    ]);

    prisma.mailQueue.findFirst.mockResolvedValueOnce({ ...mail, attempts: 2 });
    mailer.send.mockRejectedValueOnce(new SmtpSendError('timeout', false));
    await expect(service.process('q1', now)).resolves.toBe('dead');
  });

  it('defers to the next local day when the daily limit is reached', async () => {
    const { prisma, mailer, service } = setup();
    prisma.mailQueue.count.mockResolvedValue(2000);
    await expect(service.process('q1', now)).resolves.toBe('deferred');
    expect(mailer.send).not.toHaveBeenCalled();
    const data = lastUpdate(prisma);
    expect(data.nextRetryAt.toISOString()).toBe('2026-11-09T17:00:00.000Z');
    expect(data.logs.create.event).toBe('RETRY');
    expect(prisma.mailQueue.count.mock.calls[0][0].where.sentAt.gte.toISOString()).toBe(
      '2026-11-08T17:00:00.000Z',
    );
  });

  it('defers without SMTP config and logs the reason only once', async () => {
    const { prisma, service } = setup({ lastError: 'No SMTP config' });
    prisma.smtpConfig.findFirst.mockResolvedValue(null);
    await expect(service.process('q1', now)).resolves.toBe('deferred');
    expect(lastUpdate(prisma)).not.toHaveProperty('logs');
  });
});

describe('DeliveryService.recoverStuck', () => {
  it('moves old SENDING items back to PENDING', async () => {
    const { prisma, service } = setup();
    prisma.mailQueue.findMany.mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);
    prisma.mailQueue.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await expect(service.recoverStuck(now)).resolves.toBe(2);
    expect(prisma.mailQueue.findMany.mock.calls[0][0].where.updatedAt.lt.toISOString()).toBe(
      '2026-11-09T04:50:00.000Z',
    );
    expect(prisma.mailLog.create).toHaveBeenCalledTimes(1);
  });
});
