import { BadRequestException } from '@nestjs/common';

export type SqlRejectReason =
  'EMPTY' | 'UNTERMINATED' | 'MULTIPLE_STATEMENTS' | 'NOT_SELECT' | 'FORBIDDEN_KEYWORD';

export type SqlValidationResult =
  { valid: true } | { valid: false; reason: SqlRejectReason; keyword?: string };

/**
 * Keywords that must never appear outside string literals / comments / quoted identifiers.
 * A query that starts with SELECT can still smuggle a second statement in T-SQL without `;`
 * (e.g. `SELECT 1 DELETE FROM t`), so DML/DDL keywords are rejected anywhere.
 */
const FORBIDDEN_KEYWORDS = [
  'INTO',
  'EXEC',
  'EXECUTE',
  'INSERT',
  'UPDATE',
  'DELETE',
  'MERGE',
  'DROP',
  'ALTER',
  'CREATE',
  'TRUNCATE',
  'GRANT',
  'REVOKE',
  'DENY',
  'OPENROWSET',
  'OPENQUERY',
  'OPENDATASOURCE',
  'BULK',
  'WAITFOR',
  'DBCC',
  'BACKUP',
  'RESTORE',
  'SHUTDOWN',
  'DECLARE',
  'USE',
  'KILL',
  'RECONFIGURE',
] as const;

const FORBIDDEN_RE = new RegExp(`\\b(${FORBIDDEN_KEYWORDS.join('|')})\\b`, 'i');
/** SQL Server extended stored procedures (xp_cmdshell, xp_regread, ...). */
const XP_RE = /\bxp_\w*/i;

/**
 * Replaces comments, string literals and quoted identifiers with neutral placeholders so the
 * keyword scan only sees real SQL tokens. Returns null on an unterminated literal/comment.
 */
export function stripSqlLiterals(sql: string): string | null {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      out += ' ';
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) return null;
      i = end + 2;
      out += ' ';
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      for (;;) {
        if (j >= sql.length) return null;
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      i = j + 1;
      out += "''";
      continue;
    }
    if (ch === '[' || ch === '"' || ch === '`') {
      const close = ch === '[' ? ']' : ch;
      const end = sql.indexOf(close, i + 1);
      if (end === -1) return null;
      i = end + 1;
      out += ' ident ';
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** SELECT-only allowlist for SQL entered by admins (DESIGN section 7). */
export function validateSelectSql(sql: string): SqlValidationResult {
  const stripped = stripSqlLiterals(sql);
  if (stripped === null) return { valid: false, reason: 'UNTERMINATED' };

  const body = stripped.trim();
  if (body.length === 0) return { valid: false, reason: 'EMPTY' };
  if (body.includes(';')) return { valid: false, reason: 'MULTIPLE_STATEMENTS' };
  if (!/^(SELECT|WITH)\b/i.test(body)) return { valid: false, reason: 'NOT_SELECT' };

  const forbidden = FORBIDDEN_RE.exec(body) ?? XP_RE.exec(body);
  if (forbidden) {
    return { valid: false, reason: 'FORBIDDEN_KEYWORD', keyword: forbidden[0].toUpperCase() };
  }
  return { valid: true };
}

/** Throws a 400 `SQL_NOT_ALLOWED` when the query fails {@link validateSelectSql}. */
export function assertSelectSql(sql: string): void {
  const result = validateSelectSql(sql);
  if (!result.valid) {
    throw new BadRequestException({
      code: 'SQL_NOT_ALLOWED',
      message: 'Only a single SELECT statement is allowed',
      details: { reason: result.reason, keyword: result.keyword },
    });
  }
}
