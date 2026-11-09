import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { PrismaService } from '../src/prisma/prisma.service';
import { SYNC_QUEUE } from '../src/worker/queues';
import { redisConnection } from '../src/worker/redis-connection';
import { WorkerModule } from '../src/worker/worker.module';
import { CryptoService } from '../src/common/crypto/crypto.service';
import { erpFromDatabaseUrl, resetDb } from './utils';

const FIXTURE = 'erp_fixture_worker_contacts';

describe('Worker scheduled sync (e2e, needs Redis)', () => {
  let worker: INestApplicationContext;
  let prisma: PrismaService;

  beforeAll(async () => {
    const queue = new Queue(SYNC_QUEUE, {
      connection: redisConnection(process.env.REDIS_URL as string),
    });
    await queue.obliterate({ force: true });
    await queue.close();

    const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    worker = moduleRef;
    prisma = moduleRef.get(PrismaService);
    await resetDb(prisma);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${FIXTURE}`);
    await prisma.$executeRawUnsafe(`CREATE TABLE ${FIXTURE} (ref text, mail text)`);
    await prisma.$executeRawUnsafe(`INSERT INTO ${FIXTURE} VALUES ('W1', 'w1@example.com')`);

    const { password, ...erp } = erpFromDatabaseUrl('ERP-WORKER');
    const conn = await prisma.erpConnection.create({
      data: { ...erp, passwordEnc: moduleRef.get(CryptoService).encrypt(password) },
    });
    await prisma.erpSyncConfig.create({
      data: {
        connectionId: conn.id,
        name: 'Scheduled contacts',
        kind: 'CONTACTS',
        querySql: `SELECT ref AS erp_ref_id, mail AS email FROM ${FIXTURE}`,
      },
    });
    await moduleRef.init();
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${FIXTURE}`);
    await worker.close();
  });

  it('runs due sync configs on its own', async () => {
    await vi.waitFor(
      async () => {
        expect(await prisma.contact.count({ where: { erpRefId: 'W1' } })).toBe(1);
      },
      { timeout: 15000, interval: 250 },
    );
    const config = await prisma.erpSyncConfig.findFirstOrThrow();
    expect(config.lastSyncedAt).not.toBeNull();
    expect(config.lastResult).toMatchObject({ created: 1 });
  });
});
