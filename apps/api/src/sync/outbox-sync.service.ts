import { Injectable } from '@nestjs/common';
import type { SyncRunResult } from '@erp-mail/shared';
import { Prisma, type MailTemplate } from '@prisma/client';
import { z } from 'zod';
import { applyColumnMapping, type ErpRow } from '../erp/erp-rows';
import { ErpDataSourceFactory } from '../erp/erp-datasource.factory';
import { TemplateRenderer } from '../mail/template-renderer';
import { PrismaService } from '../prisma/prisma.service';
import { findSuppressed } from '../suppressions/suppressed';
import { collectOutboxContacts } from './outbox-contacts';
import { parseColumnMapping, type SyncConfigWithConnection } from './sync-config.mapper';
import { cellText, chunk, RunCounter } from './run-result';

const emailSchema = z.string().email().max(320);
const MAX_RECIPIENTS = 50;
const BATCH = 500;

export interface OutboxRow {
  erpRefId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  templateCode: string | null;
  variables: ErpRow;
}

/** Splits `a@x.com; b@x.com` into lower-cased addresses; null when any address is invalid. */
export function parseAddresses(value: unknown): string[] | null {
  const parts = cellText(value)
    .split(/[;,]/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length > MAX_RECIPIENTS) return null;
  return parts.every((p) => emailSchema.safeParse(p).success) ? [...new Set(parts)] : null;
}

/**
 * Validates fetched rows and keeps the last row per `erp_ref_id`. Invalid rows are counted
 * as errors and duplicate ids as skipped. Shared by the sync run and the query preview.
 */
export function parseOutboxRows(
  rows: ErpRow[],
  mapping: Record<string, string> | null,
  counter: RunCounter,
): OutboxRow[] {
  const byRef = new Map<string, OutboxRow>();
  rows.forEach((source, index) => {
    const row = applyColumnMapping(source, mapping);
    const erpRefId = cellText(row.erp_ref_id);
    if (!erpRefId) return counter.error(`row ${index + 1}`, 'missing erp_ref_id');
    if (erpRefId.length > 255)
      return counter.error(`row ${index + 1}`, 'erp_ref_id longer than 255');
    const ref = `erp_ref_id ${erpRefId}`;

    const to = parseAddresses(row.to_email);
    if (!to || to.length === 0) return counter.error(ref, 'missing or invalid to_email');
    const cc = parseAddresses(row.cc);
    const bcc = parseAddresses(row.bcc);
    if (!cc || !bcc) return counter.error(ref, 'invalid cc / bcc');

    if (byRef.has(erpRefId)) counter.skipped++;
    byRef.set(erpRefId, {
      erpRefId,
      to,
      cc,
      bcc,
      templateCode: cellText(row.template_code) || null,
      variables: row,
    });
  });
  return [...byRef.values()];
}

/** Every address of the rows (to, cc and bcc). */
export function outboxAddresses(rows: OutboxRow[]): string[] {
  return rows.flatMap((r) => [...r.to, ...r.cc, ...r.bcc]);
}

/**
 * Drops suppressed addresses from a row; null when no `to` address is left, in which case
 * the row is not enqueued (it is picked up again if the address is later un-suppressed).
 */
export function withoutSuppressed(row: OutboxRow, suppressed: Set<string>): OutboxRow | null {
  if (suppressed.size === 0) return row;
  const keep = (list: string[]) => list.filter((a) => !suppressed.has(a));
  const to = keep(row.to);
  return to.length === 0 ? null : { ...row, to, cc: keep(row.cc), bcc: keep(row.bcc) };
}

/**
 * Pulls rows that need a mail from the ERP and enqueues one `mail_queue` item per new
 * `(connection_id, erp_ref_id)`; rows already enqueued are skipped (sent once only).
 * Rendering happens here so the stored mail is exactly what will be sent.
 */
@Injectable()
export class OutboxSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly datasources: ErpDataSourceFactory,
    private readonly renderer: TemplateRenderer,
  ) {}

  async sync(config: SyncConfigWithConnection): Promise<SyncRunResult> {
    const counter = new RunCounter();
    const rows = await this.datasources.query(config.connection, config.querySql ?? '');
    counter.fetched = rows.length;
    const parsed = this.parseRows(rows, parseColumnMapping(config.columnMapping), counter);
    // Keep the Contacts page in step with who this sync mails (suppressed ones included).
    await collectOutboxContacts(this.prisma, config.connectionId, parsed);
    const suppressed = await findSuppressed(
      this.prisma,
      config.connectionId,
      outboxAddresses(parsed),
    );

    const templates = new TemplateCache(this.prisma);
    for (const batch of chunk(parsed, BATCH)) {
      const existing = await this.prisma.mailQueue.findMany({
        where: {
          connectionId: config.connectionId,
          erpRefId: { in: batch.map((r) => r.erpRefId) },
        },
        select: { erpRefId: true },
      });
      const known = new Set(existing.map((m) => m.erpRefId));
      for (const parsedRow of batch) {
        const row = known.has(parsedRow.erpRefId) ? null : withoutSuppressed(parsedRow, suppressed);
        if (!row) {
          counter.skipped++;
          continue;
        }
        await this.enqueue(config, row, templates, counter);
      }
    }
    return counter.toResult();
  }

  parseRows(
    rows: ErpRow[],
    mapping: Record<string, string> | null,
    counter: RunCounter,
  ): OutboxRow[] {
    return parseOutboxRows(rows, mapping, counter);
  }

  private async enqueue(
    config: SyncConfigWithConnection,
    row: OutboxRow,
    templates: TemplateCache,
    counter: RunCounter,
  ): Promise<void> {
    const ref = `erp_ref_id ${row.erpRefId}`;
    const template = row.templateCode
      ? await templates.byCode(row.templateCode)
      : await templates.byId(config.templateId);
    if (!template) return counter.error(ref, `template ${row.templateCode ?? '(none)'} not found`);
    if (!template.isActive) return counter.error(ref, `template ${template.code} is deactivated`);

    let rendered;
    try {
      rendered = this.renderer.render(template, row.variables);
    } catch (err) {
      return counter.error(ref, `render failed: ${(err as Error).message}`);
    }

    try {
      await this.prisma.mailQueue.create({
        data: {
          connectionId: config.connectionId,
          erpRefId: row.erpRefId,
          templateId: template.id,
          templateVersion: template.version,
          smtpConfigId: config.smtpConfigId,
          toAddrs: row.to,
          cc: row.cc,
          bcc: row.bcc,
          variables: row.variables,
          renderedSubject: rendered.subject,
          renderedHtml: rendered.html,
          renderedText: rendered.text,
          status: 'PENDING',
          logs: { create: { event: 'QUEUED', detail: `Sync config ${config.name}` } },
        },
      });
      counter.created++;
    } catch (err) {
      // Enqueued by a concurrent run between the existence check and the insert.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        counter.skipped++;
        return;
      }
      throw err;
    }
  }
}

/** Per-run template lookup cache (by id and by code). */
class TemplateCache {
  private readonly cache = new Map<string, MailTemplate | null>();

  constructor(private readonly prisma: PrismaService) {}

  async byId(id: string | null): Promise<MailTemplate | null> {
    if (!id) return null;
    return this.load(`id:${id}`, () => this.prisma.mailTemplate.findUnique({ where: { id } }));
  }

  async byCode(code: string): Promise<MailTemplate | null> {
    return this.load(`code:${code}`, () =>
      this.prisma.mailTemplate.findUnique({ where: { code } }),
    );
  }

  private async load(key: string, fetch: () => Promise<MailTemplate | null>) {
    if (!this.cache.has(key)) this.cache.set(key, await fetch());
    return this.cache.get(key) ?? null;
  }
}
