import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PREVIEW_ROW_LIMIT,
  REQUIRED_COLUMNS,
  type CreateSyncConfigInput,
  type QueryPreviewInput,
  type QueryPreviewResult,
  type SyncConfigDto,
  type UpdateSyncConfigInput,
} from '@erp-mail/shared';
import { Prisma } from '@prisma/client';
import { UnprocessableEntityException } from '@nestjs/common';
import { assertSelectSql } from '../common/sql/sql-validator';
import { applyColumnMapping } from '../erp/erp-rows';
import { ErpDataSourceFactory, ErpQueryError } from '../erp/erp-datasource.factory';
import { PrismaService } from '../prisma/prisma.service';
import { toSyncConfigDto, type SyncConfigWithConnection } from './sync-config.mapper';

const jsonOrNull = (value: Record<string, string> | null | undefined) =>
  value === null ? Prisma.DbNull : value;

@Injectable()
export class SyncConfigsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly datasources: ErpDataSourceFactory,
  ) {}

  async list(): Promise<SyncConfigDto[]> {
    const rows = await this.prisma.erpSyncConfig.findMany({
      include: { connection: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toSyncConfigDto);
  }

  async get(id: string): Promise<SyncConfigDto> {
    return toSyncConfigDto(await this.findOrThrow(id));
  }

  async create(input: CreateSyncConfigInput): Promise<SyncConfigDto> {
    assertSelectSql(input.querySql);
    await this.connectionOrThrow(input.connectionId);
    const config = await this.prisma.erpSyncConfig.create({
      data: { ...input, columnMapping: jsonOrNull(input.columnMapping) },
      include: { connection: true },
    });
    return toSyncConfigDto(config);
  }

  async update(id: string, input: UpdateSyncConfigInput): Promise<SyncConfigDto> {
    await this.findOrThrow(id);
    if (input.querySql !== undefined) assertSelectSql(input.querySql);
    const { columnMapping, ...rest } = input;
    const config = await this.prisma.erpSyncConfig.update({
      where: { id },
      data: {
        ...rest,
        ...(columnMapping !== undefined ? { columnMapping: jsonOrNull(columnMapping) } : {}),
      },
      include: { connection: true },
    });
    return toSyncConfigDto(config);
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.erpSyncConfig.delete({ where: { id } });
  }

  /** Runs the query once and reports columns, the first rows and missing required columns. */
  async preview(input: QueryPreviewInput): Promise<QueryPreviewResult> {
    const conn = await this.connectionOrThrow(input.connectionId);
    const started = Date.now();
    let rows;
    try {
      rows = await this.datasources.query(conn, input.querySql);
    } catch (err) {
      if (err instanceof ErpQueryError) {
        throw new UnprocessableEntityException({ code: 'ERP_QUERY_FAILED', message: err.message });
      }
      throw err;
    }
    const mapped = rows.map((row) => applyColumnMapping(row, input.columnMapping));
    const columns = [...new Set(mapped.flatMap((row) => Object.keys(row)))];
    return {
      columns,
      rows: mapped.slice(0, PREVIEW_ROW_LIMIT),
      rowCount: mapped.length,
      missingColumns:
        mapped.length === 0 ? [] : REQUIRED_COLUMNS[input.kind].filter((c) => !columns.includes(c)),
      durationMs: Date.now() - started,
    };
  }

  private async findOrThrow(id: string): Promise<SyncConfigWithConnection> {
    const config = await this.prisma.erpSyncConfig.findUnique({
      where: { id },
      include: { connection: true },
    });
    if (!config) {
      throw new NotFoundException({
        code: 'SYNC_CONFIG_NOT_FOUND',
        message: 'Sync config not found',
      });
    }
    return config;
  }

  private async connectionOrThrow(id: string) {
    const conn = await this.prisma.erpConnection.findUnique({ where: { id } });
    if (!conn) {
      throw new NotFoundException({
        code: 'CONNECTION_NOT_FOUND',
        message: 'ERP connection not found',
      });
    }
    if (!conn.isActive) {
      throw new ConflictException({
        code: 'CONNECTION_INACTIVE',
        message: 'The ERP connection is deactivated',
      });
    }
    return conn;
  }
}
