import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MailQueue, SmtpConfig } from '@prisma/client';
import type { WorkerEnv } from '../config/env';
import { MailerService, SmtpSendError } from '../mail/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { findSuppressed } from '../suppressions/suppressed';
import { backoffMs, startOfDayInZone, startOfNextDayInZone } from './time';

export type DeliveryOutcome = 'sent' | 'failed' | 'dead' | 'deferred' | 'skipped' | 'cancelled';

const NO_SMTP_RETRY_MS = 5 * 60_000;

/** Mails that may be sent at `now`: pending / failed and past their retry time. */
function dueWhere(now: Date) {
  return {
    status: { in: ['PENDING', 'FAILED'] as ('PENDING' | 'FAILED')[] },
    scheduledAt: { lte: now },
    OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
  };
}

/**
 * Sends one queued mail (DESIGN section 6): daily limit check → claim (PENDING/FAILED →
 * SENDING) → SMTP → SENT, or FAILED with backoff, or DEAD on a permanent error / last attempt.
 * Every transition is written to mail_logs.
 */
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);
  private readonly maxAttempts: number;
  private readonly timeZone: string;
  private readonly stuckMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    config: ConfigService<WorkerEnv, true>,
  ) {
    this.maxAttempts = config.get('SEND_MAX_ATTEMPTS', { infer: true });
    this.timeZone = config.get('MAIL_TIMEZONE', { infer: true });
    this.stuckMs = config.get('STUCK_SENDING_MIN', { infer: true }) * 60_000;
  }

  /** Ids of due mails, oldest first. */
  async findDue(limit: number, now = new Date()): Promise<string[]> {
    const rows = await this.prisma.mailQueue.findMany({
      where: dueWhere(now),
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
      take: limit,
    });
    return rows.map((r) => r.id);
  }

  async process(id: string, now = new Date()): Promise<DeliveryOutcome> {
    const mail = await this.prisma.mailQueue.findFirst({
      where: { id, ...dueWhere(now) },
      include: { smtpConfig: true },
    });
    if (!mail) return 'skipped';

    // Addresses may have been suppressed after the mail was queued.
    const suppressed = await findSuppressed(this.prisma, [
      ...mail.toAddrs,
      ...mail.cc,
      ...mail.bcc,
    ]);
    const keep = (list: string[]) => list.filter((a) => !suppressed.has(a.toLowerCase()));
    const recipients = { to: keep(mail.toAddrs), cc: keep(mail.cc), bcc: keep(mail.bcc) };
    if (recipients.to.length === 0) {
      const { count } = await this.prisma.mailQueue.updateMany({
        where: { id, ...dueWhere(now) },
        data: { status: 'CANCELLED', nextRetryAt: null },
      });
      if (count === 0) return 'skipped';
      await this.prisma.mailLog.create({
        data: {
          queueId: id,
          event: 'CANCELLED',
          detail: 'Every recipient is on the suppression list',
        },
      });
      return 'cancelled';
    }

    const smtp = mail.smtpConfig ?? (await this.defaultSmtp());
    if (!smtp) {
      await this.defer(mail, new Date(now.getTime() + NO_SMTP_RETRY_MS), 'No SMTP config');
      return 'deferred';
    }
    if (await this.dailyLimitReached(smtp, now)) {
      await this.defer(
        mail,
        startOfNextDayInZone(now, this.timeZone),
        `Daily limit of ${smtp.dailyLimit} reached for SMTP ${smtp.name}`,
      );
      return 'deferred';
    }

    const claimed = await this.prisma.mailQueue.updateMany({
      where: { id, ...dueWhere(now) },
      data: { status: 'SENDING', smtpConfigId: smtp.id },
    });
    if (claimed.count === 0) return 'skipped';
    await this.prisma.mailLog.create({
      data: { queueId: id, event: 'SENDING', detail: `Attempt ${mail.attempts + 1}` },
    });

    if (!mail.renderedSubject || mail.renderedHtml === null) {
      return this.fail(mail, now, new SmtpSendError('Rendered content is missing', true));
    }

    try {
      const sent = await this.mailer.send(smtp, {
        ...recipients,
        subject: mail.renderedSubject,
        html: mail.renderedHtml,
        text: mail.renderedText ?? '',
      });
      await this.prisma.mailQueue.update({
        where: { id },
        data: {
          status: 'SENT',
          attempts: { increment: 1 },
          sentAt: new Date(),
          messageId: sent.messageId,
          lastError: null,
          nextRetryAt: null,
          logs: { create: { event: 'SENT', smtpResponse: sent.response } },
        },
      });
      this.logger.log(`Mail ${id} sent`);
      return 'sent';
    } catch (err) {
      if (!(err instanceof SmtpSendError)) {
        // Unexpected bug: put it back so the stuck-recovery does not have to wait.
        await this.prisma.mailQueue.update({ where: { id }, data: { status: 'FAILED' } });
        throw err;
      }
      return this.fail(mail, now, err);
    }
  }

  /** SENDING items whose worker died go back to PENDING. */
  async recoverStuck(now = new Date()): Promise<number> {
    const stuck = await this.prisma.mailQueue.findMany({
      where: { status: 'SENDING', updatedAt: { lt: new Date(now.getTime() - this.stuckMs) } },
      select: { id: true },
    });
    for (const { id } of stuck) {
      const { count } = await this.prisma.mailQueue.updateMany({
        where: { id, status: 'SENDING' },
        data: { status: 'PENDING', nextRetryAt: null },
      });
      if (count > 0) {
        await this.prisma.mailLog.create({
          data: {
            queueId: id,
            event: 'RETRY',
            detail: 'Recovered from SENDING after worker interruption',
          },
        });
      }
    }
    if (stuck.length > 0) this.logger.warn(`Recovered ${stuck.length} mails stuck in SENDING`);
    return stuck.length;
  }

  private async fail(mail: MailQueue, now: Date, err: SmtpSendError): Promise<DeliveryOutcome> {
    const attempts = mail.attempts + 1;
    const dead = err.permanent || attempts >= this.maxAttempts;
    const nextRetryAt = dead ? null : new Date(now.getTime() + backoffMs(attempts));
    await this.prisma.mailQueue.update({
      where: { id: mail.id },
      data: {
        status: dead ? 'DEAD' : 'FAILED',
        attempts,
        lastError: err.message,
        nextRetryAt,
        logs: {
          create: [
            {
              event: 'FAILED',
              detail: dead
                ? `Attempt ${attempts} failed${err.permanent ? ' (permanent)' : ''}`
                : `Attempt ${attempts} failed, retry at ${nextRetryAt?.toISOString()}`,
              smtpResponse: err.message,
            },
            ...(dead
              ? [{ event: 'DEAD' as const, detail: `Gave up after ${attempts} attempt(s)` }]
              : []),
          ],
        },
      },
    });
    this.logger.warn(`Mail ${mail.id} ${dead ? 'dead' : 'failed'} (attempt ${attempts})`);
    return dead ? 'dead' : 'failed';
  }

  /** Postpones without counting an attempt; logs once per reason. */
  private async defer(mail: MailQueue, until: Date, reason: string): Promise<void> {
    await this.prisma.mailQueue.update({
      where: { id: mail.id },
      data: {
        nextRetryAt: until,
        lastError: reason,
        ...(mail.lastError !== reason
          ? {
              logs: {
                create: {
                  event: 'RETRY',
                  detail: `${reason}; postponed to ${until.toISOString()}`,
                },
              },
            }
          : {}),
      },
    });
  }

  private defaultSmtp(): Promise<SmtpConfig | null> {
    return this.prisma.smtpConfig.findFirst({ where: { isDefault: true } });
  }

  private async dailyLimitReached(smtp: SmtpConfig, now: Date): Promise<boolean> {
    const sentToday = await this.prisma.mailQueue.count({
      where: {
        smtpConfigId: smtp.id,
        status: 'SENT',
        sentAt: { gte: startOfDayInZone(now, this.timeZone) },
      },
    });
    return sentToday >= smtp.dailyLimit;
  }
}
