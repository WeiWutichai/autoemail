export interface AuthUser {
  id: string;
  email: string;
  name: string;
  sessionId: string;
}

export interface AccessTokenPayload {
  sub: string;
  sid: string;
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  jti: string;
}

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export const REFRESH_COOKIE = 'refresh_token';
