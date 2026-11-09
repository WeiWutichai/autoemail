import { Injectable, Logger } from '@nestjs/common';
import type { PdpaEraseResult } from '@erp-mail/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const ERASED_ADDRESS = 'erased@invalid';

/**
 * Personal-data housekeeping (DESIGN section 7):
 * - erase(): PDPA request — removes a person's contact rows and the content of mails sent to them.
 * - purgeOldContent(): retention — removes rendered content of finished mails older than N days.
 * mail_queue rows themselves are kept (status, dates, erp_ref_id) so a document is never re-sent.
 */
@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async erase(email: string): Promise<PdpaEraseResult> {
    const address = email.toLowerCase();
    const { count: contactsDeleted } = await this.prisma.contact.deleteMany({
      where: { email: address },
    });
    const mails = await this.prisma.mailQueue.findMany({
      where: {
        OR: [{ toAddrs: { has: address } }, { cc: { has: address } }, { bcc: { has: address } }],
      },
      select: { id: true, status: true, toAddrs: true, cc: true, bcc: true },
    });

    const replace = (list: string[]) => list.map((a) => (a === address ? ERASED_ADDRESS : a));
    for (const mail of mails) {
      const unsent = mail.status === 'PENDING' || mail.status === 'FAILED';
      await this.prisma.$transaction([
        this.prisma.mailQueue.update({
          where: { id: mail.id },
          data: {
            toAddrs: replace(mail.toAddrs),
            cc: replace(mail.cc),
            bcc: replace(mail.bcc),
            renderedSubject: null,
            renderedHtml: null,
            renderedText: null,
            variables: Prisma.DbNull,
            ...(unsent
              ? {
                  status: 'CANCELLED',
                  nextRetryAt: null,
                  logs: {
                    create: { event: 'CANCELLED', detail: 'Cancelled by PDPA erase request' },
                  },
                }
              : {}),
          },
        }),
        this.prisma.mailLog.updateMany({
          where: { queueId: mail.id },
          data: { smtpResponse: null },
        }),
      ]);
    }
    this.logger.log(`PDPA erase: contacts=${contactsDeleted} mails=${mails.length}`);
    return { contactsDeleted, mailsScrubbed: mails.length };
  }

  /** Clears content of SENT / DEAD / CANCELLED mails created before `days` ago. */
  async purgeOldContent(days: number, now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - days * 86_400_000);
    const { count } = await this.prisma.mailQueue.updateMany({
      where: {
        createdAt: { lt: before },
        status: { in: ['SENT', 'DEAD', 'CANCELLED'] },
        renderedHtml: { not: null },
      },
      data: { renderedHtml: null, renderedText: null, variables: Prisma.DbNull },
    });
    await this.prisma.mailLog.updateMany({
      where: { createdAt: { lt: before }, smtpResponse: { not: null } },
      data: { smtpResponse: null },
    });
    if (count > 0)
      this.logger.log(`Retention: cleared content of ${count} mails older than ${days} days`);
    return count;
  }
}
