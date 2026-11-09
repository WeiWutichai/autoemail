import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import type { WorkerEnv } from '../config/env';
import { SyncRunnerService } from '../sync/sync-runner.service';
import { SYNC_QUEUE, syncRunJobId } from './queues';
import { redisConnection } from './redis-connection';

type SyncJob = { name: 'tick' } | { name: 'run'; configId: string };
type SyncQueue = Pick<Queue, 'addBulk'>;

/**
 * Every SYNC_TICK_SEC a repeatable `tick` job enqueues one `run` job per due sync config.
 * The job id is derived from the config id, so a config is never queued twice at once.
 */
@Injectable()
export class SyncScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SyncScheduler.name);
  private queue?: Queue;
  private worker?: Worker;
  private target?: SyncQueue;

  constructor(
    private readonly config: ConfigService<WorkerEnv, true>,
    private readonly runner: SyncRunnerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const connection = redisConnection(this.config.get('REDIS_URL', { infer: true }));
    const tickMs = this.config.get('SYNC_TICK_SEC', { infer: true }) * 1000;

    this.queue = new Queue(SYNC_QUEUE, {
      connection,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 },
    });
    this.target = this.queue;
    await this.queue.upsertJobScheduler('sync-tick', { every: tickMs }, { name: 'tick' });

    this.worker = new Worker(
      SYNC_QUEUE,
      (job: Job<{ configId?: string }>) =>
        this.handle(
          job.name === 'run' && job.data.configId
            ? { name: 'run', configId: job.data.configId }
            : { name: 'tick' },
        ),
      { connection, concurrency: 2 },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Sync job ${job?.name ?? '?'} failed: ${err.message}`),
    );
    this.logger.log(`Sync scheduler started (tick every ${tickMs / 1000}s)`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** Exposed for tests: route enqueued jobs to a fake queue. */
  useQueue(queue: SyncQueue): void {
    this.target = queue;
  }

  async handle(job: SyncJob): Promise<void> {
    if (job.name === 'tick') return this.tick();
    try {
      await this.runner.run(job.configId);
    } catch (err) {
      // Deleted / deactivated since it was queued, or "Sync now" is running it in this process.
      if (err instanceof NotFoundException || err instanceof ConflictException) return;
      throw err;
    }
  }

  private async tick(): Promise<void> {
    const due = await this.runner.findDue();
    if (due.length === 0 || !this.target) return;
    await this.target.addBulk(
      due.map((configId) => ({
        name: 'run',
        data: { configId },
        opts: { jobId: syncRunJobId(configId) },
      })),
    );
  }
}
