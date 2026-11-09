import { buildKnexConfig, pingSql, splitMssqlHost, type ErpConnectionConfig } from './knex-config';

const opts = { timeoutMs: 10_000, maxConnections: 2 };
const base: ErpConnectionConfig = {
  dbType: 'MSSQL',
  host: 'erp.local',
  port: 1433,
  database: 'ERP',
  username: 'reader',
  ssl: false,
  trustServerCert: false,
};

describe('buildKnexConfig', () => {
  it('maps SQL Server with encryption flags inside tedious options', () => {
    const cfg = buildKnexConfig({ ...base, ssl: true, trustServerCert: true }, 'pw', opts);
    expect(cfg.client).toBe('mssql');
    expect(cfg.pool).toMatchObject({ min: 0, max: 2 });
    expect(cfg.acquireConnectionTimeout).toBe(10_000);
    expect(cfg.connection).toMatchObject({
      server: 'erp.local',
      port: 1433,
      user: 'reader',
      password: 'pw',
      database: 'ERP',
      requestTimeout: 10_000,
      options: { encrypt: true, trustServerCertificate: true },
    });
  });

  it('passes the SQL Server instance name separately', () => {
    const cfg = buildKnexConfig({ ...base, host: 'SRV01\\SQLEXPRESS' }, 'pw', opts);
    expect(cfg.connection).toMatchObject({
      server: 'SRV01',
      options: { instanceName: 'SQLEXPRESS', encrypt: false, trustServerCertificate: false },
    });
  });

  it('maps Postgres ssl to rejectUnauthorized unless the cert is trusted', () => {
    const pg = (ssl: boolean, trustServerCert: boolean) =>
      buildKnexConfig({ ...base, dbType: 'POSTGRES', ssl, trustServerCert }, 'pw', opts)
        .connection as Record<string, unknown>;
    expect(pg(false, false).ssl).toBe(false);
    expect(pg(true, false).ssl).toEqual({ rejectUnauthorized: true });
    expect(pg(true, true).ssl).toEqual({ rejectUnauthorized: false });
    expect(pg(false, false).statement_timeout).toBe(10_000);
  });

  it('maps MySQL', () => {
    const cfg = buildKnexConfig({ ...base, dbType: 'MYSQL', port: 3306 }, 'pw', opts);
    expect(cfg.client).toBe('mysql2');
    expect(cfg.connection).toMatchObject({ host: 'erp.local', port: 3306, ssl: undefined });
  });

  it('maps Oracle to an easy-connect string using database as service name', () => {
    const conn = { ...base, dbType: 'ORACLE' as const, port: 1521, database: 'ORCLPDB' };
    expect(buildKnexConfig(conn, 'pw', opts).connection).toMatchObject({
      connectString: 'erp.local:1521/ORCLPDB',
    });
    expect(buildKnexConfig({ ...conn, ssl: true }, 'pw', opts).connection).toMatchObject({
      connectString: 'tcps://erp.local:1521/ORCLPDB',
    });
  });
});

describe('splitMssqlHost', () => {
  it('splits SERVER\\INSTANCE', () => {
    expect(splitMssqlHost('a\\b')).toEqual({ server: 'a', instanceName: 'b' });
    expect(splitMssqlHost('a')).toEqual({ server: 'a' });
  });
});

describe('pingSql', () => {
  it('uses DUAL on Oracle', () => {
    expect(pingSql('ORACLE')).toBe('SELECT 1 FROM DUAL');
    expect(pingSql('MSSQL')).toBe('SELECT 1');
  });
});
