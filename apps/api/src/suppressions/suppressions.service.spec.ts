import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { findSuppressed } from './suppressed';
import { SuppressionsService } from './suppressions.service';

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'a@x.com',
  reason: 'left the company',
  createdAt: new Date('2026-11-11T00:00:00Z'),
  updatedAt: new Date('2026-11-11T00:00:00Z'),
};

function setup() {
  const prisma = {
    suppressedEmail: {
      findMany: vi.fn().mockResolvedValue([row]),
      create: vi.fn().mockResolvedValue(row),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { prisma, service: new SuppressionsService(prisma as unknown as PrismaService) };
}

describe('SuppressionsService', () => {
  it('lists and creates entries as DTOs', async () => {
    const { prisma, service } = setup();
    const dto = {
      id: row.id,
      email: 'a@x.com',
      reason: 'left the company',
      createdAt: '2026-11-11T00:00:00.000Z',
    };
    await expect(service.list()).resolves.toEqual([dto]);
    await expect(service.create({ email: 'a@x.com', reason: 'left the company' })).resolves.toEqual(
      dto,
    );
    expect(prisma.suppressedEmail.create).toHaveBeenCalledWith({
      data: { email: 'a@x.com', reason: 'left the company' },
    });
  });

  it('returns 409 for an address already on the list', async () => {
    const { prisma, service } = setup();
    prisma.suppressedEmail.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(service.create({ email: 'a@x.com', reason: null })).rejects.toMatchObject({
      status: 409,
      response: { code: 'SUPPRESSION_EXISTS' },
    });
  });

  it('returns 404 when removing an unknown entry', async () => {
    const { prisma, service } = setup();
    prisma.suppressedEmail.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove(row.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('findSuppressed', () => {
  it('looks up unique lower-cased addresses and skips the query when empty', async () => {
    const { prisma } = setup();
    const db = prisma as unknown as PrismaService;
    await expect(findSuppressed(db, ['A@x.com', 'a@x.com', 'b@x.com'])).resolves.toEqual(
      new Set(['a@x.com']),
    );
    expect(prisma.suppressedEmail.findMany).toHaveBeenCalledWith({
      where: { email: { in: ['a@x.com', 'b@x.com'] } },
      select: { email: true },
    });
    prisma.suppressedEmail.findMany.mockClear();
    await expect(findSuppressed(db, [])).resolves.toEqual(new Set());
    expect(prisma.suppressedEmail.findMany).not.toHaveBeenCalled();
  });
});
