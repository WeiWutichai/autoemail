import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AdminSession, AdminUser } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { Env } from '../config/env';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { hashPassword } from './password';

const sha256 = (v: string): string => createHash('sha256').update(v).digest('hex');

const config = {
  get: (key: keyof Env) =>
    ({
      JWT_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      JWT_ACCESS_TTL: 900,
      JWT_REFRESH_TTL: 604800,
    })[key as string],
} as unknown as ConfigService<Env, true>;

function makeAdmin(overrides: Partial<AdminUser> = {}): AdminUser {
  const now = new Date();
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'admin@example.com',
    passwordHash: '',
    name: 'Admin',
    isActive: true,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makePrisma() {
  const prisma = {
    adminUser: { findUnique: vi.fn(), update: vi.fn() },
    adminSession: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return prisma;
}

describe('AuthService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AuthService;
  let admin: AdminUser;

  beforeAll(async () => {
    admin = makeAdmin({ passwordHash: await hashPassword('secret-pass') });
  });

  beforeEach(() => {
    prisma = makePrisma();
    service = new AuthService(prisma as unknown as PrismaService, new JwtService(), config);
  });

  async function loginAndCaptureSession(): Promise<{
    refreshToken: string;
    session: AdminSession & { admin: AdminUser };
  }> {
    prisma.adminUser.findUnique.mockResolvedValue(admin);
    prisma.adminSession.create.mockImplementation(({ data }) => Promise.resolve(data));
    prisma.adminUser.update.mockResolvedValue(admin);
    const result = await service.login({ email: admin.email, password: 'secret-pass' }, {});
    const data = prisma.adminSession.create.mock.calls[0][0].data;
    return {
      refreshToken: result.refreshToken,
      session: { ...data, revokedAt: null, createdAt: new Date(), updatedAt: new Date(), admin },
    };
  }

  describe('login', () => {
    it('creates a session storing only the refresh token hash', async () => {
      prisma.adminUser.findUnique.mockResolvedValue(admin);
      prisma.adminSession.create.mockImplementation(({ data }) => Promise.resolve(data));
      prisma.adminUser.update.mockResolvedValue(admin);

      const result = await service.login(
        { email: admin.email, password: 'secret-pass' },
        { ip: '1.2.3.4', userAgent: 'ua' },
      );

      const data = prisma.adminSession.create.mock.calls[0][0].data;
      expect(data.refreshTokenHash).toBe(sha256(result.refreshToken));
      expect(data.ip).toBe('1.2.3.4');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.accessToken).toBeTypeOf('string');
    });

    it('rejects a wrong password', async () => {
      prisma.adminUser.findUnique.mockResolvedValue(admin);
      await expect(service.login({ email: admin.email, password: 'nope' }, {})).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.adminSession.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown email', async () => {
      prisma.adminUser.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'x@y.z', password: 'secret-pass' }, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an inactive admin', async () => {
      prisma.adminUser.findUnique.mockResolvedValue({ ...admin, isActive: false });
      await expect(
        service.login({ email: admin.email, password: 'secret-pass' }, {}),
      ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token', async () => {
      const { refreshToken, session } = await loginAndCaptureSession();
      prisma.adminSession.findUnique.mockResolvedValue(session);
      prisma.adminSession.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.refresh(refreshToken);

      expect(result.refreshToken).not.toBe(refreshToken);
      const update = prisma.adminSession.updateMany.mock.calls[0][0];
      expect(update.where.refreshTokenHash).toBe(sha256(refreshToken));
      expect(update.data.refreshTokenHash).toBe(sha256(result.refreshToken));
    });

    it('revokes the session when an old token is reused', async () => {
      const { refreshToken, session } = await loginAndCaptureSession();
      prisma.adminSession.findUnique.mockResolvedValue({ ...session, refreshTokenHash: 'rotated' });
      prisma.adminSession.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.refresh(refreshToken)).rejects.toMatchObject({
        response: { code: 'REFRESH_TOKEN_REUSED' },
      });
      expect(prisma.adminSession.updateMany).toHaveBeenCalledWith({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects revoked sessions and inactive admins', async () => {
      const { refreshToken, session } = await loginAndCaptureSession();
      prisma.adminSession.findUnique.mockResolvedValueOnce({ ...session, revokedAt: new Date() });
      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);

      prisma.adminSession.findUnique.mockResolvedValueOnce({
        ...session,
        admin: { ...admin, isActive: false },
      });
      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a missing or forged token', async () => {
      await expect(service.refresh(undefined)).rejects.toThrow(UnauthorizedException);
      await expect(service.refresh('not-a-jwt')).rejects.toMatchObject({
        response: { code: 'INVALID_TOKEN' },
      });
    });

    it('rejects an access token used as refresh token', async () => {
      prisma.adminUser.findUnique.mockResolvedValue(admin);
      prisma.adminSession.create.mockImplementation(({ data }) => Promise.resolve(data));
      prisma.adminUser.update.mockResolvedValue(admin);
      const { accessToken } = await service.login(
        { email: admin.email, password: 'secret-pass' },
        {},
      );

      await expect(service.refresh(accessToken)).rejects.toMatchObject({
        response: { code: 'INVALID_TOKEN' },
      });
    });
  });

  describe('validateAccessToken', () => {
    it('returns the current user for an active session', async () => {
      const { session } = await loginAndCaptureSession();
      const { accessToken } = await service.login(
        { email: admin.email, password: 'secret-pass' },
        {},
      );
      prisma.adminSession.findUnique.mockResolvedValue(session);

      await expect(service.validateAccessToken(accessToken)).resolves.toEqual({
        id: admin.id,
        email: admin.email,
        name: admin.name,
        sessionId: session.id,
      });
    });

    it('rejects when the session was revoked', async () => {
      const { session } = await loginAndCaptureSession();
      const { accessToken } = await service.login(
        { email: admin.email, password: 'secret-pass' },
        {},
      );
      prisma.adminSession.findUnique.mockResolvedValue({ ...session, revokedAt: new Date() });

      await expect(service.validateAccessToken(accessToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes the session of a valid token and ignores invalid ones', async () => {
      const { refreshToken, session } = await loginAndCaptureSession();
      prisma.adminSession.updateMany.mockResolvedValue({ count: 1 });

      await service.logout(refreshToken);
      await service.logout('garbage');
      await service.logout(undefined);

      expect(prisma.adminSession.updateMany).toHaveBeenCalledOnce();
      expect(prisma.adminSession.updateMany.mock.calls[0][0].where.id).toBe(session.id);
    });
  });
});
