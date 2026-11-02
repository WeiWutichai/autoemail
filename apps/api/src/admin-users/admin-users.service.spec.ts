import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type AdminUser } from '@prisma/client';
import type { SessionsService } from '../auth/sessions.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AdminUsersService } from './admin-users.service';

vi.mock('../auth/password', () => ({ hashPassword: vi.fn(async (p: string) => `hashed:${p}`) }));

const now = new Date('2026-11-02T00:00:00Z');
const user: AdminUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'b@example.com',
  passwordHash: 'hashed:x',
  name: 'B',
  isActive: true,
  lastLoginAt: null,
  createdAt: now,
  updatedAt: now,
};

function setup() {
  const prisma = {
    adminUser: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  };
  const sessions = { revokeAllForAdmin: vi.fn().mockResolvedValue(1) };
  const service = new AdminUsersService(
    prisma as unknown as PrismaService,
    sessions as unknown as SessionsService,
  );
  return { prisma, sessions, service };
}

describe('AdminUsersService', () => {
  it('lists users without password hashes', async () => {
    const { prisma, service } = setup();
    prisma.adminUser.findMany.mockResolvedValue([user]);

    const [dto] = await service.list();
    expect(dto).not.toHaveProperty('passwordHash');
    expect(dto.createdAt).toBe(now.toISOString());
  });

  it('creates a user with a hashed password', async () => {
    const { prisma, service } = setup();
    prisma.adminUser.create.mockResolvedValue(user);

    await service.create({ email: user.email, name: 'B', password: 'password1' });
    expect(prisma.adminUser.create.mock.calls[0][0].data.passwordHash).toBe('hashed:password1');
  });

  it('maps duplicate email to 409 EMAIL_TAKEN', async () => {
    const { prisma, service } = setup();
    prisma.adminUser.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }),
    );

    await expect(
      service.create({ email: user.email, name: 'B', password: 'password1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('revokes sessions when deactivating', async () => {
    const { prisma, sessions, service } = setup();
    prisma.adminUser.findUnique.mockResolvedValue({ id: user.id });
    prisma.adminUser.update.mockResolvedValue({ ...user, isActive: false });

    const dto = await service.update(user.id, { isActive: false }, 'someone-else');
    expect(dto.isActive).toBe(false);
    expect(sessions.revokeAllForAdmin).toHaveBeenCalledWith(user.id);
  });

  it('does not revoke sessions when only renaming', async () => {
    const { prisma, sessions, service } = setup();
    prisma.adminUser.findUnique.mockResolvedValue({ id: user.id });
    prisma.adminUser.update.mockResolvedValue({ ...user, name: 'New' });

    await service.update(user.id, { name: 'New' }, 'someone-else');
    expect(sessions.revokeAllForAdmin).not.toHaveBeenCalled();
  });

  it('refuses to deactivate yourself', async () => {
    const { service } = setup();
    await expect(service.update(user.id, { isActive: false }, user.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns 404 for unknown users', async () => {
    const { prisma, service } = setup();
    prisma.adminUser.findUnique.mockResolvedValue(null);

    await expect(service.update(user.id, { name: 'x' }, 'a')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.resetPassword(user.id, 'password1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('resets password and revokes all sessions', async () => {
    const { prisma, sessions, service } = setup();
    prisma.adminUser.findUnique.mockResolvedValue({ id: user.id });
    prisma.adminUser.update.mockResolvedValue(user);

    await service.resetPassword(user.id, 'new-password');
    expect(prisma.adminUser.update.mock.calls[0][0].data.passwordHash).toBe('hashed:new-password');
    expect(sessions.revokeAllForAdmin).toHaveBeenCalledWith(user.id);
  });
});
