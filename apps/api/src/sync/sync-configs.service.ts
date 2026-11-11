import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PREVIEW_ROW_LIMIT,
  REQUIRED_COLUMNS,
  type CreateSyncConfigInput,
  type OutboxPreview,
  type QueryPreviewInput,
  type QueryPreviewResult,
  type SyncConfigDto,
  type UpdateSyncConfigInput,
} from '@erp-mail/shared';
import { Prisma } from '@prisma/client';
import { UnprocessableEntityException } from '@nestjs/common';
import { assertSelectSql } from '../common/sql/sql-validator';
import { applyColumnMapping, type ErpRow } from '../erp/erp-rows';
import { ErpDataSourceFactory, ErpQueryError } from '../erp/erp-datasource.factory';
import { PrismaService } from '../prisma/prisma.service';
import { findSuppressed } from '../suppressions/suppressed';
import { outboxAddresses, parseOutboxRows, withoutSuppressed } from './outbox-sync.service';
import { chunk, RunCounter } from './run-result';
import {
  SYNC_CONFIG_INCLUDE,
  toSyncConfigDto,
  type SyncConfigWithConnection,
} from './sync-config.mapper';

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
      include: SYNC_CONFIG_INCLUDE,
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
    await this.assertReferences(input.kind, input.templateId, input.smtpConfigId);
    const config = await this.prisma.erpSyncConfig.create({
      data: { ...input, columnMapping: jsonOrNull(input.columnMapping) },
      include: SYNC_CONFIG_INCLUDE,
    });
    return toSyncConfigDto(config);
  }

  async update(id: string, input: UpdateSyncConfigInput): Promise<SyncConfigDto> {
    const current = await this.findOrThrow(id);
    if (input.querySql !== undefined) assertSelectSql(input.querySql);
    await this.assertReferences(
      current.kind,
      input.templateId !== undefined ? input.templateId : current.templateId,
      input.smtpConfigId,
    );
    const { columnMapping, ...rest } = input;
    const config = await this.prisma.erpSyncConfig.update({
      where: { id },
      data: {
        ...rest,
        ...(columnMapping !== undefined ? { columnMapping: jsonOrNull(columnMapping) } : {}),
      },
      include: SYNC_CONFIG_INCLUDE,
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
    const missingColumns =
      mapped.length === 0 ? [] : REQUIRED_COLUMNS[input.kind].filter((c) => !columns.includes(c));
    const outbox =
      input.kind === 'OUTBOX' && missingColumns.length === 0
        ? await this.previewOutbox(input.connectionId, mapped)
        : null;
    return {
      columns,
      rows: mapped.slice(0, PREVIEW_ROW_LIMIT),
      rowCount: mapped.length,
      missingColumns,
      durationMs: Date.now() - started,
      outbox,
    };
  }

  /** Same parsing and dedup as the outbox run, then counts the mails per address. */
  private async previewOutbox(connectionId: string, rows: ErpRow[]): Promise<OutboxPreview> {
    const counter = new RunCounter();
    const parsed = parseOutboxRows(rows, null, counter);
    const known = new Set<string>();
    for (const batch of chunk(parsed, 500)) {
      const existing = await this.prisma.mailQueue.findMany({
        where: { connectionId, erpRefId: { in: batch.map((r) => r.erpRefId) } },
        select: { erpRefId: true },
      });
      existing.forEach((m) => m.erpRefId && known.add(m.erpRefId));
    }
    const fresh = parsed.filter((row) => !known.has(row.erpRefId));
    const suppressed = await findSuppressed(this.prisma, outboxAddresses(fresh));
    const counts = new Map<string, number>();
    const add = (email: string) => counts.set(email, (counts.get(email) ?? 0) + 1);
    let newMails = 0;
    for (const row of fresh) {
      const sendable = withoutSuppressed(row, suppressed);
      if (sendable) newMails++;
      // Suppressed addresses are listed too (flagged) so the admin can see who is left out.
      new Set(outboxAddresses([row])).forEach(add);
    }
    return {
      newMails,
      alreadyQueued: parsed.length - fresh.length,
      suppressedMails: fresh.length - newMails,
      duplicateRows: counter.skipped,
      invalidRows: counter.errors,
      recipients: Array.from(counts, ([email, mails]) => ({
        email,
        mails,
        suppressed: suppressed.has(email),
      })).sort((a, b) => b.mails - a.mails || a.email.localeCompare(b.email)),
    };
  }

  /** Outbox configs need an existing template; an explicit SMTP config must exist. */
  private async assertReferences(
    kind: SyncConfigDto['kind'],
    templateId: string | null | undefined,
    smtpConfigId: string | null | undefined,
  ): Promise<void> {
    if (kind === 'OUTBOX') {
      if (!templateId) {
        throw new BadRequestException({
          code: 'TEMPLATE_REQUIRED',
          message: 'Outbox sync requires a template',
        });
      }
      const template = await this.prisma.mailTemplate.findUnique({ where: { id: templateId } });
      if (!template) {
        throw new NotFoundException({ code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' });
      }
    }
    if (smtpConfigId) {
      const smtp = await this.prisma.smtpConfig.findUnique({ where: { id: smtpConfigId } });
      if (!smtp) {
        throw new NotFoundException({ code: 'SMTP_NOT_FOUND', message: 'SMTP config not found' });
      }
    }
  }

  private async findOrThrow(id: string): Promise<SyncConfigWithConnection> {
    const config = await this.prisma.erpSyncConfig.findUnique({
      where: { id },
      include: SYNC_CONFIG_INCLUDE,
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
