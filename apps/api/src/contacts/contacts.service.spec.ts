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
            source: 'ERP',
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

    const res = await service.list({
      connectionId: 'c1',
      q: 'pur',
      source: 'ERP',
      page: 2,
      pageSize: 10,
    });

    const args = prisma.contact.findMany.mock.calls[0][0];
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(args.where.connectionId).toBe('c1');
    expect(args.where.source).toBe('ERP');
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

describe('ContactsService manual contacts', () => {
  function setup(found: Record<string, unknown> | null = null) {
    const prisma = {
      erpConnection: { findUnique: vi.fn().mockResolvedValue({ id: 'c1' }) },
      contact: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(found),
        create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'm1',
            erpRefId: null,
            phone: null,
            raw: null,
            syncedAt: now,
            connection: null,
            ...data,
          }),
        ),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    return { prisma, service: new ContactsService(prisma as unknown as PrismaService) };
  }

  it('creates MANUAL contacts and rejects duplicates and unknown databases', async () => {
    const { prisma, service } = setup();
    const input = {
      email: 'a@x.com',
      name: null,
      phone: null,
      company: null,
      connectionId: null,
    };
    await expect(service.create(input)).resolves.toMatchObject({
      source: 'MANUAL',
      email: 'a@x.com',
      connectionName: null,
    });
    expect(prisma.contact.findFirst.mock.calls[0][0].where).toEqual({
      source: 'MANUAL',
      email: 'a@x.com',
      connectionId: null,
    });

    prisma.contact.findFirst.mockResolvedValueOnce({ id: 'dup' });
    await expect(service.create(input)).rejects.toMatchObject({
      response: { code: 'CONTACT_EXISTS' },
    });
    prisma.erpConnection.findUnique.mockResolvedValueOnce(null);
    await expect(service.create({ ...input, connectionId: 'c9' })).rejects.toMatchObject({
      response: { code: 'CONNECTION_NOT_FOUND' },
    });
  });

  it('refuses to change or delete contacts that come from the ERP', async () => {
    const { prisma, service } = setup({ id: 'e1', source: 'ERP' });
    await expect(service.update('e1', { name: 'x' })).rejects.toMatchObject({
      response: { code: 'CONTACT_FROM_ERP' },
    });
    await expect(service.remove('e1')).rejects.toMatchObject({ status: 409 });
    expect(prisma.contact.delete).not.toHaveBeenCalled();

    prisma.contact.findUnique.mockResolvedValue(null);
    await expect(service.remove('nope')).rejects.toMatchObject({ status: 404 });
  });
});
