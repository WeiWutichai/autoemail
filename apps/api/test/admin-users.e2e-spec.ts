import type { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createAdmin, createTestApp, resetDb } from './utils';

describe('Admin users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let selfId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((b) =>
      b.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true }),
    ));
  });

  beforeEach(async () => {
    await resetDb(prisma);
    selfId = await createAdmin(prisma, { email: 'root@example.com', password: 'root-password' });
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'root@example.com', password: 'root-password' })
      .expect(200);
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => {
    const server = app.getHttpServer();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    return {
      get: (url: string) => auth(request(server).get(url)),
      post: (url: string) => auth(request(server).post(url)),
      patch: (url: string) => auth(request(server).patch(url)),
    };
  };

  it('creates, lists and never exposes password hashes', async () => {
    const created = await api()
      .post('/admin-users')
      .send({ email: 'New@Example.com', name: 'New', password: 'new-password' })
      .expect(201);
    expect(created.body).toMatchObject({ email: 'new@example.com', name: 'New', isActive: true });

    const list = await api().get('/admin-users').expect(200);
    expect(list.body).toHaveLength(2);
    for (const u of list.body) {
      expect(u).not.toHaveProperty('passwordHash');
    }
  });

  it('returns 409 for a duplicate email', async () => {
    const res = await api()
      .post('/admin-users')
      .send({ email: 'root@example.com', name: 'Dup', password: 'dup-password' })
      .expect(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('deactivating a user revokes their access immediately', async () => {
    const otherId = await createAdmin(prisma, {
      email: 'other@example.com',
      password: 'other-password',
    });
    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'other@example.com', password: 'other-password' })
      .expect(200);

    await api().patch(`/admin-users/${otherId}`).send({ isActive: false }).expect(200);

    await request(app.getHttpServer())
      .get('/admin-users')
      .set('Authorization', `Bearer ${otherLogin.body.accessToken}`)
      .expect(401);
  });

  it('refuses to deactivate yourself', async () => {
    const res = await api().patch(`/admin-users/${selfId}`).send({ isActive: false }).expect(400);
    expect(res.body.code).toBe('CANNOT_DEACTIVATE_SELF');
  });

  it('resets a password so only the new one works', async () => {
    const otherId = await createAdmin(prisma, {
      email: 'other@example.com',
      password: 'old-password',
    });

    await api()
      .post(`/admin-users/${otherId}/reset-password`)
      .send({ password: 'brand-new-password' })
      .expect(204);

    const server = app.getHttpServer();
    await request(server)
      .post('/auth/login')
      .send({ email: 'other@example.com', password: 'old-password' })
      .expect(401);
    await request(server)
      .post('/auth/login')
      .send({ email: 'other@example.com', password: 'brand-new-password' })
      .expect(200);
  });

  it('returns 404 for unknown ids and 400 for non-uuid ids', async () => {
    await api()
      .patch('/admin-users/33333333-3333-4333-8333-333333333333')
      .send({ name: 'x' })
      .expect(404);
    await api().patch('/admin-users/not-a-uuid').send({ name: 'x' }).expect(400);
  });

  it('has no DELETE endpoint', async () => {
    await request(app.getHttpServer())
      .delete(`/admin-users/${selfId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
