import type { ErpConnection } from '@prisma/client';
import type { ErpDataSourceFactory } from '../erp/erp-datasource.factory';
import type { PrismaService } from '../prisma/prisma.service';
import { ContactSyncService } from './contact-sync.service';
import { RunCounter } from './run-result';
import type { SyncConfigWithConnection } from './sync-config.mapper';

const now = new Date('2026-11-09T00:00:00Z');
const connection = { id: 'c1', name: 'ERP', isActive: true } as ErpConnection;
const config: SyncConfigWithConnection = {
  id: 's1',
  connectionId: 'c1',
  name: 'Contacts',
  kind: 'CONTACTS',
  querySql: 'SELECT * FROM Z_MaIL',
  columnMapping: { email: 'Email' },
  pollIntervalSec: 300,
  isActive: true,
  lastSyncedAt: null,
  lastCursor: null,
  lastResult: null,
  lastError: null,
  createdAt: now,
  updatedAt: now,
  connection,
};

function setup(rows: Record<string, string | number | null>[], existing: string[] = []) {
  const prisma = {
    contact: {
      findMany: vi.fn().mockResolvedValue(existing.map((erpRefId) => ({ erpRefId }))),
      createMany: vi.fn((args: { data: unknown[] }) =>
        Promise.resolve({ count: args.data.length }),
      ),
      update: vi.fn((args: unknown) => args),
    },
    $transaction: vi.fn((ops: unknown[]) => Promise.resolve(ops)),
  };
  const datasources = { query: vi.fn().mockResolvedValue(rows) };
  const service = new ContactSyncService(
    prisma as unknown as PrismaService,
    datasources as unknown as ErpDataSourceFactory,
  );
  return { prisma, datasources, service };
}

describe('ContactSyncService', () => {
  it('creates new contacts and updates existing ones', async () => {
    const { prisma, datasources, service } = setup(
      [
        { erp_ref_id: 'D1', email: 'A@X.COM ', name: 'Purchasing', company: 'HQ', extra: 1 },
        { erp_ref_id: 'D2', email: 'b@x.com', name: null },
      ],
      ['D2'],
    );

    const result = await service.sync(config);

    expect(datasources.query).toHaveBeenCalledWith(connection, 'SELECT * FROM Z_MaIL');
    expect(result).toMatchObject({ fetched: 2, created: 1, updated: 1, skipped: 0, errors: 0 });
    const created = prisma.contact.createMany.mock.calls[0][0].data[0];
    expect(created).toMatchObject({
      connectionId: 'c1',
      erpRefId: 'D1',
      email: 'a@x.com',
      name: 'Purchasing',
      company: 'HQ',
      phone: null,
      raw: { extra: 1 },
    });
    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { connectionId_erpRefId: { connectionId: 'c1', erpRefId: 'D2' } },
      }),
    );
  });

  it('applies the column mapping and reports invalid rows without their contents', () => {
    const { service } = setup([]);
    const counter = new RunCounter();
    const parsed = service.parseRows(
      [
        { erp_ref_id: 'D1', Email: 'ok@x.com' },
        { erp_ref_id: '', Email: 'x@x.com' },
        { erp_ref_id: 'D3', Email: 'not-an-email' },
        { erp_ref_id: 'D1', Email: 'later@x.com' },
      ].map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v]))),
      { email: 'Email' },
      counter,
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0].email).toBe('later@x.com');
    const result = counter.toResult();
    expect(result).toMatchObject({ errors: 2, skipped: 1 });
    expect(result.messages).toEqual([
      'row 2: missing erp_ref_id',
      'erp_ref_id D3: missing or invalid email',
    ]);
    expect(result.messages.join()).not.toContain('not-an-email');
  });

  it('counts rows lost to a concurrent insert as skipped', async () => {
    const { prisma, service } = setup([{ erp_ref_id: 'D1', email: 'a@x.com' }]);
    prisma.contact.createMany.mockResolvedValue({ count: 0 });
    const result = await service.sync({ ...config, columnMapping: null });
    expect(result).toMatchObject({ created: 0, skipped: 1 });
  });
});
