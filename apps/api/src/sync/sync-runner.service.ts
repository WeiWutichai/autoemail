import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { SyncKind, SyncRunResponse, SyncRunResult } from '@erp-mail/shared';
import { HttpException } from '@nestjs/common';
import { ErpQueryError } from '../erp/erp-datasource.factory';
import { PrismaService } from '../prisma/prisma.service';
import { ContactSyncService } from './contact-sync.service';
import type { SyncConfigWithConnection } from './sync-config.mapper';

type SyncHandler = (config: SyncConfigWithConnection) => Promise<SyncRunResult>;

/**
 * Runs one sync config (used by "Sync now" in the api and by the worker schedule) and records
 * the outcome on the config. A per-process guard prevents overlapping runs of the same config;
 * the writes themselves are idempotent, so a run in the other process is harmless.
 */
@Injectable()
export class SyncRunnerService {
  private readonly logger = new Logger(SyncRunnerService.name);
  private readonly running = new Set<string>();
  private readonly handlers: Partial<Record<SyncKind, SyncHandler>>;

  constructor(
    private readonly prisma: PrismaService,
    contacts: ContactSyncService,
  ) {
    this.handlers = { CONTACTS: (config) => contacts.sync(config) };
  }

  isRunning(configId: string): boolean {
    return this.running.has(configId);
  }

  async run(configId: string): Promise<SyncRunResponse> {
    if (this.running.has(configId)) {
      throw new ConflictException({ code: 'SYNC_IN_PROGRESS', message: 'Sync is already running' });
    }
    const config = await this.prisma.erpSyncConfig.findUnique({
      where: { id: configId },
      include: { connection: true },
    });
    if (!config) {
      throw new NotFoundException({
        code: 'SYNC_CONFIG_NOT_FOUND',
        message: 'Sync config not found',
      });
    }
    if (!config.connection.isActive) {
      throw new ConflictException({
        code: 'CONNECTION_INACTIVE',
        message: 'The ERP connection is deactivated',
      });
    }

    this.running.add(configId);
    try {
      return await this.execute(config);
    } finally {
      this.running.delete(configId);
    }
  }

  /** Ids of active configs (on active connections) whose poll interval has elapsed. */
  async findDue(now = new Date()): Promise<string[]> {
    const configs = await this.prisma.erpSyncConfig.findMany({
      where: { isActive: true, connection: { isActive: true } },
      select: { id: true, kind: true, lastSyncedAt: true, pollIntervalSec: true },
    });
    return configs
      .filter((c) => this.handlers[c.kind] !== undefined)
      .filter(
        (c) =>
          !c.lastSyncedAt || c.lastSyncedAt.getTime() + c.pollIntervalSec * 1000 <= now.getTime(),
      )
      .map((c) => c.id);
  }

  private async execute(config: SyncConfigWithConnection): Promise<SyncRunResponse> {
    const handler = this.handlers[config.kind];
    const startedAt = new Date();
    try {
      if (!handler) throw new UnsupportedKindError(config.kind);
      const result = await handler(config);
      await this.prisma.erpSyncConfig.update({
        where: { id: config.id },
        data: { lastSyncedAt: startedAt, lastResult: result, lastError: null },
      });
      this.logger.log(
        `Sync config=${config.id} kind=${config.kind} fetched=${result.fetched} created=${result.created} updated=${result.updated} skipped=${result.skipped} errors=${result.errors}`,
      );
      return { ok: true, result };
    } catch (err) {
      const error = describeError(err);
      if (error === UNEXPECTED) {
        this.logger.error(
          `Sync config=${config.id} failed: ${(err as Error).stack ?? String(err)}`,
        );
      } else {
        this.logger.warn(`Sync config=${config.id} failed: ${error}`);
      }
      await this.prisma.erpSyncConfig.update({
        where: { id: config.id },
        data: { lastSyncedAt: startedAt, lastError: error },
      });
      return { ok: false, result: null, error };
    }
  }
}

class UnsupportedKindError extends Error {
  constructor(kind: string) {
    super(`Sync kind ${kind} is not supported yet`);
  }
}

const UNEXPECTED = 'Unexpected error during sync';

function describeError(err: unknown): string {
  if (err instanceof ErpQueryError || err instanceof UnsupportedKindError) return err.message;
  if (err instanceof HttpException) {
    const body = err.getResponse() as { message?: string };
    return body.message ?? err.message;
  }
  return UNEXPECTED;
}
