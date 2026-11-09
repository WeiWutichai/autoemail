import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { WorkerEnv } from '../config/env';
import type { SyncRunnerService } from '../sync/sync-runner.service';
import { SyncScheduler } from './sync.scheduler';

function setup() {
  const runner = {
    findDue: vi.fn().mockResolvedValue(['a', 'b']),
    run: vi.fn().mockResolvedValue({ ok: true, result: null }),
  };
  const queue = { addBulk: vi.fn().mockResolvedValue([]) };
  const scheduler = new SyncScheduler(
    {} as ConfigService<WorkerEnv, true>,
    runner as unknown as SyncRunnerService,
  );
  scheduler.useQueue(queue);
  return { runner, queue, scheduler };
}

describe('SyncScheduler', () => {
  it('enqueues one run job per due config with a stable job id', async () => {
    const { queue, scheduler } = setup();
    await scheduler.handle({ name: 'tick' });
    expect(queue.addBulk).toHaveBeenCalledWith([
      { name: 'run', data: { configId: 'a' }, opts: { jobId: 'run-a' } },
      { name: 'run', data: { configId: 'b' }, opts: { jobId: 'run-b' } },
    ]);
  });

  it('does nothing when no config is due', async () => {
    const { runner, queue, scheduler } = setup();
    runner.findDue.mockResolvedValue([]);
    await scheduler.handle({ name: 'tick' });
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('runs a config and ignores configs that vanished or are already running', async () => {
    const { runner, scheduler } = setup();
    await scheduler.handle({ name: 'run', configId: 'a' });
    expect(runner.run).toHaveBeenCalledWith('a');

    runner.run.mockRejectedValueOnce(new NotFoundException());
    await expect(scheduler.handle({ name: 'run', configId: 'a' })).resolves.toBeUndefined();
    runner.run.mockRejectedValueOnce(new ConflictException());
    await expect(scheduler.handle({ name: 'run', configId: 'a' })).resolves.toBeUndefined();
    runner.run.mockRejectedValueOnce(new Error('db down'));
    await expect(scheduler.handle({ name: 'run', configId: 'a' })).rejects.toThrow('db down');
  });
});
