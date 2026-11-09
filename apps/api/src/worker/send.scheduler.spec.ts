import type { ConfigService } from '@nestjs/config';
import type { WorkerEnv } from '../config/env';
import type { DeadAlertService } from '../delivery/dead-alert.service';
import type { DeliveryService } from '../delivery/delivery.service';
import type { PrivacyService } from '../privacy/privacy.service';
import { MaintenanceScheduler } from './maintenance.scheduler';
import { SendScheduler } from './send.scheduler';

const config = {
  get: (key: keyof WorkerEnv) =>
    ({ DEAD_ALERT_INTERVAL_MIN: 15, LOG_RETENTION_DAYS: 90 })[key as string],
} as unknown as ConfigService<WorkerEnv, true>;

describe('SendScheduler', () => {
  it('enqueues due mails with stable job ids and sends single mails', async () => {
    const delivery = {
      findDue: vi.fn().mockResolvedValue(['q1', 'q2']),
      process: vi.fn().mockResolvedValue('sent'),
    };
    const queue = { addBulk: vi.fn() };
    const scheduler = new SendScheduler(config, delivery as unknown as DeliveryService);
    scheduler.useQueue(queue);

    await scheduler.handle({ name: 'tick' });
    expect(queue.addBulk).toHaveBeenCalledWith([
      { name: 'send', data: { queueId: 'q1' }, opts: { jobId: 'send-q1' } },
      { name: 'send', data: { queueId: 'q2' }, opts: { jobId: 'send-q2' } },
    ]);

    await scheduler.handle({ name: 'send', queueId: 'q1' });
    expect(delivery.process).toHaveBeenCalledWith('q1');
  });
});

describe('MaintenanceScheduler', () => {
  it('recovers stuck mails and alerts on a window ending at the scheduled time', async () => {
    const delivery = { recoverStuck: vi.fn() };
    const alerts = { notify: vi.fn() };
    const privacy = { purgeOldContent: vi.fn() };
    const scheduler = new MaintenanceScheduler(
      config,
      delivery as unknown as DeliveryService,
      alerts as unknown as DeadAlertService,
      privacy as unknown as PrivacyService,
    );
    await scheduler.handle('retention', 0);
    expect(privacy.purgeOldContent).toHaveBeenCalledWith(90);
    await scheduler.handle('recover-stuck', 0);
    expect(delivery.recoverStuck).toHaveBeenCalled();

    const at = Date.parse('2026-11-09T05:00:00Z');
    await scheduler.handle('dead-alert', at);
    expect(alerts.notify).toHaveBeenCalledWith(
      new Date('2026-11-09T04:45:00Z'),
      new Date('2026-11-09T05:00:00Z'),
    );
  });
});
