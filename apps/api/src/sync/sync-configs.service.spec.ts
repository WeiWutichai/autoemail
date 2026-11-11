import { PREVIEW_ROW_LIMIT } from '@erp-mail/shared';
import type { ErpConnection } from '@prisma/client';
import { ErpQueryError, type ErpDataSourceFactory } from '../erp/erp-datasource.factory';
import type { PrismaService } from '../prisma/prisma.service';
import { SyncConfigsService } from './sync-configs.service';

const conn = { id: '11111111-1111-4111-8111-111111111111', isActive: true } as ErpConnection;

function setup() {
  const prisma = {
    erpConnection: { findUnique: vi.fn().mockResolvedValue(conn) },
    erpSyncConfig: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    mailTemplate: { findUnique: vi.fn().mockResolvedValue({ id: 't1' }) },
    smtpConfig: { findUnique: vi.fn().mockResolvedValue(null) },
    mailQueue: { findMany: vi.fn().mockResolvedValue([]) },
    suppressedEmail: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const datasources = { query: vi.fn() };
  const service = new SyncConfigsService(
    prisma as unknown as PrismaService,
    datasources as unknown as ErpDataSourceFactory,
  );
  return { prisma, datasources, service };
}

const input = {
  connectionId: conn.id,
  name: 'Contacts',
  description: null,
  kind: 'CONTACTS' as const,
  querySql: 'SELECT 1',
  columnMapping: null,
  pollIntervalSec: 300,
  isActive: true,
  templateId: null,
  smtpConfigId: null,
};

describe('SyncConfigsService', () => {
  it('rejects non-SELECT SQL before saving', async () => {
    const { prisma, service } = setup();
    await expect(service.create({ ...input, querySql: 'EXEC sp_who' })).rejects.toMatchObject({
      response: { code: 'SQL_NOT_ALLOWED' },
    });
    expect(prisma.erpSyncConfig.create).not.toHaveBeenCalled();
  });

  it('requires an existing template for outbox configs and an existing SMTP config', async () => {
    const { prisma, service } = setup();
    await expect(service.create({ ...input, kind: 'OUTBOX' })).rejects.toMatchObject({
      response: { code: 'TEMPLATE_REQUIRED' },
    });
    prisma.mailTemplate.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.create({ ...input, kind: 'OUTBOX', templateId: 't-missing' }),
    ).rejects.toMatchObject({ response: { code: 'TEMPLATE_NOT_FOUND' } });
    await expect(service.create({ ...input, smtpConfigId: 's-missing' })).rejects.toMatchObject({
      response: { code: 'SMTP_NOT_FOUND' },
    });
    expect(prisma.erpSyncConfig.create).not.toHaveBeenCalled();
  });

  it('rejects unknown or inactive connections', async () => {
    const { prisma, service } = setup();
    prisma.erpConnection.findUnique.mockResolvedValueOnce(null);
    await expect(service.create(input)).rejects.toMatchObject({
      response: { code: 'CONNECTION_NOT_FOUND' },
    });
    prisma.erpConnection.findUnique.mockResolvedValueOnce({ ...conn, isActive: false });
    await expect(service.preview(input)).rejects.toMatchObject({
      response: { code: 'CONNECTION_INACTIVE' },
    });
  });

  it('previews mapped columns, the first rows and missing required columns', async () => {
    const { datasources, service } = setup();
    const rows = Array.from({ length: PREVIEW_ROW_LIMIT + 5 }, (_, i) => ({
      deptcode: `D${i}`,
      mail: `u${i}@x.com`,
    }));
    datasources.query.mockResolvedValue(rows);

    const res = await service.preview({ ...input, columnMapping: { erp_ref_id: 'DeptCode' } });
    expect(res.rowCount).toBe(PREVIEW_ROW_LIMIT + 5);
    expect(res.rows).toHaveLength(PREVIEW_ROW_LIMIT);
    expect(res.columns).toEqual(['deptcode', 'mail', 'erp_ref_id']);
    expect(res.missingColumns).toEqual(['email']);
    expect(res.outbox).toBeNull();
  });

  it('summarises who an outbox query would mail, skipping ids already queued', async () => {
    const { datasources, prisma, service } = setup();
    datasources.query.mockResolvedValue([
      { erp_ref_id: 'PR:1:a', to_email: 'A@x.com', cc: 'boss@x.com' },
      { erp_ref_id: 'PR:1:b', to_email: 'b@x.com' },
      { erp_ref_id: 'PR:2:a', to_email: 'a@x.com' },
      { erp_ref_id: 'PR:2:a', to_email: 'a@x.com' },
      { erp_ref_id: 'PR:3:a', to_email: 'a@x.com' },
      { erp_ref_id: 'PR:4:z', to_email: 'not-an-email' },
    ]);
    prisma.mailQueue.findMany.mockResolvedValue([{ erpRefId: 'PR:3:a' }]);
    prisma.suppressedEmail.findMany.mockResolvedValue([{ email: 'b@x.com' }]);

    const res = await service.preview({ ...input, kind: 'OUTBOX' });
    expect(prisma.mailQueue.findMany).toHaveBeenCalledWith({
      where: { connectionId: conn.id, erpRefId: { in: ['PR:1:a', 'PR:1:b', 'PR:2:a', 'PR:3:a'] } },
      select: { erpRefId: true },
    });
    expect(res.outbox).toEqual({
      newMails: 2,
      alreadyQueued: 1,
      suppressedMails: 1,
      duplicateRows: 1,
      invalidRows: 1,
      recipients: [
        { email: 'a@x.com', mails: 2, suppressed: false },
        { email: 'b@x.com', mails: 1, suppressed: true },
        { email: 'boss@x.com', mails: 1, suppressed: false },
      ],
    });
  });

  it('maps ERP query failures to 422 ERP_QUERY_FAILED', async () => {
    const { datasources, service } = setup();
    datasources.query.mockRejectedValue(new ErpQueryError('Invalid column name x'));
    await expect(service.preview(input)).rejects.toMatchObject({
      status: 422,
      response: { code: 'ERP_QUERY_FAILED', message: 'Invalid column name x' },
    });
  });
});
