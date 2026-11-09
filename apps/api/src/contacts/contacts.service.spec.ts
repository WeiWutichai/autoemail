import type { PrismaService } from '../prisma/prisma.service';
import { ContactsService } from './contacts.service';

const now = new Date('2026-11-09T00:00:00Z');

describe('ContactsService', () => {
  it('filters by connection and search text and paginates', async () => {
    const prisma = {
      contact: {
        count: vi.fn().mockResolvedValue(30),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'x',
            connectionId: 'c1',
            erpRefId: 'PUR',
            name: 'Purchasing',
            email: 'p@x.com',
            phone: null,
            company: null,
            raw: ['not-an-object'],
            syncedAt: now,
            connection: { name: 'ERP' },
          },
        ]),
      },
    };
    const service = new ContactsService(prisma as unknown as PrismaService);

    const res = await service.list({ connectionId: 'c1', q: 'pur', page: 2, pageSize: 10 });

    const args = prisma.contact.findMany.mock.calls[0][0];
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(args.where.connectionId).toBe('c1');
    expect(args.where.OR).toContainEqual({ email: { contains: 'pur', mode: 'insensitive' } });
    expect(res).toMatchObject({ total: 30, page: 2, pageSize: 10 });
    expect(res.items[0]).toMatchObject({
      connectionName: 'ERP',
      raw: null,
      syncedAt: now.toISOString(),
    });
  });

  it('does not filter when no query is given', async () => {
    const prisma = {
      contact: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ContactsService(prisma as unknown as PrismaService);
    await service.list({ page: 1, pageSize: 25 });
    expect(prisma.contact.findMany.mock.calls[0][0].where).toEqual({});
  });
});
