import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { findSuppressed } from './suppressed';
import { SuppressionsService } from './suppressions.service';

const CONN = '22222222-2222-4222-8222-222222222222';
const row = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'a@x.com',
  connectionId: CONN,
  connection: { name: 'db_ENSHU' },
  reason: 'left the company',
  createdAt: new Date('2026-11-11T00:00:00Z'),
  updatedAt: new Date('2026-11-11T00:00:00Z'),
};
const dto = {
  id: row.id,
  email: 'a@x.com',
  connectionId: CONN,
  connectionName: 'db_ENSHU',
  reason: 'left the company',
  createdAt: '2026-11-11T00:00:00.000Z',
};

function setup() {
  const prisma = {
    erpConnection: { findUnique: vi.fn().mockResolvedValue({ id: CONN }) },
    suppressedEmail: {
      findMany: vi.fn().mockResolvedValue([row]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(row),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { prisma, service: new SuppressionsService(prisma as unknown as PrismaService) };
}

describe('SuppressionsService', () => {
  it('lists and creates entries as DTOs with their database', async () => {
    const { prisma, service } = setup();
    await expect(service.list()).resolves.toEqual([dto]);
    const input = { email: 'a@x.com', connectionId: CONN, reason: 'left the company' };
    await expect(service.create(input)).resolves.toEqual(dto);
    expect(prisma.suppressedEmail.create.mock.calls[0][0].data).toEqual(input);
  });

  it('rejects an unknown database', async () => {
    const { prisma, service } = setup();
    prisma.erpConnection.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ email: 'a@x.com', connectionId: CONN, reason: null }),
    ).rejects.toMatchObject({ status: 404, response: { code: 'CONNECTION_NOT_FOUND' } });
  });

  it('returns 409 for a duplicate, including a second every-database entry', async () => {
    const { prisma, service } = setup();
    prisma.suppressedEmail.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(
      service.create({ email: 'a@x.com', connectionId: CONN, reason: null }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'SUPPRESSION_EXISTS' } });

    prisma.suppressedEmail.findFirst.mockResolvedValue({ id: 'g1' });
    await expect(
      service.create({ email: 'a@x.com', connectionId: null, reason: null }),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.suppressedEmail.create).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when removing an unknown entry', async () => {
    const { prisma, service } = setup();
    prisma.suppressedEmail.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove(row.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('findSuppressed', () => {
  it('matches every-database entries plus those of the given connection', async () => {
    const { prisma } = setup();
    const db = prisma as unknown as PrismaService;
    prisma.suppressedEmail.findMany.mockResolvedValue([{ email: 'a@x.com' }]);
    await expect(findSuppressed(db, CONN, ['A@x.com', 'a@x.com', 'b@x.com'])).resolves.toEqual(
      new Set(['a@x.com']),
    );
    expect(prisma.suppressedEmail.findMany).toHaveBeenCalledWith({
      where: {
        email: { in: ['a@x.com', 'b@x.com'] },
        OR: [{ connectionId: null }, { connectionId: CONN }],
      },
      select: { email: true },
    });

    await findSuppressed(db, null, ['a@x.com']);
    expect(prisma.suppressedEmail.findMany.mock.calls[1][0].where.OR).toEqual([
      { connectionId: null },
    ]);

    prisma.suppressedEmail.findMany.mockClear();
    await expect(findSuppressed(db, CONN, [])).resolves.toEqual(new Set());
    expect(prisma.suppressedEmail.findMany).not.toHaveBeenCalled();
  });
});
