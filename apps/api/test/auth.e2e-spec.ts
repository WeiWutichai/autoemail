import type { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createAdmin, createTestApp, readRefreshCookie, resetDb } from './utils';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = 'admin@example.com';
  const password = 'correct-password';

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((b) =>
      b.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true }),
    ));
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await createAdmin(prisma, { email, password });
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (body: object) => request(app.getHttpServer()).post('/auth/login').send(body);

  it('logs in and sets a secure httpOnly refresh cookie', async () => {
    const res = await login({ email: 'ADMIN@example.com', password }).expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email, isActive: true });
    expect(res.body.user).not.toHaveProperty('passwordHash');

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/refresh_token=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
  });

  it('returns 401 for a wrong password', async () => {
    const res = await login({ email, password: 'wrong-password' }).expect(401);
    expect(res.body).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
  });

  it('returns 401 for an inactive user', async () => {
    await prisma.adminUser.update({ where: { email }, data: { isActive: false } });
    await login({ email, password }).expect(401);
  });

  it('returns 400 VALIDATION_ERROR for a malformed body', async () => {
    const res = await login({ email: 'not-an-email' }).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('refreshes with rotation and revokes the session on token reuse', async () => {
    const loginRes = await login({ email, password }).expect(200);
    const first = readRefreshCookie(loginRes.headers['set-cookie']);

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${first}`)
      .expect(200);
    const second = readRefreshCookie(refreshRes.headers['set-cookie']);
    expect(refreshRes.body.accessToken).toEqual(expect.any(String));
    expect(second).toBeDefined();
    expect(second).not.toBe(first);

    const reuse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${first}`)
      .expect(401);
    expect(reuse.body.code).toBe('REFRESH_TOKEN_REUSED');

    // The whole session is revoked, so even the latest token no longer works.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${second}`)
      .expect(401);
  });

  it('returns 401 on refresh without a cookie', async () => {
    await request(app.getHttpServer()).post('/auth/refresh').expect(401);
  });

  it('returns 401 on a guarded route without a token', async () => {
    const res = await request(app.getHttpServer()).get('/admin-users').expect(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('keeps /health public', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('logout revokes the session and clears the cookie', async () => {
    const loginRes = await login({ email, password }).expect(200);
    const token = readRefreshCookie(loginRes.headers['set-cookie']);
    const { accessToken } = loginRes.body;

    const out = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', `refresh_token=${token}`)
      .expect(204);
    expect(readRefreshCookie(out.headers['set-cookie'])).toBeUndefined();

    await request(app.getHttpServer())
      .get('/admin-users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${token}`)
      .expect(401);
  });
});
