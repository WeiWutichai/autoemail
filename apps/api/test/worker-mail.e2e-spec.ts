import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { CryptoService } from '../src/common/crypto/crypto.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { MAINTENANCE_QUEUE, SEND_QUEUE, SYNC_QUEUE } from '../src/worker/queues';
import { redisConnection } from '../src/worker/redis-connection';
import { WorkerModule } from '../src/worker/worker.module';
import { FakeSmtp } from './fake-smtp';
import {
  createOutboxFixture,
  dropOutboxFixture,
  OUTBOX_QUERY,
  PR_TEMPLATE,
} from './outbox-fixture';
import { erpFromDatabaseUrl, resetDb } from './utils';

/** Full loop with BullMQ + Redis: the worker syncs the outbox and sends on its own. */
describe('Worker mail loop (e2e, needs Redis)', () => {
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
    await createOutboxFixture(prisma, [
      ['PR', 'PR6911-0101', 'a@example.com'],
      ['PO', 'PO6911-0102', 'b@example.com'],
    ]);

    const { password, ...erp } = erpFromDatabaseUrl('ERP-WORKER-MAIL');
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
      },
    });
    const template = await prisma.mailTemplate.create({ data: PR_TEMPLATE });
    await prisma.erpSyncConfig.create({
      data: {
        connectionId: conn.id,
        name: 'PR/PO',
        kind: 'OUTBOX',
        querySql: OUTBOX_QUERY,
        templateId: template.id,
      },
    });
    await moduleRef.init();
  });

  afterAll(async () => {
    await worker.close();
    await dropOutboxFixture(prisma);
    await smtp.stop();
  });

  it('syncs the ERP outbox and delivers every mail', async () => {
    await vi.waitFor(() => expect(smtp.received).toHaveLength(2), {
      timeout: 20000,
      interval: 250,
    });
    await vi.waitFor(async () =>
      expect(await prisma.mailQueue.count({ where: { status: 'SENT' } })).toBe(2),
    );
    expect(smtp.received.flatMap((m) => m.to).sort()).toEqual(['a@example.com', 'b@example.com']);
  });
});
