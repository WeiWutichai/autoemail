import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createAdmin, createTestApp, resetDb } from './utils';

describe('Suppressions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await createAdmin(prisma, { email: 'root@example.com', password: 'root-password' });
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'root@example.com', password: 'root-password' })
      .expect(200);
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  it('adds, lists, rejects duplicates, audits and removes', async () => {
    const server = app.getHttpServer();
    await request(server).get('/suppressions').expect(401);

    const created = await auth(request(server).post('/suppressions'))
      .send({ email: ' Boss@Example.com ', reason: 'ไม่ต้องรับแจ้งเตือน' })
      .expect(201);
    expect(created.body).toMatchObject({
      email: 'boss@example.com',
      reason: 'ไม่ต้องรับแจ้งเตือน',
    });

    const dup = await auth(request(server).post('/suppressions'))
      .send({ email: 'boss@example.com' })
      .expect(409);
    expect(dup.body.code).toBe('SUPPRESSION_EXISTS');
    await auth(request(server).post('/suppressions')).send({ email: 'bad' }).expect(400);

    // A second every-database entry for the same address is a duplicate too.
    await auth(request(server).post('/suppressions'))
      .send({ email: 'boss@example.com', connectionId: null })
      .expect(409);
    await auth(request(server).post('/suppressions'))
      .send({ email: 'boss@example.com', connectionId: '33333333-3333-4333-8333-333333333333' })
      .expect(404);

    const list = await auth(request(server).get('/suppressions')).expect(200);
    expect(list.body.map((s: { email: string }) => s.email)).toEqual(['boss@example.com']);

    await auth(request(server).delete(`/suppressions/${created.body.id}`)).expect(204);
    await auth(request(server).delete(`/suppressions/${created.body.id}`)).expect(404);
    expect(await prisma.suppressedEmail.count()).toBe(0);

    const actions = await prisma.adminAuditLog.findMany({ select: { action: true } });
    expect(actions.map((a) => a.action).sort()).toEqual([
      'suppression.create',
      'suppression.delete',
    ]);
  });
});
