import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateMailTemplateInput,
  MailTemplateDto,
  MailTemplateVersionDto,
  RenderedMail,
  RenderTemplateInput,
  TemplateVariables,
  TestSendInput,
  TestSendResult,
  UpdateMailTemplateInput,
} from '@erp-mail/shared';
import { Prisma, type MailTemplate, type SmtpConfig } from '@prisma/client';
import { MailerService, SmtpSendError } from '../mail/mailer.service';
import {
  TemplateRenderer,
  TemplateSyntaxError,
  type TemplateSource,
} from '../mail/template-renderer';
import { PrismaService } from '../prisma/prisma.service';

const CONTENT_FIELDS = ['subjectTpl', 'bodyHtmlTpl', 'bodyTextTpl'] as const;

function asVariables(value: Prisma.JsonValue | null): TemplateVariables | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

const jsonOrNull = (value: TemplateVariables | null | undefined) =>
  value === null ? Prisma.DbNull : (value as Prisma.InputJsonObject | undefined);

export function toMailTemplateDto(t: MailTemplate): MailTemplateDto {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    subjectTpl: t.subjectTpl,
    bodyHtmlTpl: t.bodyHtmlTpl,
    bodyTextTpl: t.bodyTextTpl,
    sampleVariables: asVariables(t.variables),
    isActive: t.isActive,
    version: t.version,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: TemplateRenderer,
    private readonly mailer: MailerService,
  ) {}

  async list(): Promise<MailTemplateDto[]> {
    const rows = await this.prisma.mailTemplate.findMany({ orderBy: { code: 'asc' } });
    return rows.map(toMailTemplateDto);
  }

  async get(id: string): Promise<MailTemplateDto> {
    return toMailTemplateDto(await this.findOrThrow(id));
  }

  async create(input: CreateMailTemplateInput): Promise<MailTemplateDto> {
    this.validate(input);
    const { sampleVariables, ...rest } = input;
    try {
      const template = await this.prisma.mailTemplate.create({
        data: {
          ...rest,
          variables: jsonOrNull(sampleVariables),
          version: 1,
          versions: {
            create: {
              version: 1,
              subjectTpl: rest.subjectTpl,
              bodyHtmlTpl: rest.bodyHtmlTpl,
              bodyTextTpl: rest.bodyTextTpl,
            },
          },
        },
      });
      return toMailTemplateDto(template);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'TEMPLATE_CODE_TAKEN',
          message: 'Template code is already in use',
        });
      }
      throw err;
    }
  }

  /** Saving a different subject / body bumps the version and stores a snapshot. */
  async update(id: string, input: UpdateMailTemplateInput): Promise<MailTemplateDto> {
    const current = await this.findOrThrow(id);
    const next: TemplateSource = {
      subjectTpl: input.subjectTpl ?? current.subjectTpl,
      bodyHtmlTpl: input.bodyHtmlTpl ?? current.bodyHtmlTpl,
      bodyTextTpl: input.bodyTextTpl !== undefined ? input.bodyTextTpl : current.bodyTextTpl,
    };
    this.validate(next);
    const contentChanged = CONTENT_FIELDS.some((f) => next[f] !== current[f]);
    const { sampleVariables, ...rest } = input;

    const template = await this.prisma.$transaction(async (tx) => {
      const version = contentChanged ? current.version + 1 : current.version;
      if (contentChanged) {
        await tx.mailTemplateVersion.create({ data: { templateId: id, version, ...next } });
      }
      return tx.mailTemplate.update({
        where: { id },
        data: {
          ...rest,
          ...(sampleVariables !== undefined ? { variables: jsonOrNull(sampleVariables) } : {}),
          version,
        },
      });
    });
    return toMailTemplateDto(template);
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    const [mails, syncConfigs] = await Promise.all([
      this.prisma.mailQueue.count({ where: { templateId: id } }),
      this.prisma.erpSyncConfig.count({ where: { templateId: id } }),
    ]);
    if (mails + syncConfigs > 0) {
      throw new ConflictException({
        code: 'TEMPLATE_IN_USE',
        message: 'Template is used by mails or sync configs; deactivate it instead',
        details: { mails, syncConfigs },
      });
    }
    await this.prisma.mailTemplate.delete({ where: { id } });
  }

  async versions(id: string): Promise<MailTemplateVersionDto[]> {
    await this.findOrThrow(id);
    const rows = await this.prisma.mailTemplateVersion.findMany({
      where: { templateId: id },
      orderBy: { version: 'desc' },
    });
    return rows.map((v) => ({
      version: v.version,
      subjectTpl: v.subjectTpl,
      bodyHtmlTpl: v.bodyHtmlTpl,
      bodyTextTpl: v.bodyTextTpl,
      createdAt: v.createdAt.toISOString(),
    }));
  }

  preview(input: RenderTemplateInput): RenderedMail {
    return this.render(input, input.variables);
  }

  /** Renders the saved template and sends it right away; recorded in mail_queue / mail_logs. */
  async testSend(id: string, input: TestSendInput): Promise<TestSendResult> {
    const template = await this.findOrThrow(id);
    const smtp = await this.resolveSmtp(input.smtpConfigId);
    const rendered = this.render(template, input.variables);

    const queue = await this.prisma.mailQueue.create({
      data: {
        templateId: template.id,
        templateVersion: template.version,
        smtpConfigId: smtp.id,
        toAddrs: [input.to],
        variables: input.variables as Prisma.InputJsonObject,
        renderedSubject: rendered.subject,
        renderedHtml: rendered.html,
        renderedText: rendered.text,
        status: 'SENDING',
        attempts: 1,
        logs: {
          create: [
            { event: 'QUEUED', detail: 'Test send from template editor' },
            { event: 'SENDING' },
          ],
        },
      },
    });

    try {
      const sent = await this.mailer.send(smtp, { to: [input.to], ...rendered });
      await this.prisma.mailQueue.update({
        where: { id: queue.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          messageId: sent.messageId,
          logs: { create: { event: 'SENT', smtpResponse: sent.response } },
        },
      });
      this.logger.log(`Test send template=${template.code} queue=${queue.id} sent`);
      return { ok: true, queueId: queue.id, messageId: sent.messageId };
    } catch (err) {
      if (!(err instanceof SmtpSendError)) throw err;
      // Test sends are never retried by the worker.
      await this.prisma.mailQueue.update({
        where: { id: queue.id },
        data: {
          status: 'DEAD',
          lastError: err.message,
          logs: { create: { event: 'FAILED', detail: err.message } },
        },
      });
      this.logger.warn(`Test send template=${template.code} queue=${queue.id} failed`);
      return { ok: false, queueId: queue.id, error: err.message };
    }
  }

  private render(source: TemplateSource, variables: TemplateVariables): RenderedMail {
    this.validate(source);
    return this.renderer.render(source, variables);
  }

  private validate(source: TemplateSource): void {
    try {
      this.renderer.validate(source);
    } catch (err) {
      if (err instanceof TemplateSyntaxError) {
        throw new BadRequestException({
          code: 'TEMPLATE_INVALID',
          message: err.message,
          details: { field: err.field },
        });
      }
      throw err;
    }
  }

  private async resolveSmtp(id: string | undefined): Promise<SmtpConfig> {
    const smtp = id
      ? await this.prisma.smtpConfig.findUnique({ where: { id } })
      : await this.prisma.smtpConfig.findFirst({ where: { isDefault: true } });
    if (!smtp) {
      throw new ConflictException({
        code: id ? 'SMTP_NOT_FOUND' : 'SMTP_NOT_CONFIGURED',
        message: id ? 'SMTP config not found' : 'No default SMTP config',
      });
    }
    return smtp;
  }

  private async findOrThrow(id: string): Promise<MailTemplate> {
    const template = await this.prisma.mailTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException({ code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' });
    }
    return template;
  }
}
