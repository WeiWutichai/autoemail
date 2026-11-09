import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { ErpConnection } from '@prisma/client';
import { ErpQueryError } from '../erp/erp-datasource.factory';
import type { PrismaService } from '../prisma/prisma.service';
import type { ContactSyncService } from './contact-sync.service';
import type { OutboxSyncService } from './outbox-sync.service';
import { SyncRunnerService } from './sync-runner.service';

const now = new Date('2026-11-09T00:00:00Z');
const config = {
  id: 's1',
  connectionId: 'c1',
  name: 'Contacts',
  kind: 'CONTACTS' as const,
  querySql: 'SELECT 1',
  pollIntervalSec: 300,
  isActive: true,
  lastSyncedAt: null,
  connection: { id: 'c1', isActive: true } as ErpConnection,
};
const result = {
  startedAt: now.toISOString(),
  durationMs: 5,
  fetched: 1,
  created: 1,
  updated: 0,
  skipped: 0,
  errors: 0,
  messages: [],
};

function setup() {
  const prisma = {
    erpSyncConfig: {
      findUnique: vi.fn().mockResolvedValue(config),
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
  const contacts = { sync: vi.fn().mockResolvedValue(result) };
  const outbox = { sync: vi.fn().mockResolvedValue(result) };
  const runner = new SyncRunnerService(
    prisma as unknown as PrismaService,
    contacts as unknown as ContactSyncService,
    outbox as unknown as OutboxSyncService,
  );
  return { prisma, contacts, outbox, runner };
}

describe('SyncRunnerService', () => {
  it('runs the handler and records the result', async () => {
    const { prisma, runner } = setup();
    await expect(runner.run('s1')).resolves.toEqual({ ok: true, result });
    expect(prisma.erpSyncConfig.update.mock.calls[0][0].data).toMatchObject({
      lastResult: result,
      lastError: null,
    });
    expect(runner.isRunning('s1')).toBe(false);
  });

  it('records a sanitized error when the ERP query fails', async () => {
    const { prisma, contacts, runner } = setup();
    contacts.sync.mockRejectedValue(new ErpQueryError('Invalid object name Z_MaIL'));
    await expect(runner.run('s1')).resolves.toEqual({
      ok: false,
      result: null,
      error: 'Invalid object name Z_MaIL',
    });
    const data = prisma.erpSyncConfig.update.mock.calls[0][0].data;
    expect(data.lastError).toBe('Invalid object name Z_MaIL');
    expect(data.lastSyncedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty('lastResult');
  });

  it('reports SQL validator rejections and hides unexpected errors', async () => {
    const { contacts, runner } = setup();
    contacts.sync.mockRejectedValueOnce(
      new BadRequestException({ code: 'SQL_NOT_ALLOWED', message: 'Only SELECT' }),
    );
    await expect(runner.run('s1')).resolves.toMatchObject({ ok: false, error: 'Only SELECT' });

    contacts.sync.mockRejectedValueOnce(new Error('connection string secret'));
    const res = await runner.run('s1');
    expect(res.error).toBe('Unexpected error during sync');
  });

  it('dispatches outbox configs to the outbox handler', async () => {
    const { prisma, outbox, runner } = setup();
    prisma.erpSyncConfig.findUnique.mockResolvedValue({ ...config, kind: 'OUTBOX' });
    await runner.run('s1');
    expect(outbox.sync).toHaveBeenCalled();
  });

  it('rejects unknown configs, inactive connections and overlapping runs', async () => {
    const { prisma, contacts, runner } = setup();
    prisma.erpSyncConfig.findUnique.mockResolvedValueOnce(null);
    await expect(runner.run('s1')).rejects.toBeInstanceOf(NotFoundException);

    prisma.erpSyncConfig.findUnique.mockResolvedValueOnce({
      ...config,
      connection: { ...config.connection, isActive: false },
    });
    await expect(runner.run('s1')).rejects.toMatchObject({
      response: { code: 'CONNECTION_INACTIVE' },
    });

    let release: () => void = () => undefined;
    contacts.sync.mockReturnValueOnce(new Promise((r) => (release = () => r(result))));
    const first = runner.run('s1');
    await vi.waitFor(() => expect(runner.isRunning('s1')).toBe(true));
    await expect(runner.run('s1')).rejects.toBeInstanceOf(ConflictException);
    release();
    await first;
  });

  it('finds configs whose interval elapsed', async () => {
    const { prisma, runner } = setup();
    prisma.erpSyncConfig.findMany.mockResolvedValue([
      { id: 'never', kind: 'CONTACTS', lastSyncedAt: null, pollIntervalSec: 300 },
      {
        id: 'due',
        kind: 'CONTACTS',
        lastSyncedAt: new Date(now.getTime() - 300_000),
        pollIntervalSec: 300,
      },
      {
        id: 'recent',
        kind: 'CONTACTS',
        lastSyncedAt: new Date(now.getTime() - 60_000),
        pollIntervalSec: 300,
      },
      { id: 'outbox', kind: 'OUTBOX', lastSyncedAt: null, pollIntervalSec: 300 },
    ]);
    await expect(runner.findDue(now)).resolves.toEqual(['never', 'due', 'outbox']);
  });
});
