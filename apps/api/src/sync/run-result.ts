import type { SyncRunResult } from '@erp-mail/shared';

const MAX_MESSAGES = 10;

/** Mutable counters for one sync run. */
export class RunCounter {
  fetched = 0;
  created = 0;
  updated = 0;
  skipped = 0;
  errors = 0;
  private readonly messages: string[] = [];
  private readonly started = Date.now();

  constructor(private readonly startedAt = new Date()) {}

  /** Records a row-level problem. `ref` must not contain personal data (row number / ERP id). */
  error(ref: string, problem: string): void {
    this.errors++;
    if (this.messages.length < MAX_MESSAGES) this.messages.push(`${ref}: ${problem}`);
  }

  toResult(): SyncRunResult {
    return {
      startedAt: this.startedAt.toISOString(),
      durationMs: Date.now() - this.started,
      fetched: this.fetched,
      created: this.created,
      updated: this.updated,
      skipped: this.skipped,
      errors: this.errors,
      messages: [...this.messages],
    };
  }
}

/** Trimmed string form of a row value, or '' when null. */
export function cellText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
