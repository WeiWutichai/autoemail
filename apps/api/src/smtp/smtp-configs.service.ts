import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  CreateSmtpConfigInput,
  SmtpConfigDto,
  TestSmtpInput,
  TestSmtpResult,
  UpdateSmtpConfigInput,
} from '@erp-mail/shared';
import { Prisma, type SmtpConfig } from '@prisma/client';
import { CryptoService } from '../common/crypto/crypto.service';
import { MailerService, SmtpSendError } from '../mail/mailer.service';
import { PrismaService } from '../prisma/prisma.service';

/** Fields that change how we log in / connect; editing any of them invalidates the last test. */
const CONNECTION_FIELDS = ['host', 'port', 'secure', 'username', 'password'] as const;

export function toSmtpConfigDto(smtp: SmtpConfig): SmtpConfigDto {
  return {
    id: smtp.id,
    name: smtp.name,
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    username: smtp.username,
    hasPassword: smtp.passwordEnc !== null,
    fromName: smtp.fromName,
    fromEmail: smtp.fromEmail,
    dailyLimit: smtp.dailyLimit,
    isDefault: smtp.isDefault,
    lastTestAt: smtp.lastTestAt?.toISOString() ?? null,
    lastTestOk: smtp.lastTestOk,
    createdAt: smtp.createdAt.toISOString(),
    updatedAt: smtp.updatedAt.toISOString(),
  };
}

@Injectable()
export class SmtpConfigsService {
  private readonly logger = new Logger(SmtpConfigsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly mailer: MailerService,
  ) {}

  async list(): Promise<SmtpConfigDto[]> {
    const rows = await this.prisma.smtpConfig.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return rows.map(toSmtpConfigDto);
  }

  async get(id: string): Promise<SmtpConfigDto> {
    return toSmtpConfigDto(await this.findOrThrow(id));
  }

  /** The first config becomes the default automatically. */
  async create(input: CreateSmtpConfigInput): Promise<SmtpConfigDto> {
    const { password, ...rest } = input;
    const isFirst = (await this.prisma.smtpConfig.count()) === 0;
    const isDefault = rest.isDefault || isFirst;
    const smtp = await this.withUniqueName(() =>
      this.prisma.$transaction(async (tx) => {
        if (isDefault) await tx.smtpConfig.updateMany({ data: { isDefault: false } });
        return tx.smtpConfig.create({
          data: {
            ...rest,
            isDefault,
            passwordEnc: password ? this.crypto.encrypt(password) : null,
          },
        });
      }),
    );
    return toSmtpConfigDto(smtp);
  }

  async update(id: string, input: UpdateSmtpConfigInput): Promise<SmtpConfigDto> {
    const current = await this.findOrThrow(id);
    if (input.isDefault === false && current.isDefault) {
      throw new ConflictException({
        code: 'SMTP_DEFAULT_REQUIRED',
        message: 'Mark another SMTP config as default instead',
      });
    }
    const { password, ...rest } = input;
    const resetTest = CONNECTION_FIELDS.some((field) => input[field] !== undefined);
    const smtp = await this.withUniqueName(() =>
      this.prisma.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.smtpConfig.updateMany({ where: { NOT: { id } }, data: { isDefault: false } });
        }
        return tx.smtpConfig.update({
          where: { id },
          data: {
            ...rest,
            ...(password !== undefined ? { passwordEnc: this.crypto.encrypt(password) } : {}),
            ...(resetTest ? { lastTestAt: null, lastTestOk: null } : {}),
          },
        });
      }),
    );
    this.mailer.invalidate(id);
    return toSmtpConfigDto(smtp);
  }

  async remove(id: string): Promise<void> {
    const smtp = await this.findOrThrow(id);
    const mails = await this.prisma.mailQueue.count({ where: { smtpConfigId: id } });
    if (mails > 0) {
      throw new ConflictException({
        code: 'SMTP_IN_USE',
        message: 'SMTP config is referenced by mails',
        details: { mails },
      });
    }
    if (smtp.isDefault && (await this.prisma.smtpConfig.count()) > 1) {
      throw new ConflictException({
        code: 'SMTP_DEFAULT_REQUIRED',
        message: 'Mark another SMTP config as default before deleting this one',
      });
    }
    await this.prisma.smtpConfig.delete({ where: { id } });
    this.mailer.invalidate(id);
  }

  /** Verifies the login and, when `to` is given, sends a short test message. */
  async test(id: string, input: TestSmtpInput): Promise<TestSmtpResult> {
    const smtp = await this.findOrThrow(id);
    const started = Date.now();
    let result: Omit<TestSmtpResult, 'testedAt' | 'latencyMs'>;
    try {
      if (input.to) {
        const sent = await this.mailer.send(smtp, {
          to: [input.to],
          subject: `[ERP Mail Relay] ทดสอบ SMTP: ${smtp.name}`,
          html: `<p>อีเมลทดสอบจาก ERP Mail Relay ผ่าน SMTP <b>${escapeHtml(smtp.name)}</b></p>`,
          text: `อีเมลทดสอบจาก ERP Mail Relay ผ่าน SMTP ${smtp.name}`,
        });
        result = { ok: true, messageId: sent.messageId };
      } else {
        await this.mailer.verify(smtp);
        result = { ok: true };
      }
    } catch (err) {
      if (!(err instanceof SmtpSendError)) throw err;
      result = { ok: false, error: err.message };
    }
    const testedAt = new Date();
    await this.prisma.smtpConfig.update({
      where: { id },
      data: { lastTestAt: testedAt, lastTestOk: result.ok },
    });
    this.logger.log(`SMTP test id=${id} ok=${result.ok}`);
    return { ...result, testedAt: testedAt.toISOString(), latencyMs: Date.now() - started };
  }

  private async findOrThrow(id: string): Promise<SmtpConfig> {
    const smtp = await this.prisma.smtpConfig.findUnique({ where: { id } });
    if (!smtp) {
      throw new NotFoundException({ code: 'SMTP_NOT_FOUND', message: 'SMTP config not found' });
    }
    return smtp;
  }

  private async withUniqueName(write: () => Promise<SmtpConfig>): Promise<SmtpConfig> {
    try {
      return await write();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'SMTP_NAME_TAKEN',
          message: 'SMTP config name is already in use',
        });
      }
      throw err;
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
