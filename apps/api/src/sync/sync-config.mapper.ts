import {
  columnMappingSchema,
  syncRunResultSchema,
  type ColumnMapping,
  type SyncConfigDto,
  type SyncRunResult,
} from '@erp-mail/shared';
import type { ErpConnection, ErpSyncConfig, Prisma } from '@prisma/client';

export type SyncConfigWithConnection = ErpSyncConfig & { connection: ErpConnection };

export function parseColumnMapping(value: Prisma.JsonValue | null): ColumnMapping | null {
  const parsed = columnMappingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseRunResult(value: Prisma.JsonValue | null): SyncRunResult | null {
  const parsed = syncRunResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function toSyncConfigDto(config: SyncConfigWithConnection): SyncConfigDto {
  return {
    id: config.id,
    connectionId: config.connectionId,
    connectionName: config.connection.name,
    name: config.name,
    kind: config.kind,
    querySql: config.querySql ?? '',
    columnMapping: parseColumnMapping(config.columnMapping),
    pollIntervalSec: config.pollIntervalSec,
    isActive: config.isActive,
    lastSyncedAt: config.lastSyncedAt?.toISOString() ?? null,
    lastResult: parseRunResult(config.lastResult),
    lastError: config.lastError,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}
