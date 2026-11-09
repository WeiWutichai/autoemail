import type { ErpConnection } from '@prisma/client';

export type ErpValue = string | number | boolean | null;
export type ErpRow = Record<string, ErpValue>;

/** Extracts the row array from a Knex `raw()` result, whose shape differs per driver. */
export function rawResultRows(dbType: ErpConnection['dbType'], result: unknown): unknown[] {
  switch (dbType) {
    case 'POSTGRES': {
      const rows = (result as { rows?: unknown } | null)?.rows;
      return Array.isArray(rows) ? rows : [];
    }
    case 'MYSQL':
      return Array.isArray(result) && Array.isArray(result[0]) ? (result[0] as unknown[]) : [];
    case 'MSSQL':
    case 'ORACLE':
      return Array.isArray(result) ? result : [];
  }
}

/** Converts a driver value to something that can be stored as JSON and rendered in a template. */
export function toJsonSafe(value: unknown): ErpValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Buffer.isBuffer(value)) return null;
  return String(value);
}

/**
 * Lower-cases column names (Oracle returns upper case) and converts values to JSON-safe ones.
 * Later duplicates of the same lower-cased name win.
 */
export function normalizeRow(row: unknown): ErpRow {
  const out: ErpRow = {};
  if (row && typeof row === 'object') {
    for (const [key, value] of Object.entries(row)) {
      out[key.toLowerCase()] = toJsonSafe(value);
    }
  }
  return out;
}

/** Applies `{ target: source }` renames (case-insensitive source) on a normalized row. */
export function applyColumnMapping(row: ErpRow, mapping: Record<string, string> | null): ErpRow {
  if (!mapping) return row;
  const out: ErpRow = { ...row };
  for (const [target, source] of Object.entries(mapping)) {
    const key = source.toLowerCase();
    if (key in row) out[target.toLowerCase()] = row[key];
  }
  return out;
}
