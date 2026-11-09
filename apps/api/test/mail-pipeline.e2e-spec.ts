import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DeliveryService } from '../src/delivery/delivery.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { WorkerModule } from '../src/worker/worker.module';
import { FakeSmtp } from './fake-smtp';
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

const minutes = (n: number) => n * 60_000;

/** ERP outbox → mail_queue → SMTP, driving the worker's DeliveryService directly. */
describe('Mail pipeline (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let workerRef: TestingModule;
  let delivery: DeliveryService;
  let api: TestApi;
  let configId: string;
  let smtpId: string;
  const smtp = new FakeSmtp();

  beforeAll(async () => {
    await smtp.start();
    ({ app, prisma } = await createTestApp((b) =>
      b.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true }),
    ));
    // Compiled but not initialised: no BullMQ schedulers, we call the service ourselves.
    workerRef = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    delivery = workerRef.get(DeliveryService);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    smtp.received.length = 0;
    smtp.rejectRecipients.clear();
    await createOutboxFixture(prisma, [
      ['PR', 'PR6911-0001', 'Buyer@Example.com'],
      ['PR', 'PR6911-0001', 'manager@example.com'],
      ['PO', 'PO6911-0002', 'buyer@example.com'],
    ]);
    await createAdmin(prisma, { email: 'root@example.com', password: 'root-password' });
    api = await loginApi(app, 'root@example.com', 'root-password');

    const { body: conn } = await api.post('/connections').send(erpFromDatabaseUrl()).expect(201);
    const { body: smtpConfig } = await api
      .post('/smtp-configs')
      .send({
        name: 'Fake',
        host: '127.0.0.1',
        port: smtp.port,
        fromName: 'ERP Relay',
        fromEmail: 'relay@example.com',
      })
      .expect(201);
    smtpId = smtpConfig.id;
    const { body: template } = await api.post('/templates').send(PR_TEMPLATE).expect(201);
    const { body: config } = await api
      .post('/sync-configs')
      .send({
        connectionId: conn.id,
        name: 'PR/PO รออนุมัติ',
        kind: 'OUTBOX',
        querySql: OUTBOX_QUERY,
        templateId: template.id,
      })
      .expect(201);
    configId = config.id;
  });

  afterAll(async () => {
    await dropOutboxFixture(prisma);
    await workerRef.close();
    await app.close();
    await smtp.stop();
  });

  const sendAllDue = async (now = new Date()) => {
    const outcomes = [];
    for (const id of await delivery.findDue(100, now))
      outcomes.push(await delivery.process(id, now));
    return outcomes;
  };

  it('sends each pending document once per recipient', async () => {
    const first = await api.post(`/sync-configs/${configId}/run`).expect(200);
    expect(first.body.result).toMatchObject({ fetched: 3, created: 3, skipped: 0, errors: 0 });

    expect(await sendAllDue()).toEqual(['sent', 'sent', 'sent']);
    expect(smtp.received.map((m) => m.to[0]).sort()).toEqual([
      'buyer@example.com',
      'buyer@example.com',
      'manager@example.com',
    ]);
    const mail = await prisma.mailQueue.findFirstOrThrow({
      where: { erpRefId: 'PR:PR6911-0001:manager@example.com' },
      include: { logs: { orderBy: { createdAt: 'asc' } } },
    });
    expect(mail).toMatchObject({
      status: 'SENT',
      attempts: 1,
      smtpConfigId: smtpId,
      renderedSubject: '[รออนุมัติ] PR PR6911-0001',
    });
    expect(mail.renderedHtml).toContain('9 พฤศจิกายน 2569');
    expect(mail.logs.map((l) => l.event)).toEqual(['QUEUED', 'SENDING', 'SENT']);

    const again = await api.post(`/sync-configs/${configId}/run`).expect(200);
    expect(again.body.result).toMatchObject({ created: 0, skipped: 3 });
    expect(await sendAllDue()).toEqual([]);
    expect(smtp.received).toHaveLength(3);
  });

  it('retries with backoff while SMTP is down and sends once it is back', async () => {
    await createOutboxFixture(prisma, [['PO', 'PO6911-0009', 'buyer@example.com']]);
    await api.post(`/sync-configs/${configId}/run`).expect(200);
    const port = smtp.port;
    await smtp.stop();

    const t0 = new Date();
    expect(await sendAllDue(t0)).toEqual(['failed']);
    const failed = await prisma.mailQueue.findFirstOrThrow();
    expect(failed).toMatchObject({ status: 'FAILED', attempts: 1 });
    expect(failed.nextRetryAt?.getTime()).toBe(t0.getTime() + minutes(1));
    expect(await sendAllDue(t0)).toEqual([]);

    await smtp.start(port);
    expect(await sendAllDue(new Date(t0.getTime() + minutes(2)))).toEqual(['sent']);
    const sent = await prisma.mailQueue.findFirstOrThrow({
      include: { logs: { orderBy: { createdAt: 'asc' } } },
    });
    expect(sent).toMatchObject({ status: 'SENT', attempts: 2, lastError: null });
    expect(sent.logs.map((l) => l.event)).toEqual([
      'QUEUED',
      'SENDING',
      'FAILED',
      'SENDING',
      'SENT',
    ]);
  });

  it('marks a rejected recipient DEAD without retrying', async () => {
    await createOutboxFixture(prisma, [['PR', 'PR6911-0003', 'nobody@example.com']]);
    smtp.rejectRecipients.add('nobody@example.com');
    await api.post(`/sync-configs/${configId}/run`).expect(200);

    expect(await sendAllDue()).toEqual(['dead']);
    const mail = await prisma.mailQueue.findFirstOrThrow();
    expect(mail).toMatchObject({ status: 'DEAD', attempts: 1, nextRetryAt: null });
    expect(mail.lastError).toContain('550');
  });

  it('postpones mails over the daily limit to the next day', async () => {
    await api.patch(`/smtp-configs/${smtpId}`).send({ dailyLimit: 2 }).expect(200);
    await api.post(`/sync-configs/${configId}/run`).expect(200);

    expect(await sendAllDue()).toEqual(['sent', 'sent', 'deferred']);
    const deferred = await prisma.mailQueue.findFirstOrThrow({ where: { status: 'PENDING' } });
    expect(deferred.nextRetryAt?.getTime()).toBeGreaterThan(Date.now());
    expect(deferred.lastError).toContain('Daily limit');
    expect(deferred.attempts).toBe(0);
  });

  it('recovers mails stuck in SENDING', async () => {
    await api.post(`/sync-configs/${configId}/run`).expect(200);
    await prisma.mailQueue.updateMany({ data: { status: 'SENDING' } });
    expect(await delivery.recoverStuck(new Date(Date.now() + minutes(11)))).toBe(3);
    expect(await prisma.mailQueue.count({ where: { status: 'PENDING' } })).toBe(3);
  });
});
