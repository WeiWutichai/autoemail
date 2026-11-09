import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertSelectSql, stripSqlLiterals, validateSelectSql } from './sql-validator';

const PR_PO_QUERY = readFileSync(
  join(__dirname, '../../../../../docs/erp-queries/pr-po-pending-approval.sql'),
  'utf8',
);

describe('validateSelectSql', () => {
  it('accepts the real PR/PO outbox query', () => {
    expect(validateSelectSql(PR_PO_QUERY)).toEqual({ valid: true });
  });

  it('accepts SELECT and WITH (CTE) queries in any case', () => {
    expect(validateSelectSql('select 1').valid).toBe(true);
    expect(validateSelectSql('  WITH x AS (SELECT 1 AS a) SELECT a FROM x').valid).toBe(true);
  });

  it('ignores forbidden words inside strings, comments and quoted identifiers', () => {
    const sql = `-- DELETE everything
      /* DROP TABLE x; */
      SELECT N'insert; into' AS [into], "update" AS q, 'it''s; exec' AS s FROM t`;
    expect(validateSelectSql(sql)).toEqual({ valid: true });
  });

  it('does not match keywords inside longer identifiers', () => {
    expect(validateSelectSql('SELECT UpdatedAt, IsDeleted, CreatedBy, UserId FROM t').valid).toBe(
      true,
    );
  });

  it.each([
    ['empty', '   ', 'EMPTY'],
    ['comment only', '-- nothing', 'EMPTY'],
    ['semicolon', 'SELECT 1; SELECT 2', 'MULTIPLE_STATEMENTS'],
    ['trailing semicolon', 'SELECT 1;', 'MULTIPLE_STATEMENTS'],
    ['not a select', 'UPDATE t SET a = 1', 'NOT_SELECT'],
    ['temp table script', 'IF OBJECT_ID(1) IS NOT NULL DROP TABLE #t', 'NOT_SELECT'],
    ['unterminated string', "SELECT 'abc", 'UNTERMINATED'],
    ['unterminated comment', 'SELECT 1 /* x', 'UNTERMINATED'],
    ['unterminated identifier', 'SELECT [abc FROM t', 'UNTERMINATED'],
  ])('rejects %s', (_name, sql, reason) => {
    expect(validateSelectSql(sql)).toMatchObject({ valid: false, reason });
  });

  it.each([
    ['SELECT * INTO #tmp FROM t', 'INTO'],
    ['SELECT 1 EXEC sp_who', 'EXEC'],
    ["SELECT 1 EXECUTE('x')", 'EXECUTE'],
    ['SELECT 1 INSERT INTO t VALUES (1)', 'INSERT'],
    ['SELECT 1 DELETE FROM t', 'DELETE'],
    ['SELECT * FROM t FOR UPDATE', 'UPDATE'],
    ['SELECT 1 MERGE t USING s ON 1=1', 'MERGE'],
    ['SELECT 1 DROP TABLE t', 'DROP'],
    ['SELECT 1 ALTER TABLE t ADD c INT', 'ALTER'],
    ['SELECT 1 CREATE TABLE t (a INT)', 'CREATE'],
    ['SELECT 1 TRUNCATE TABLE t', 'TRUNCATE'],
    ['SELECT 1 GRANT SELECT ON t TO u', 'GRANT'],
    ["SELECT * FROM OPENROWSET('SQLNCLI', 'x', 'y')", 'OPENROWSET'],
    ["SELECT * FROM OPENQUERY(srv, 'x')", 'OPENQUERY'],
    ["SELECT 1 WAITFOR DELAY '00:00:10'", 'WAITFOR'],
    ['SELECT 1 DECLARE @a INT', 'DECLARE'],
    ['SELECT 1 USE master', 'USE'],
    ['SELECT 1 SHUTDOWN', 'SHUTDOWN'],
    ["SELECT * FROM xp_cmdshell('dir')", 'XP_CMDSHELL'],
  ])('rejects %s', (sql, keyword) => {
    expect(validateSelectSql(sql)).toEqual({ valid: false, reason: 'FORBIDDEN_KEYWORD', keyword });
  });
});

describe('stripSqlLiterals', () => {
  it('handles escaped quotes and N-prefixed strings', () => {
    expect(stripSqlLiterals("SELECT N'a''b' AS x")).toBe("SELECT N'' AS x");
  });
});

describe('assertSelectSql', () => {
  it('throws 400 SQL_NOT_ALLOWED with the reason', () => {
    try {
      assertSelectSql('SELECT 1; DROP TABLE t');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        code: 'SQL_NOT_ALLOWED',
        details: { reason: 'MULTIPLE_STATEMENTS' },
      });
    }
  });

  it('passes valid queries', () => {
    expect(() => assertSelectSql('SELECT 1')).not.toThrow();
  });
});
