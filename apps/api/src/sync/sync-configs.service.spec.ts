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
    const rows = Array.from({ length: 25 }, (_, i) => ({ deptcode: `D${i}`, mail: `u${i}@x.com` }));
    datasources.query.mockResolvedValue(rows);

    const res = await service.preview({ ...input, columnMapping: { erp_ref_id: 'DeptCode' } });
    expect(res.rowCount).toBe(25);
    expect(res.rows).toHaveLength(20);
    expect(res.columns).toEqual(['deptcode', 'mail', 'erp_ref_id']);
    expect(res.missingColumns).toEqual(['email']);
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
