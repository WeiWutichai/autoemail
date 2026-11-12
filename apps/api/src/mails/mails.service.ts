import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  MailDetailDto,
  MailListQuery,
  MailStatsDto,
  MailSummaryDto,
  Paginated,
} from '@erp-mail/shared';
import { WAITING_MAIL_STATUSES } from '@erp-mail/shared';
import type { MailLog, MailQueue, Prisma } from '@prisma/client';
import type { BaseEnv } from '../config/env';
import { startOfDayInZone } from '../delivery/time';
import { PrismaService } from '../prisma/prisma.service';

const SUMMARY_INCLUDE = {
  connection: { select: { name: true } },
  template: { select: { code: true } },
  smtpConfig: { select: { name: true } },
} as const;

type MailWithRefs = MailQueue & {
  connection: { name: string } | null;
  template: { code: string } | null;
  smtpConfig: { name: string } | null;
};

const iso = (d: Date | null) => d?.toISOString() ?? null;

function toSummary(m: MailWithRefs): MailSummaryDto {
  return {
    id: m.id,
    createdAt: m.createdAt.toISOString(),
    scheduledAt: m.scheduledAt.toISOString(),
    sentAt: iso(m.sentAt),
    nextRetryAt: iso(m.nextRetryAt),
    status: m.status,
    attempts: m.attempts,
    toAddrs: m.toAddrs,
    subject: m.renderedSubject,
    erpRefId: m.erpRefId,
    connectionName: m.connection?.name ?? null,
    templateCode: m.template?.code ?? null,
    templateVersion: m.templateVersion,
    smtpConfigName: m.smtpConfig?.name ?? null,
    messageId: m.messageId,
    lastError: m.lastError,
  };
}

/** Admin view of mail_queue / mail_logs: list, detail, retry, cancel, dashboard numbers. */
@Injectable()
export class MailsService {
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<BaseEnv, true>,
  ) {
    this.timeZone = config.get('MAIL_TIMEZONE', { infer: true });
  }

  async list(query: MailListQuery): Promise<Paginated<MailSummaryDto>> {
    const q = query.q;
    const where: Prisma.MailQueueWhereInput = {
      ...(query.status === 'WAITING'
        ? { status: { in: [...WAITING_MAIL_STATUSES] } }
        : query.status
          ? { status: query.status }
          : {}),
      ...(query.connectionId ? { connectionId: query.connectionId } : {}),
      ...(query.templateId ? { templateId: query.templateId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lt: query.to } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { toAddrs: { has: q.toLowerCase() } },
              { erpRefId: { contains: q, mode: 'insensitive' } },
              { renderedSubject: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.mailQueue.count({ where }),
      this.prisma.mailQueue.findMany({
        where,
        include: SUMMARY_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toSummary), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<MailDetailDto> {
    const mail = await this.prisma.mailQueue.findUnique({
      where: { id },
      include: { ...SUMMARY_INCLUDE, logs: { orderBy: { createdAt: 'asc' } } },
    });
    if (!mail) throw this.notFound();
    return {
      ...toSummary(mail),
      cc: mail.cc,
      bcc: mail.bcc,
      html: mail.renderedHtml,
      text: mail.renderedText,
      contentRemoved: mail.renderedHtml === null,
      logs: mail.logs.map((l: MailLog) => ({
        id: l.id,
        event: l.event,
        detail: l.detail,
        smtpResponse: l.smtpResponse,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  }

  /** FAILED / DEAD → PENDING with a fresh attempt budget. */
  async retry(id: string, adminEmail: string): Promise<MailDetailDto> {
    await this.transition(id, ['FAILED', 'DEAD'], {
      status: 'PENDING',
      attempts: 0,
      nextRetryAt: null,
      scheduledAt: new Date(),
      logs: { create: { event: 'RETRY', detail: `Manual retry by ${adminEmail}` } },
    });
    return this.get(id);
  }

  /** PENDING / FAILED → CANCELLED (never sent). */
  async cancel(id: string, adminEmail: string): Promise<MailDetailDto> {
    await this.transition(id, ['PENDING', 'FAILED'], {
      status: 'CANCELLED',
      nextRetryAt: null,
      logs: { create: { event: 'CANCELLED', detail: `Cancelled by ${adminEmail}` } },
    });
    return this.get(id);
  }

  async stats(now = new Date()): Promise<MailStatsDto> {
    const since = startOfDayInZone(now, this.timeZone);
    const [sentToday, failedToday, waiting, dead, smtpConfigs, sentBySmtp] = await Promise.all([
      this.prisma.mailQueue.count({ where: { status: 'SENT', sentAt: { gte: since } } }),
      this.prisma.mailLog.count({ where: { event: 'FAILED', createdAt: { gte: since } } }),
      this.prisma.mailQueue.count({ where: { status: { in: [...WAITING_MAIL_STATUSES] } } }),
      this.prisma.mailQueue.count({ where: { status: 'DEAD' } }),
      this.prisma.smtpConfig.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
      this.prisma.mailQueue.groupBy({
        by: ['smtpConfigId'],
        where: { status: 'SENT', sentAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);
    const used = new Map(sentBySmtp.map((g) => [g.smtpConfigId, g._count._all]));
    return {
      since: since.toISOString(),
      sentToday,
      failedToday,
      waiting,
      dead,
      quotas: smtpConfigs.map((s) => ({
        smtpConfigId: s.id,
        name: s.name,
        used: used.get(s.id) ?? 0,
        limit: s.dailyLimit,
        isDefault: s.isDefault,
      })),
    };
  }

  private async transition(
    id: string,
    from: MailQueue['status'][],
    data: Prisma.MailQueueUpdateInput,
  ): Promise<void> {
    const mail = await this.prisma.mailQueue.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!mail) throw this.notFound();
    // Conditional update so a mail that changed state meanwhile (e.g. got sent) is not touched.
    const { count } = await this.prisma.mailQueue.updateMany({
      where: { id, status: { in: from } },
      data: { status: data.status as MailQueue['status'] },
    });
    if (count === 0) {
      throw new ConflictException({
        code: 'MAIL_STATE_CONFLICT',
        message: `Mail is ${mail.status}; allowed from ${from.join(' / ')}`,
        details: { status: mail.status },
      });
    }
    await this.prisma.mailQueue.update({ where: { id }, data });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'MAIL_NOT_FOUND', message: 'Mail not found' });
  }
}
