import type { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createAdmin, createTestApp, resetDb } from './utils';

/** The e2e Postgres doubles as a real "ERP" database so the pg driver is exercised end-to-end. */
function erpFromDatabaseUrl() {
  const url = new URL(process.env.DATABASE_URL as string);
  return {
    name: 'ERP-PG',
    dbType: 'POSTGRES',
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.replace(/^\//, ''),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

describe('ERP connections (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const erp = erpFromDatabaseUrl();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((b) =>
      b.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true }),
    ));
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

  const api = () => {
    const server = app.getHttpServer();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    return {
      get: (url: string) => auth(request(server).get(url)),
      post: (url: string) => auth(request(server).post(url)),
      patch: (url: string) => auth(request(server).patch(url)),
      delete: (url: string) => auth(request(server).delete(url)),
    };
  };

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/connections').expect(401);
  });

  it('creates a connection, encrypts the password and never returns it', async () => {
    const created = await api().post('/connections').send(erp).expect(201);
    expect(created.body).toMatchObject({
      name: 'ERP-PG',
      dbType: 'POSTGRES',
      hasPassword: true,
      ssl: false,
      trustServerCert: false,
      isActive: true,
      lastTestOk: null,
    });
    expect(Object.keys(created.body).sort()).toEqual(
      [
        'id',
        'name',
        'dbType',
        'host',
        'port',
        'database',
        'username',
        'hasPassword',
        'ssl',
        'trustServerCert',
        'isActive',
        'lastTestAt',
        'lastTestOk',
        'createdAt',
        'updatedAt',
      ].sort(),
    );

    const row = await prisma.erpConnection.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.passwordEnc).toMatch(/^v1:/);
    expect(row.passwordEnc).not.toContain(erp.password);

    const list = await api().get('/connections').expect(200);
    expect(list.body).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('v1:');
  });

  it('validates input and rejects duplicate names', async () => {
    const bad = await api()
      .post('/connections')
      .send({ ...erp, port: 0 })
      .expect(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');

    await api().post('/connections').send(erp).expect(201);
    const dup = await api().post('/connections').send(erp).expect(409);
    expect(dup.body.code).toBe('CONNECTION_NAME_TAKEN');
  });

  it('tests a real database connection and records the result', async () => {
    const { body: conn } = await api().post('/connections').send(erp).expect(201);

    const ok = await api().post(`/connections/${conn.id}/test`).expect(200);
    expect(ok.body).toMatchObject({ ok: true });
    expect(ok.body.error).toBeUndefined();

    const after = await api().get(`/connections/${conn.id}`).expect(200);
    expect(after.body.lastTestOk).toBe(true);
    expect(after.body.lastTestAt).toBe(ok.body.testedAt);
  });

  it('reports a failed test without leaking the password', async () => {
    const wrongPassword = 'definitely-wrong-pw-123';
    const { body: conn } = await api()
      .post('/connections')
      .send({ ...erp, password: wrongPassword })
      .expect(201);

    const res = await api().post(`/connections/${conn.id}/test`).expect(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toEqual(expect.any(String));
    expect(res.body.error).not.toContain(wrongPassword);

    const after = await api().get(`/connections/${conn.id}`).expect(200);
    expect(after.body.lastTestOk).toBe(false);
  });

  it('keeps the password when it is omitted on update and resets the test status', async () => {
    const { body: conn } = await api().post('/connections').send(erp).expect(201);
    await api().post(`/connections/${conn.id}/test`).expect(200);

    const renamed = await api()
      .patch(`/connections/${conn.id}`)
      .send({ name: 'Renamed' })
      .expect(200);
    expect(renamed.body).toMatchObject({ name: 'Renamed', hasPassword: true, lastTestOk: true });

    const moved = await api().patch(`/connections/${conn.id}`).send({ port: erp.port }).expect(200);
    expect(moved.body.lastTestOk).toBeNull();

    const retest = await api().post(`/connections/${conn.id}/test`).expect(200);
    expect(retest.body.ok).toBe(true);
  });

  it('deletes unused connections but refuses ones in use', async () => {
    const { body: unused } = await api().post('/connections').send(erp).expect(201);
    await api().delete(`/connections/${unused.id}`).expect(204);
    await api().get(`/connections/${unused.id}`).expect(404);

    const { body: used } = await api().post('/connections').send(erp).expect(201);
    await prisma.erpSyncConfig.create({
      data: { connectionId: used.id, name: 'PR/PO', kind: 'OUTBOX', querySql: 'SELECT 1' },
    });
    const res = await api().delete(`/connections/${used.id}`).expect(409);
    expect(res.body).toMatchObject({
      code: 'CONNECTION_IN_USE',
      details: { syncConfigs: 1, contacts: 0, mails: 0 },
    });
  });

  it('returns 404 for unknown ids and 400 for malformed ids', async () => {
    const missing = await api()
      .get('/connections/11111111-1111-4111-8111-111111111111')
      .expect(404);
    expect(missing.body.code).toBe('CONNECTION_NOT_FOUND');
    await api().post('/connections/not-a-uuid/test').expect(400);
  });
});
