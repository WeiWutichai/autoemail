import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AdminUserDto, LoginInput } from '@erp-mail/shared';
import { createHash, randomUUID } from 'node:crypto';
import { toAdminUserDto } from '../admin-users/admin-user.mapper';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload, AuthUser, ClientMeta, RefreshTokenPayload } from './auth.types';
import { verifyPassword } from './password';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AdminUserDto;
}

const invalidCredentials = (): UnauthorizedException =>
  new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });

const invalidSession = (): UnauthorizedException =>
  new UnauthorizedException({ code: 'INVALID_SESSION', message: 'Session expired or revoked' });

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtlSec: number;
  readonly refreshTtlSec: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.accessSecret = config.get('JWT_SECRET', { infer: true });
    this.refreshSecret = config.get('JWT_REFRESH_SECRET', { infer: true });
    this.accessTtlSec = config.get('JWT_ACCESS_TTL', { infer: true });
    this.refreshTtlSec = config.get('JWT_REFRESH_TTL', { infer: true });
  }

  async login(input: LoginInput, meta: ClientMeta): Promise<AuthResult> {
    const admin = await this.prisma.adminUser.findUnique({ where: { email: input.email } });
    const passwordOk = await verifyPassword(input.password, admin?.passwordHash);
    if (!admin || !passwordOk || !admin.isActive) {
      throw invalidCredentials();
    }

    const sessionId = randomUUID();
    const refreshToken = await this.signRefreshToken(admin.id, sessionId);
    const [, updated] = await this.prisma.$transaction([
      this.prisma.adminSession.create({
        data: {
          id: sessionId,
          adminId: admin.id,
          refreshTokenHash: hashToken(refreshToken),
          ip: meta.ip,
          userAgent: meta.userAgent?.slice(0, 500),
          expiresAt: this.refreshExpiresAt(),
        },
      }),
      this.prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } }),
    ]);

    return {
      accessToken: await this.signAccessToken(admin.id, sessionId),
      refreshToken,
      user: toAdminUserDto(updated),
    };
  }

  /** Rotates the refresh token; presenting an already-rotated token revokes the whole session. */
  async refresh(refreshToken: string | undefined): Promise<AuthResult> {
    if (!refreshToken) {
      throw invalidSession();
    }
    const payload = await this.verify<RefreshTokenPayload>(refreshToken, this.refreshSecret);

    const session = await this.prisma.adminSession.findUnique({
      where: { id: payload.sid },
      include: { admin: true },
    });
    if (
      !session ||
      session.adminId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.admin.isActive
    ) {
      throw invalidSession();
    }

    const presentedHash = hashToken(refreshToken);
    if (presentedHash !== session.refreshTokenHash) {
      await this.revokeSession(session.id);
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSED',
        message: 'Refresh token reuse detected; session revoked',
      });
    }

    const nextToken = await this.signRefreshToken(session.adminId, session.id);
    const { count } = await this.prisma.adminSession.updateMany({
      where: { id: session.id, refreshTokenHash: presentedHash, revokedAt: null },
      data: { refreshTokenHash: hashToken(nextToken), expiresAt: this.refreshExpiresAt() },
    });
    if (count !== 1) {
      throw invalidSession();
    }

    return {
      accessToken: await this.signAccessToken(session.adminId, session.id),
      refreshToken: nextToken,
      user: toAdminUserDto(session.admin),
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    try {
      const payload = await this.verify<RefreshTokenPayload>(refreshToken, this.refreshSecret);
      await this.revokeSession(payload.sid);
    } catch {
      // Logging out with an invalid token is a no-op; the cookie is cleared regardless.
    }
  }

  async validateAccessToken(token: string): Promise<AuthUser> {
    const payload = await this.verify<AccessTokenPayload>(token, this.accessSecret);
    const session = await this.prisma.adminSession.findUnique({
      where: { id: payload.sid },
      include: { admin: true },
    });
    if (
      !session ||
      session.adminId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.admin.isActive
    ) {
      throw invalidSession();
    }
    return {
      id: session.admin.id,
      email: session.admin.email,
      name: session.admin.name,
      sessionId: session.id,
    };
  }

  private async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.adminSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private signAccessToken(adminId: string, sessionId: string): Promise<string> {
    const payload: AccessTokenPayload = { sub: adminId, sid: sessionId };
    return this.jwt.signAsync(payload, { secret: this.accessSecret, expiresIn: this.accessTtlSec });
  }

  private signRefreshToken(adminId: string, sessionId: string): Promise<string> {
    const payload: RefreshTokenPayload = { sub: adminId, sid: sessionId, jti: randomUUID() };
    return this.jwt.signAsync(payload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshTtlSec,
    });
  }

  private refreshExpiresAt(): Date {
    return new Date(Date.now() + this.refreshTtlSec * 1000);
  }

  private async verify<T extends object>(token: string, secret: string): Promise<T> {
    try {
      return await this.jwt.verifyAsync<T>(token, { secret, algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      });
    }
  }
}
