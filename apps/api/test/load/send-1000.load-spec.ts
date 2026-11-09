import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { CryptoService } from '../../src/common/crypto/crypto.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MAINTENANCE_QUEUE, SEND_QUEUE, SYNC_QUEUE } from '../../src/worker/queues';
import { redisConnection } from '../../src/worker/redis-connection';
import { WorkerModule } from '../../src/worker/worker.module';
import { FakeSmtp } from '../fake-smtp';
import { OUTBOX_FIXTURE, OUTBOX_QUERY, PR_TEMPLATE } from '../outbox-fixture';
import { erpFromDatabaseUrl, resetDb } from '../utils';

const TOTAL = Number(process.env.LOAD_TOTAL ?? 1000);

/** DESIGN M6 QC: 1,000 mails from the ERP outbox through BullMQ to SMTP, no loss, no duplicates. */
describe(`Load: ${TOTAL} mails end-to-end`, () => {
  let worker: INestApplicationContext;
  let prisma: PrismaService;
  const smtp = new FakeSmtp();

  beforeAll(async () => {
    await smtp.start();
    for (const name of [SYNC_QUEUE, SEND_QUEUE, MAINTENANCE_QUEUE]) {
      const queue = new Queue(name, {
        connection: redisConnection(process.env.REDIS_URL as string),
      });
      await queue.obliterate({ force: true });
      await queue.close();
    }
    const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    worker = moduleRef;
    prisma = moduleRef.get(PrismaService);
    await resetDb(prisma);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${OUTBOX_FIXTURE}`);
    await prisma.$executeRawUnsafe(
      `CREATE TABLE ${OUTBOX_FIXTURE} (doc_type text, order_no text, doc_date timestamp, supplier_name text, department text, email text)`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO ${OUTBOX_FIXTURE}
       SELECT 'PR', 'PR-' || g, '2026-11-09', 'Supplier ' || g, 'Dept', 'user' || g || '@example.com'
       FROM generate_series(1, ${TOTAL}) g`,
    );
    const { password, ...erp } = erpFromDatabaseUrl('ERP-LOAD');
    const conn = await prisma.erpConnection.create({
      data: { ...erp, passwordEnc: moduleRef.get(CryptoService).encrypt(password) },
    });
    await prisma.smtpConfig.create({
      data: {
        name: 'Fake',
        host: '127.0.0.1',
        port: smtp.port,
        fromName: 'ERP',
        fromEmail: 'relay@example.com',
        isDefault: true,
        dailyLimit: TOTAL * 2,
      },
    });
    const template = await prisma.mailTemplate.create({ data: PR_TEMPLATE });
    await prisma.erpSyncConfig.create({
      data: {
        connectionId: conn.id,
        name: 'Load',
        kind: 'OUTBOX',
        querySql: OUTBOX_QUERY,
        templateId: template.id,
      },
    });
  });

  afterAll(async () => {
    await worker.close();
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${OUTBOX_FIXTURE}`);
    await smtp.stop();
  });

  it('enqueues and delivers every mail exactly once', async () => {
    const started = Date.now();
    await worker.init();

    await vi.waitFor(async () => expect(await prisma.mailQueue.count()).toBe(TOTAL), {
      timeout: 120_000,
      interval: 500,
    });
    const enqueuedMs = Date.now() - started;

    await vi.waitFor(
      async () => expect(await prisma.mailQueue.count({ where: { status: 'SENT' } })).toBe(TOTAL),
      { timeout: 600_000, interval: 1000 },
    );
    const totalMs = Date.now() - started;

    const recipients = smtp.received.flatMap((m) => m.to);
    expect(recipients).toHaveLength(TOTAL);
    expect(new Set(recipients).size).toBe(TOTAL);
    const config = await prisma.erpSyncConfig.findFirstOrThrow();
    expect(config.lastResult).toMatchObject({ fetched: TOTAL, created: TOTAL, errors: 0 });

    process.stdout.write(
      `\n[load] ${TOTAL} mails: enqueued in ${(enqueuedMs / 1000).toFixed(1)}s, all sent in ${(totalMs / 1000).toFixed(1)}s ` +
        `(SEND_CONCURRENCY=${process.env.SEND_CONCURRENCY}, SEND_RATE_PER_SEC=${process.env.SEND_RATE_PER_SEC})\n`,
    );
  });
});
