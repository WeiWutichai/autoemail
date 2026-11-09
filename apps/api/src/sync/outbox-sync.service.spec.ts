import { Prisma, type ErpConnection, type MailTemplate } from '@prisma/client';
import type { ErpDataSourceFactory } from '../erp/erp-datasource.factory';
import { TemplateRenderer } from '../mail/template-renderer';
import type { PrismaService } from '../prisma/prisma.service';
import { OutboxSyncService, parseAddresses } from './outbox-sync.service';
import type { SyncConfigWithConnection } from './sync-config.mapper';

const now = new Date('2026-11-09T00:00:00Z');
const template: MailTemplate = {
  id: 't1',
  code: 'pr_pending',
  name: 'PR',
  subjectTpl: '{{doc_type}} {{order_no}}',
  bodyHtmlTpl: '<p>{{supplier_name}}</p>',
  bodyTextTpl: null,
  variables: null,
  isActive: true,
  version: 4,
  createdAt: now,
  updatedAt: now,
};
const config: SyncConfigWithConnection = {
  id: 's1',
  connectionId: 'c1',
  name: 'PR/PO',
  kind: 'OUTBOX',
  querySql: 'SELECT ...',
  columnMapping: null,
  pollIntervalSec: 300,
  isActive: true,
  lastSyncedAt: null,
  lastCursor: null,
  lastResult: null,
  lastError: null,
  templateId: 't1',
  smtpConfigId: null,
  createdAt: now,
  updatedAt: now,
  connection: { id: 'c1' } as ErpConnection,
};

const row = (ref: string, extra: Record<string, string | null> = {}) => ({
  erp_ref_id: ref,
  to_email: 'Buyer@Example.com',
  doc_type: 'PR',
  order_no: ref,
  supplier_name: 'A&B',
  ...extra,
});

function setup(rows: Record<string, string | null>[], existing: string[] = []) {
  const prisma = {
    mailQueue: {
      findMany: vi.fn().mockResolvedValue(existing.map((erpRefId) => ({ erpRefId }))),
      create: vi.fn().mockResolvedValue({}),
    },
    mailTemplate: {
      findUnique: vi.fn(({ where }: { where: { id?: string; code?: string } }) =>
        Promise.resolve(
          where.id === 't1' || where.code === 'pr_pending'
            ? template
            : where.code === 'off'
              ? { ...template, id: 't2', code: 'off', isActive: false }
              : null,
        ),
      ),
    },
  };
  const datasources = { query: vi.fn().mockResolvedValue(rows) };
  const service = new OutboxSyncService(
    prisma as unknown as PrismaService,
    datasources as unknown as ErpDataSourceFactory,
    new TemplateRenderer(),
  );
  return { prisma, service };
}

describe('parseAddresses', () => {
  it('splits, lower-cases, de-duplicates and validates', () => {
    expect(parseAddresses(' A@x.com; b@x.com,a@x.com ')).toEqual(['a@x.com', 'b@x.com']);
    expect(parseAddresses(null)).toEqual([]);
    expect(parseAddresses('a@x.com; nope')).toBeNull();
  });
});

describe('OutboxSyncService', () => {
  it('enqueues rendered mails for new rows and skips ones already queued', async () => {
    const { prisma, service } = setup([row('PR-1'), row('PR-2')], ['PR-2']);
    const result = await service.sync(config);

    expect(result).toMatchObject({ fetched: 2, created: 1, skipped: 1, errors: 0 });
    const data = prisma.mailQueue.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      connectionId: 'c1',
      erpRefId: 'PR-1',
      templateId: 't1',
      templateVersion: 4,
      smtpConfigId: null,
      toAddrs: ['buyer@example.com'],
      cc: [],
      renderedSubject: 'PR PR-1',
      renderedHtml: '<p>A&amp;B</p>',
      status: 'PENDING',
      logs: { create: { event: 'QUEUED', detail: 'Sync config PR/PO' } },
    });
  });

  it('reports invalid rows and template problems without enqueueing them', async () => {
    const { prisma, service } = setup([
      row(''),
      row('PR-3', { to_email: 'not-an-email' }),
      row('PR-4', { template_code: 'missing' }),
      row('PR-5', { template_code: 'off' }),
      row('PR-6', { cc: 'boss@example.com; bad' }),
    ]);
    const result = await service.sync(config);
    expect(result.errors).toBe(5);
    expect(result.messages).toEqual([
      'row 1: missing erp_ref_id',
      'erp_ref_id PR-3: missing or invalid to_email',
      'erp_ref_id PR-6: invalid cc / bcc',
      'erp_ref_id PR-4: template missing not found',
      'erp_ref_id PR-5: template off is deactivated',
    ]);
    expect(prisma.mailQueue.create).not.toHaveBeenCalled();
  });

  it('treats a concurrent insert as skipped', async () => {
    const { prisma, service } = setup([row('PR-1')]);
    prisma.mailQueue.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }),
    );
    await expect(service.sync(config)).resolves.toMatchObject({ created: 0, skipped: 1 });
  });
});
