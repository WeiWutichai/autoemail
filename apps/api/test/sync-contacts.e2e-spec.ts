import type { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  createAdmin,
  createTestApp,
  erpFromDatabaseUrl,
  loginApi,
  resetDb,
  type TestApi,
} from './utils';

/** Fake ERP table living in the e2e database (outside Prisma's schema). */
const FIXTURE = 'erp_fixture_z_mail';
const QUERY = `SELECT dept_code || ':' || lower("Email") AS erp_ref_id, "Email" AS z_email, dept_name AS name, dept_code AS company FROM ${FIXTURE}`;

describe('Sync configs + contacts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let api: TestApi;
  let connectionId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((b) =>
      b.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true }),
    ));
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${FIXTURE}`);
    await prisma.$executeRawUnsafe(
      `CREATE TABLE ${FIXTURE} (dept_code text, "Email" text, dept_name text)`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO ${FIXTURE} (dept_code, "Email", dept_name) VALUES
        ('PUR', 'buyer@example.com', 'Purchasing'),
        ('ACC', 'acc@example.com', 'Accounting'),
        ('BAD', 'not-an-email', 'Broken')`,
    );
    await createAdmin(prisma, { email: 'root@example.com', password: 'root-password' });
    api = await loginApi(app, 'root@example.com', 'root-password');
    const { body } = await api.post('/connections').send(erpFromDatabaseUrl()).expect(201);
    connectionId = body.id;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${FIXTURE}`);
    await app.close();
  });

  const createConfig = (overrides: Record<string, unknown> = {}) =>
    api.post('/sync-configs').send({
      connectionId,
      name: 'Department mail',
      kind: 'CONTACTS',
      querySql: QUERY,
      columnMapping: { email: 'z_email' },
      ...overrides,
    });

  it('rejects non-SELECT queries', async () => {
    const res = await createConfig({ querySql: `DELETE FROM ${FIXTURE}` }).expect(400);
    expect(res.body.code).toBe('SQL_NOT_ALLOWED');
  });

  it('previews the query with mapped columns', async () => {
    const res = await api
      .post('/sync-configs/preview')
      .send({
        connectionId,
        kind: 'CONTACTS',
        querySql: QUERY,
        columnMapping: { email: 'z_email' },
      })
      .expect(200);
    expect(res.body.rowCount).toBe(3);
    expect(res.body.columns).toEqual(expect.arrayContaining(['erp_ref_id', 'email', 'name']));
    expect(res.body.missingColumns).toEqual([]);

    const missing = await api
      .post('/sync-configs/preview')
      .send({ connectionId, kind: 'CONTACTS', querySql: QUERY })
      .expect(200);
    expect(missing.body.missingColumns).toEqual(['email']);

    const broken = await api
      .post('/sync-configs/preview')
      .send({ connectionId, kind: 'CONTACTS', querySql: 'SELECT nope FROM missing_table' })
      .expect(422);
    expect(broken.body.code).toBe('ERP_QUERY_FAILED');
  });

  it('syncs contacts and does not duplicate them on re-run', async () => {
    const { body: config } = await createConfig().expect(201);
    expect(config).toMatchObject({ kind: 'CONTACTS', connectionName: 'ERP-PG', lastResult: null });

    const first = await api.post(`/sync-configs/${config.id}/run`).expect(200);
    expect(first.body).toMatchObject({
      ok: true,
      result: { fetched: 3, created: 2, updated: 0, errors: 1 },
    });
    expect(first.body.result.messages).toEqual([
      'erp_ref_id BAD:not-an-email: missing or invalid email',
    ]);

    await prisma.$executeRawUnsafe(
      `UPDATE ${FIXTURE} SET dept_name = 'Procurement' WHERE dept_code = 'PUR'`,
    );
    const second = await api.post(`/sync-configs/${config.id}/run`).expect(200);
    expect(second.body.result).toMatchObject({ created: 0, updated: 2 });
    expect(await prisma.contact.count()).toBe(2);

    const list = await api.get('/contacts?q=procure').expect(200);
    expect(list.body).toMatchObject({ total: 1, page: 1, pageSize: 25 });
    expect(list.body.items[0]).toMatchObject({
      erpRefId: 'PUR:buyer@example.com',
      email: 'buyer@example.com',
      name: 'Procurement',
      company: 'PUR',
      connectionName: 'ERP-PG',
    });

    const after = await api.get(`/sync-configs/${config.id}`).expect(200);
    expect(after.body.lastResult).toMatchObject({ updated: 2 });
    expect(after.body.lastSyncedAt).not.toBeNull();
  });

  it('records ERP failures on the config', async () => {
    const { body: config } = await createConfig({ querySql: 'SELECT x FROM missing_table' }).expect(
      201,
    );
    const res = await api.post(`/sync-configs/${config.id}/run`).expect(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain('missing_table');
    const after = await api.get(`/sync-configs/${config.id}`).expect(200);
    expect(after.body.lastError).toContain('missing_table');
  });

  it('updates and deletes a config', async () => {
    const { body: config } = await createConfig().expect(201);
    const updated = await api
      .patch(`/sync-configs/${config.id}`)
      .send({ pollIntervalSec: 600, columnMapping: null })
      .expect(200);
    expect(updated.body).toMatchObject({ pollIntervalSec: 600, columnMapping: null });
    await api.delete(`/sync-configs/${config.id}`).expect(204);
    await api.get(`/sync-configs/${config.id}`).expect(404);
  });
});
