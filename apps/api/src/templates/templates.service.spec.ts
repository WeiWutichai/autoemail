import type { MailTemplate, SmtpConfig } from '@prisma/client';
import { SmtpSendError, type MailerService } from '../mail/mailer.service';
import { TemplateRenderer } from '../mail/template-renderer';
import type { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from './templates.service';

const now = new Date('2026-11-09T00:00:00Z');
const template: MailTemplate = {
  id: 't1',
  code: 'pr_pending',
  name: 'PR pending',
  subjectTpl: 'PR {{order_no}}',
  bodyHtmlTpl: '<p>{{supplier_name}}</p>',
  bodyTextTpl: null,
  variables: { order_no: 'PR-1' },
  isActive: true,
  version: 3,
  createdAt: now,
  updatedAt: now,
};
const smtp = { id: 's1', isDefault: true } as SmtpConfig;

function setup() {
  const tx = {
    mailTemplateVersion: { create: vi.fn() },
    mailTemplate: { update: vi.fn().mockResolvedValue(template) },
  };
  const prisma = {
    mailTemplate: {
      findUnique: vi.fn().mockResolvedValue(template),
      create: vi.fn().mockResolvedValue(template),
      delete: vi.fn(),
    },
    mailQueue: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'q1' }),
      update: vi.fn(),
    },
    erpSyncConfig: { count: vi.fn().mockResolvedValue(0) },
    smtpConfig: {
      findUnique: vi.fn().mockResolvedValue(smtp),
      findFirst: vi.fn().mockResolvedValue(smtp),
    },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const mailer = { send: vi.fn().mockResolvedValue({ messageId: '<m@x>', response: '250 OK' }) };
  const service = new TemplatesService(
    prisma as unknown as PrismaService,
    new TemplateRenderer(),
    mailer as unknown as MailerService,
  );
  return { prisma, tx, mailer, service };
}

describe('TemplatesService', () => {
  it('creates version 1 with a snapshot', async () => {
    const { prisma, service } = setup();
    await service.create({
      code: 'pr_pending',
      name: 'PR',
      subjectTpl: 's',
      bodyHtmlTpl: 'b',
      bodyTextTpl: null,
      sampleVariables: null,
      isActive: true,
    });
    const data = prisma.mailTemplate.create.mock.calls[0][0].data;
    expect(data.version).toBe(1);
    expect(data.versions.create).toEqual({
      version: 1,
      subjectTpl: 's',
      bodyHtmlTpl: 'b',
      bodyTextTpl: null,
    });
  });

  it('rejects templates that do not compile', async () => {
    const { prisma, service } = setup();
    await expect(
      service.create({
        code: 'x',
        name: 'x',
        subjectTpl: '{{#if a}}',
        bodyHtmlTpl: 'b',
        bodyTextTpl: null,
        sampleVariables: null,
        isActive: true,
      }),
    ).rejects.toMatchObject({
      response: { code: 'TEMPLATE_INVALID', details: { field: 'subjectTpl' } },
    });
    expect(prisma.mailTemplate.create).not.toHaveBeenCalled();
  });

  it('bumps the version only when content changes', async () => {
    const { tx, service } = setup();
    await service.update('t1', { name: 'Renamed' });
    expect(tx.mailTemplateVersion.create).not.toHaveBeenCalled();
    expect(tx.mailTemplate.update.mock.calls[0][0].data.version).toBe(3);

    await service.update('t1', { subjectTpl: 'New {{order_no}}' });
    expect(tx.mailTemplateVersion.create.mock.calls[0][0].data).toMatchObject({
      templateId: 't1',
      version: 4,
      subjectTpl: 'New {{order_no}}',
      bodyHtmlTpl: '<p>{{supplier_name}}</p>',
    });
    expect(tx.mailTemplate.update.mock.calls[1][0].data.version).toBe(4);
  });

  it('refuses to delete a template used by mails', async () => {
    const { prisma, service } = setup();
    prisma.mailQueue.count.mockResolvedValue(1);
    await expect(service.remove('t1')).rejects.toMatchObject({
      response: { code: 'TEMPLATE_IN_USE' },
    });
  });

  it('test-sends through the default SMTP and records the queue item', async () => {
    const { prisma, mailer, service } = setup();
    const res = await service.testSend('t1', {
      to: 'me@example.com',
      variables: { order_no: 'PR-9', supplier_name: 'ACME' },
    });
    expect(res).toEqual({ ok: true, queueId: 'q1', messageId: '<m@x>' });
    expect(prisma.mailQueue.create.mock.calls[0][0].data).toMatchObject({
      templateVersion: 3,
      smtpConfigId: 's1',
      toAddrs: ['me@example.com'],
      renderedSubject: 'PR PR-9',
      status: 'SENDING',
    });
    expect(mailer.send.mock.calls[0][1]).toMatchObject({
      to: ['me@example.com'],
      subject: 'PR PR-9',
    });
    expect(prisma.mailQueue.update.mock.calls[0][0].data).toMatchObject({
      status: 'SENT',
      messageId: '<m@x>',
    });
  });

  it('marks failed test sends as DEAD so the worker never retries them', async () => {
    const { prisma, mailer, service } = setup();
    mailer.send.mockRejectedValue(new SmtpSendError('421 try later', false, 421));
    const res = await service.testSend('t1', { to: 'me@example.com', variables: {} });
    expect(res).toMatchObject({ ok: false, error: '421 try later' });
    expect(prisma.mailQueue.update.mock.calls[0][0].data).toMatchObject({
      status: 'DEAD',
      lastError: '421 try later',
    });
  });

  it('requires an SMTP config', async () => {
    const { prisma, service } = setup();
    prisma.smtpConfig.findFirst.mockResolvedValue(null);
    await expect(service.testSend('t1', { to: 'a@x.com', variables: {} })).rejects.toMatchObject({
      response: { code: 'SMTP_NOT_CONFIGURED' },
    });
  });
});
