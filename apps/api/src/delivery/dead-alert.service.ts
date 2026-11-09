import { Injectable, Logger } from '@nestjs/common';
import { MailerService, SmtpSendError } from '../mail/mailer.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_LINES = 20;

/** Emails active admins a summary of ERP mails that went DEAD in a time window. */
@Injectable()
export class DeadAlertService {
  private readonly logger = new Logger(DeadAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  /** Returns how many dead mails were reported (0 = nothing sent). */
  async notify(since: Date, until: Date): Promise<number> {
    const logs = await this.prisma.mailLog.findMany({
      where: {
        event: 'DEAD',
        createdAt: { gte: since, lt: until },
        queue: { connectionId: { not: null } },
      },
      include: { queue: { select: { id: true, erpRefId: true, lastError: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (logs.length === 0) return 0;

    const [smtp, admins] = await Promise.all([
      this.prisma.smtpConfig.findFirst({ where: { isDefault: true } }),
      this.prisma.adminUser.findMany({ where: { isActive: true }, select: { email: true } }),
    ]);
    if (!smtp || admins.length === 0) {
      this.logger.warn(`${logs.length} dead mails but no default SMTP / admin to alert`);
      return 0;
    }

    const lines = logs
      .slice(0, MAX_LINES)
      .map(
        (l) => `- ${l.queue.erpRefId ?? l.queue.id}: ${(l.queue.lastError ?? '').slice(0, 150)}`,
      );
    if (logs.length > MAX_LINES) lines.push(`… และอีก ${logs.length - MAX_LINES} รายการ`);
    const text = [
      `มีเมล ${logs.length} ฉบับส่งไม่สำเร็จและระบบหยุดลองส่งแล้ว (สถานะ DEAD)`,
      '',
      ...lines,
      '',
      'ตรวจสอบและกด Retry ได้ที่หน้า Logs ของ ERP Mail Relay',
    ].join('\n');

    try {
      await this.mailer.send(smtp, {
        to: admins.map((a) => a.email),
        subject: `[ERP Mail Relay] เมลส่งไม่สำเร็จ ${logs.length} ฉบับ`,
        html: `<pre style="font-family:inherit">${escapeHtml(text)}</pre>`,
        text,
      });
      this.logger.log(`Dead-mail alert sent (${logs.length} mails)`);
    } catch (err) {
      if (!(err instanceof SmtpSendError)) throw err;
      this.logger.warn(`Dead-mail alert failed: ${err.message}`);
      return 0;
    }
    return logs.length;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
