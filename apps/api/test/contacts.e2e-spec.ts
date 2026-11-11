import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  createOutboxFixture,
  dropOutboxFixture,
  OUTBOX_QUERY,
  PR_TEMPLATE,
} from './outbox-fixture';
import {
  createAdmin,
  createTestApp,
  erpFromDatabaseUrl,
  loginApi,
  resetDb,
  type TestApi,
} from './utils';

describe('Contacts: recipients, manual addresses and per-database suppression (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let api: TestApi;
  let connId: string;
  let configId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await createOutboxFixture(prisma, [
      ['PR', 'PR-1', 'Buyer@Example.com'],
      ['PR', 'PR-1', 'manager@example.com'],
      ['PO', 'PO-2', 'buyer@example.com'],
    ]);
    await createAdmin(prisma, { email: 'root@example.com', password: 'root-password' });
    api = await loginApi(app, 'root@example.com', 'root-password');
    ({
      body: { id: connId },
    } = await api.post('/connections').send(erpFromDatabaseUrl()).expect(201));
    const { body: template } = await api.post('/templates').send(PR_TEMPLATE).expect(201);
    ({
      body: { id: configId },
    } = await api
      .post('/sync-configs')
      .send({
        connectionId: connId,
        name: 'PR/PO',
        kind: 'OUTBOX',
        querySql: OUTBOX_QUERY,
        templateId: template.id,
        isActive: false,
      })
      .expect(201));
  });

  afterAll(async () => {
    await dropOutboxFixture(prisma);
    await app.close();
  });

  it('collects the recipients of an outbox sync without queueing any mail', async () => {
    const { body } = await api.post(`/sync-configs/${configId}/collect-contacts`).expect(200);
    expect(body).toEqual({ fetched: 3, created: 2, updated: 0 });
    expect(await prisma.mailQueue.count()).toBe(0);

    const { body: list } = await api.get('/contacts?source=ERP').expect(200);
    expect(list.items.map((c: { email: string }) => c.email)).toEqual([
      'buyer@example.com',
      'manager@example.com',
    ]);
    expect(list.items[0]).toMatchObject({
      source: 'ERP',
      connectionId: connId,
      connectionName: 'ERP-PG',
      company: 'จัดซื้อ',
    });

    // Collected contacts mirror the ERP and cannot be edited here.
    const { body: ro } = await api
      .patch(`/contacts/${list.items[0].id}`)
      .send({ name: 'x' })
      .expect(409);
    expect(ro.code).toBe('CONTACT_FROM_ERP');

    // A second run updates instead of duplicating.
    const { body: again } = await api.post(`/sync-configs/${configId}/collect-contacts`);
    expect(again).toEqual({ fetched: 3, created: 0, updated: 2 });
  });

  it('adds, edits and deletes manual addresses', async () => {
    const { body: created } = await api
      .post('/contacts')
      .send({ email: ' Outside@Partner.com ', name: 'คุณภายนอก', company: '' })
      .expect(201);
    expect(created).toMatchObject({
      source: 'MANUAL',
      email: 'outside@partner.com',
      name: 'คุณภายนอก',
      company: null,
      connectionId: null,
      erpRefId: null,
    });

    const { body: dup } = await api
      .post('/contacts')
      .send({ email: 'outside@partner.com' })
      .expect(409);
    expect(dup.code).toBe('CONTACT_EXISTS');

    const { body: edited } = await api
      .patch(`/contacts/${created.id}`)
      .send({ company: 'บริษัทคู่ค้า', connectionId: connId })
      .expect(200);
    expect(edited).toMatchObject({ company: 'บริษัทคู่ค้า', connectionName: 'ERP-PG' });

    const { body: manual } = await api.get('/contacts?source=MANUAL').expect(200);
    expect(manual.total).toBe(1);

    await api.delete(`/contacts/${created.id}`).expect(204);
    await api.delete(`/contacts/${created.id}`).expect(404);
  });

  it('applies a suppression to its own database only, and every-database ones to all', async () => {
    await api
      .post('/suppressions')
      .send({ email: 'manager@example.com', connectionId: connId })
      .expect(201);
    // A suppression scoped to some other database does not stop this one.
    const { body: other } = await api
      .post('/connections')
      .send(erpFromDatabaseUrl('Other-ERP'))
      .expect(201);
    await api
      .post('/suppressions')
      .send({ email: 'buyer@example.com', connectionId: other.id })
      .expect(201);

    const { body: run } = await api.post(`/sync-configs/${configId}/run`).expect(200);
    expect(run.result).toMatchObject({ fetched: 3, created: 2, skipped: 1 });
    const queued = await prisma.mailQueue.findMany({ select: { toAddrs: true } });
    expect(queued.flatMap((m) => m.toAddrs).sort()).toEqual([
      'buyer@example.com',
      'buyer@example.com',
    ]);

    // The run also stored its recipients as contacts.
    expect(await prisma.contact.count({ where: { source: 'ERP' } })).toBe(2);
  });
});
