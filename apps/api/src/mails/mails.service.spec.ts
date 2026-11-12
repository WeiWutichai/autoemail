import type { ConfigService } from '@nestjs/config';
import type { BaseEnv } from '../config/env';
import type { PrismaService } from '../prisma/prisma.service';
import { MailsService } from './mails.service';

const now = new Date('2026-11-09T05:00:00Z');

function setup() {
  const mail = {
    id: 'q1',
    createdAt: now,
    scheduledAt: now,
    sentAt: null,
    nextRetryAt: null,
    status: 'DEAD',
    attempts: 5,
    toAddrs: ['a@x.com'],
    cc: [],
    bcc: [],
    renderedSubject: 'PR 1',
    renderedHtml: null,
    renderedText: null,
    erpRefId: 'PR:1:a@x.com',
    templateVersion: 1,
    messageId: null,
    lastError: '550',
    connection: { name: 'ERP' },
    template: { code: 'pr' },
    smtpConfig: null,
    logs: [{ id: 'l1', event: 'DEAD', detail: null, smtpResponse: null, createdAt: now }],
  };
  const prisma = {
    mailQueue: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(mail),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([{ smtpConfigId: 's1', _count: { _all: 7 } }]),
    },
    mailLog: { count: vi.fn().mockResolvedValue(2) },
    smtpConfig: {
      findMany: vi.fn().mockResolvedValue([
        { id: 's1', name: 'Workspace', dailyLimit: 2000, isDefault: true },
        { id: 's2', name: 'Backup', dailyLimit: 500, isDefault: false },
      ]),
    },
  };
  const config = { get: () => 'Asia/Bangkok' } as unknown as ConfigService<BaseEnv, true>;
  return { prisma, mail, service: new MailsService(prisma as unknown as PrismaService, config) };
}

describe('MailsService', () => {
  it('builds filters for status, connection, dates and search', async () => {
    const { prisma, service } = setup();
    await service.list({
      page: 2,
      pageSize: 10,
      status: 'DEAD',
      connectionId: 'c1',
      from: new Date('2026-11-01'),
      q: 'Buyer@X.com',
    });
    const args = prisma.mailQueue.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      status: 'DEAD',
      connectionId: 'c1',
      createdAt: { gte: new Date('2026-11-01') },
    });
    expect(args.where.OR[0]).toEqual({ toAddrs: { has: 'buyer@x.com' } });
    expect(args.skip).toBe(10);
  });

  it('expands the WAITING filter to every not-yet-sent status', async () => {
    const { prisma, service } = setup();
    await service.list({ page: 1, pageSize: 10, status: 'WAITING' });
    expect(prisma.mailQueue.findMany.mock.calls[0][0].where.status).toEqual({
      in: ['PENDING', 'SENDING', 'FAILED'],
    });
  });

  it('returns detail with logs and flags removed content', async () => {
    const { service } = setup();
    const detail = await service.get('q1');
    expect(detail).toMatchObject({
      contentRemoved: true,
      templateCode: 'pr',
      connectionName: 'ERP',
    });
    expect(detail.logs[0]).toMatchObject({ event: 'DEAD' });
  });

  it('retries DEAD mails with a fresh attempt budget and logs who did it', async () => {
    const { prisma, service } = setup();
    await service.retry('q1', 'admin@x.com');
    expect(prisma.mailQueue.updateMany.mock.calls[0][0].where).toEqual({
      id: 'q1',
      status: { in: ['FAILED', 'DEAD'] },
    });
    expect(prisma.mailQueue.update.mock.calls[0][0].data).toMatchObject({
      status: 'PENDING',
      attempts: 0,
      logs: { create: { event: 'RETRY', detail: 'Manual retry by admin@x.com' } },
    });
  });

  it('refuses transitions from the wrong state', async () => {
    const { prisma, service } = setup();
    prisma.mailQueue.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.cancel('q1', 'admin@x.com')).rejects.toMatchObject({
      response: { code: 'MAIL_STATE_CONFLICT', details: { status: 'DEAD' } },
    });
    prisma.mailQueue.findUnique.mockResolvedValue(null);
    await expect(service.retry('q9', 'a')).rejects.toMatchObject({
      response: { code: 'MAIL_NOT_FOUND' },
    });
  });

  it('computes dashboard numbers since local midnight with per-SMTP quotas', async () => {
    const { prisma, service } = setup();
    const stats = await service.stats(now);
    expect(stats.since).toBe('2026-11-08T17:00:00.000Z');
    expect(stats.failedToday).toBe(2);
    expect(stats.quotas).toEqual([
      { smtpConfigId: 's1', name: 'Workspace', used: 7, limit: 2000, isDefault: true },
      { smtpConfigId: 's2', name: 'Backup', used: 0, limit: 500, isDefault: false },
    ]);
    expect(prisma.mailQueue.count.mock.calls[0][0].where.sentAt.gte.toISOString()).toBe(
      '2026-11-08T17:00:00.000Z',
    );
  });
});
