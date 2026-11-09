import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import type { WorkerEnv } from '../config/env';
import { DeliveryService } from '../delivery/delivery.service';
import { SEND_QUEUE, sendJobId } from './queues';
import { redisConnection } from './redis-connection';

const DISPATCH_BATCH = 200;

type SendJob = { name: 'tick' } | { name: 'send'; queueId: string };
type SendQueue = Pick<Queue, 'addBulk'>;

/**
 * A repeatable `tick` enqueues one `send` job per due mail (job id = mail id, so a mail is never
 * queued twice at once). The worker runs SEND_CONCURRENCY jobs in parallel, rate-limited to
 * SEND_RATE_PER_SEC.
 */
@Injectable()
export class SendScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SendScheduler.name);
  private queue?: Queue;
  private worker?: Worker;
  private target?: SendQueue;

  constructor(
    private readonly config: ConfigService<WorkerEnv, true>,
    private readonly delivery: DeliveryService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const connection = redisConnection(this.config.get('REDIS_URL', { infer: true }));
    const tickMs = this.config.get('SEND_TICK_SEC', { infer: true }) * 1000;
    const concurrency = this.config.get('SEND_CONCURRENCY', { infer: true });
    const rate = this.config.get('SEND_RATE_PER_SEC', { infer: true });

    this.queue = new Queue(SEND_QUEUE, {
      connection,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 },
    });
    this.target = this.queue;
    await this.queue.upsertJobScheduler('send-tick', { every: tickMs }, { name: 'tick' });

    this.worker = new Worker(
      SEND_QUEUE,
      (job: Job<{ queueId?: string }>) =>
        this.handle(
          job.name === 'send' && job.data.queueId
            ? { name: 'send', queueId: job.data.queueId }
            : { name: 'tick' },
        ),
      { connection, concurrency, limiter: { max: rate, duration: 1000 } },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Send job ${job?.name ?? '?'} failed: ${err.message}`),
    );
    this.logger.log(
      `Send scheduler started (tick ${tickMs / 1000}s, concurrency ${concurrency}, ${rate}/s)`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** Exposed for tests: route enqueued jobs to a fake queue. */
  useQueue(queue: SendQueue): void {
    this.target = queue;
  }

  async handle(job: SendJob): Promise<void> {
    if (job.name === 'send') {
      await this.delivery.process(job.queueId);
      return;
    }
    const due = await this.delivery.findDue(DISPATCH_BATCH);
    if (due.length === 0 || !this.target) return;
    await this.target.addBulk(
      due.map((queueId) => ({
        name: 'send',
        data: { queueId },
        opts: { jobId: sendJobId(queueId) },
      })),
    );
  }
}
