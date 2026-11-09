import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import type { WorkerEnv } from '../config/env';
import { DeadAlertService } from '../delivery/dead-alert.service';
import { DeliveryService } from '../delivery/delivery.service';
import { PrivacyService } from '../privacy/privacy.service';
import { MAINTENANCE_QUEUE } from './queues';
import { redisConnection } from './redis-connection';

const RECOVER_EVERY_MS = 60_000;
const RETENTION_EVERY_MS = 24 * 3600_000;

/** Housekeeping jobs: recover stuck SENDING mails, alert admins about dead mails, retention. */
@Injectable()
export class MaintenanceScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MaintenanceScheduler.name);
  private queue?: Queue;
  private worker?: Worker;
  private readonly alertEveryMs: number;
  private readonly retentionDays: number;

  constructor(
    private readonly config: ConfigService<WorkerEnv, true>,
    private readonly delivery: DeliveryService,
    private readonly alerts: DeadAlertService,
    private readonly privacy: PrivacyService,
  ) {
    this.alertEveryMs = config.get('DEAD_ALERT_INTERVAL_MIN', { infer: true }) * 60_000;
    this.retentionDays = config.get('LOG_RETENTION_DAYS', { infer: true });
  }

  async onApplicationBootstrap(): Promise<void> {
    const connection = redisConnection(this.config.get('REDIS_URL', { infer: true }));
    this.queue = new Queue(MAINTENANCE_QUEUE, {
      connection,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 },
    });
    await this.queue.upsertJobScheduler(
      'recover-stuck',
      { every: RECOVER_EVERY_MS },
      { name: 'recover-stuck' },
    );
    await this.queue.upsertJobScheduler(
      'retention',
      { every: RETENTION_EVERY_MS },
      { name: 'retention' },
    );
    if (this.alertEveryMs > 0) {
      await this.queue.upsertJobScheduler(
        'dead-alert',
        { every: this.alertEveryMs },
        { name: 'dead-alert' },
      );
    } else {
      await this.queue.removeJobScheduler('dead-alert');
    }

    this.worker = new Worker(
      MAINTENANCE_QUEUE,
      (job: Job) => this.handle(job.name, job.timestamp),
      {
        connection,
        concurrency: 1,
      },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Maintenance job ${job?.name ?? '?'} failed: ${err.message}`),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** `scheduledAt` (ms) anchors the dead-alert window so restarts do not repeat alerts. */
  async handle(name: string, scheduledAt: number): Promise<void> {
    if (name === 'recover-stuck') {
      await this.delivery.recoverStuck();
    } else if (name === 'retention') {
      await this.privacy.purgeOldContent(this.retentionDays);
    } else if (name === 'dead-alert' && this.alertEveryMs > 0) {
      await this.alerts.notify(new Date(scheduledAt - this.alertEveryMs), new Date(scheduledAt));
    }
  }
}
