import type { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  createAdmin,
  createTestApp,
  erpFromDatabaseUrl,
  loginApi,
  resetDb,
  type TestApi,
} from './utils';

describe('Logs, audit and PDPA (e2e)', () => {
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
    await createAdmin(prisma, { email: 'root@example.com', password: 'root-password' });
    api = await loginApi(app, 'root@example.com', 'root-password');
    const { body } = await api.post('/connections').send(erpFromDatabaseUrl()).expect(201);
    connectionId = body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const mail = (erpRefId: string, status: 'PENDING' | 'SENT' | 'DEAD', to = 'buyer@example.com') =>
    prisma.mailQueue.create({
      data: {
        connectionId,
        erpRefId,
        toAddrs: [to],
        renderedSubject: `[รออนุมัติ] ${erpRefId}`,
        renderedHtml: '<p>x</p>',
        renderedText: 'x',
        status,
        attempts: status === 'DEAD' ? 5 : 0,
        sentAt: status === 'SENT' ? new Date() : null,
        lastError: status === 'DEAD' ? '550 no such user' : null,
        logs: { create: { event: 'QUEUED' } },
      },
    });

  it('requires authentication on every admin endpoint', async () => {
    const server = app.getHttpServer();
    for (const path of [
      '/mails',
      '/mails/stats',
      '/audit-logs',
      '/connections',
      '/sync-configs',
      '/contacts',
      '/smtp-configs',
      '/templates',
      '/admin-users',
    ]) {
      await request(server).get(path).expect(401);
    }
    await request(server).post('/pdpa/erase').send({ email: 'a@x.com' }).expect(401);
  });

  it('lists, filters and shows mails with their timeline', async () => {
    await mail('PR:1', 'SENT');
    const dead = await mail('PR:2', 'DEAD', 'nobody@example.com');
    await mail('PO:3', 'PENDING');

    const all = await api.get('/mails').expect(200);
    expect(all.body.total).toBe(3);
    const deadOnly = await api.get('/mails?status=DEAD').expect(200);
    expect(deadOnly.body.items.map((m: { id: string }) => m.id)).toEqual([dead.id]);
    const byEmail = await api.get('/mails?q=NOBODY@example.com').expect(200);
    expect(byEmail.body.total).toBe(1);
    const byRef = await api.get('/mails?q=po:').expect(200);
    expect(byRef.body.items[0].erpRefId).toBe('PO:3');

    const detail = await api.get(`/mails/${dead.id}`).expect(200);
    expect(detail.body).toMatchObject({
      status: 'DEAD',
      html: '<p>x</p>',
      contentRemoved: false,
      connectionName: 'ERP-PG',
      logs: [{ event: 'QUEUED' }],
    });

    const stats = await api.get('/mails/stats').expect(200);
    expect(stats.body).toMatchObject({ sentToday: 1, waiting: 1, dead: 1 });
  });

  it('retries dead mails, cancels pending ones and audits both', async () => {
    const dead = await mail('PR:2', 'DEAD');
    const pending = await mail('PO:3', 'PENDING');

    const retried = await api.post(`/mails/${dead.id}/retry`).expect(200);
    expect(retried.body).toMatchObject({ status: 'PENDING', attempts: 0 });
    expect(retried.body.logs.at(-1)).toMatchObject({
      event: 'RETRY',
      detail: 'Manual retry by root@example.com',
    });

    const cancelled = await api.post(`/mails/${pending.id}/cancel`).expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    const conflict = await api.post(`/mails/${pending.id}/retry`).expect(409);
    expect(conflict.body.code).toBe('MAIL_STATE_CONFLICT');

    const audit = await api.get('/audit-logs').expect(200);
    expect(audit.body.items.map((a: { action: string }) => a.action)).toEqual([
      'mail.cancel',
      'mail.retry',
      'connection.create',
    ]);
    expect(audit.body.items[0]).toMatchObject({
      adminEmail: 'root@example.com',
      target: pending.id,
    });
  });

  it('never stores secrets in the audit log', async () => {
    await api
      .post('/smtp-configs')
      .send({
        name: 'Workspace',
        host: 'smtp.gmail.com',
        port: 587,
        username: 'relay@example.com',
        password: 'super-secret-app-password',
        fromName: 'ERP',
        fromEmail: 'relay@example.com',
      })
      .expect(201);
    const audit = await api.get('/audit-logs?action=smtp').expect(200);
    expect(audit.body.items).toHaveLength(1);
    expect(audit.body.items[0].diff).toMatchObject({ password: '***', host: 'smtp.gmail.com' });
    const raw = await prisma.adminAuditLog.findMany();
    expect(JSON.stringify(raw)).not.toContain('super-secret-app-password');
    // The e2e DB password equals its username, so check the masked field instead of the text.
    expect(raw.find((r) => r.action === 'connection.create')?.diff).toMatchObject({
      password: '***',
    });
  });

  it('erases personal data on a PDPA request but keeps the dedupe key', async () => {
    await prisma.contact.create({
      data: { connectionId, erpRefId: 'PUR', email: 'buyer@example.com', name: 'Buyer' },
    });
    const sent = await mail('PR:1:buyer@example.com', 'SENT');
    const pending = await mail('PR:2:buyer@example.com', 'PENDING');
    const other = await mail('PR:3:x@example.com', 'SENT', 'x@example.com');

    const res = await api.post('/pdpa/erase').send({ email: 'Buyer@Example.com' }).expect(200);
    expect(res.body).toEqual({ contactsDeleted: 1, mailsScrubbed: 2 });

    const scrubbed = await prisma.mailQueue.findUniqueOrThrow({ where: { id: sent.id } });
    expect(scrubbed).toMatchObject({
      toAddrs: ['erased@invalid'],
      renderedHtml: null,
      status: 'SENT',
      erpRefId: 'PR:1:buyer@example.com',
    });
    expect((await prisma.mailQueue.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe(
      'CANCELLED',
    );
    expect(
      (await prisma.mailQueue.findUniqueOrThrow({ where: { id: other.id } })).renderedHtml,
    ).toBe('<p>x</p>');
    const detail = await api.get(`/mails/${sent.id}`).expect(200);
    expect(detail.body.contentRemoved).toBe(true);
  });
});
