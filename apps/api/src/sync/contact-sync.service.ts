import { Injectable } from '@nestjs/common';
import { KNOWN_COLUMNS, type SyncRunResult } from '@erp-mail/shared';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { applyColumnMapping, type ErpRow } from '../erp/erp-rows';
import { ErpDataSourceFactory } from '../erp/erp-datasource.factory';
import { PrismaService } from '../prisma/prisma.service';
import { parseColumnMapping, type SyncConfigWithConnection } from './sync-config.mapper';
import { cellText, chunk, RunCounter } from './run-result';

const emailSchema = z.string().email().max(320);
const BATCH = 500;

interface ContactRow {
  erpRefId: string;
  email: string;
  name: string | null;
  phone: string | null;
  company: string | null;
  raw: Prisma.InputJsonObject;
}

const optional = (value: unknown): string | null => cellText(value) || null;

/** Pulls contacts from the ERP and upserts them by `(connection_id, erp_ref_id)`. */
@Injectable()
export class ContactSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly datasources: ErpDataSourceFactory,
  ) {}

  async sync(config: SyncConfigWithConnection): Promise<SyncRunResult> {
    const counter = new RunCounter();
    const rows = await this.datasources.query(config.connection, config.querySql ?? '');
    counter.fetched = rows.length;

    const contacts = this.parseRows(rows, parseColumnMapping(config.columnMapping), counter);
    for (const batch of chunk(contacts, BATCH)) {
      await this.upsertBatch(config.connectionId, batch, counter);
    }
    return counter.toResult();
  }

  /** Validates rows, keeping the last row per erp_ref_id. */
  parseRows(
    rows: ErpRow[],
    mapping: Record<string, string> | null,
    counter: RunCounter,
  ): ContactRow[] {
    const byRef = new Map<string, ContactRow>();
    rows.forEach((source, index) => {
      const row = applyColumnMapping(source, mapping);
      const ref = `row ${index + 1}`;
      const erpRefId = cellText(row.erp_ref_id);
      if (!erpRefId) return counter.error(ref, 'missing erp_ref_id');
      if (erpRefId.length > 255) return counter.error(ref, 'erp_ref_id longer than 255');

      const email = cellText(row.email).toLowerCase();
      if (!emailSchema.safeParse(email).success) {
        return counter.error(`erp_ref_id ${erpRefId}`, 'missing or invalid email');
      }

      if (byRef.has(erpRefId)) counter.skipped++;
      const raw: Prisma.InputJsonObject = Object.fromEntries(
        Object.entries(row).filter(([key]) => !KNOWN_COLUMNS.CONTACTS.includes(key)),
      );
      byRef.set(erpRefId, {
        erpRefId,
        email,
        name: optional(row.name),
        phone: optional(row.phone),
        company: optional(row.company),
        raw,
      });
    });
    return [...byRef.values()];
  }

  private async upsertBatch(
    connectionId: string,
    batch: ContactRow[],
    counter: RunCounter,
  ): Promise<void> {
    const existing = await this.prisma.contact.findMany({
      where: { connectionId, erpRefId: { in: batch.map((c) => c.erpRefId) } },
      select: { erpRefId: true },
    });
    const known = new Set(existing.map((c) => c.erpRefId));
    const syncedAt = new Date();

    const fresh = batch.filter((c) => !known.has(c.erpRefId));
    if (fresh.length > 0) {
      const { count } = await this.prisma.contact.createMany({
        data: fresh.map((c) => ({ ...c, connectionId, syncedAt })),
        skipDuplicates: true,
      });
      counter.created += count;
      // Rows inserted concurrently by another run between findMany and createMany.
      counter.skipped += fresh.length - count;
    }

    const stale = batch.filter((c) => known.has(c.erpRefId));
    for (const part of chunk(stale, 100)) {
      await this.prisma.$transaction(
        part.map(({ erpRefId, ...data }) =>
          this.prisma.contact.update({
            where: { connectionId_erpRefId: { connectionId, erpRefId } },
            data: { ...data, syncedAt },
          }),
        ),
      );
      counter.updated += part.length;
    }
  }
}
