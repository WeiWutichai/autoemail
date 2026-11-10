import type { ErpConnection } from '@prisma/client';
import type { Knex } from 'knex';

export type ErpConnectionConfig = Pick<
  ErpConnection,
  'dbType' | 'host' | 'port' | 'database' | 'username' | 'ssl' | 'trustServerCert'
>;

export interface ErpPoolOptions {
  /** Connect / acquire / query timeout. */
  timeoutMs: number;
  maxConnections: number;
}

const APP_NAME = 'erp-mail-relay';

/**
 * Extra time the pool waits beyond the driver's own connect timeout, so the driver's
 * specific error (login failed, host unreachable, instance not found) is reported
 * instead of Knex's generic "Timeout acquiring a connection".
 */
export const ACQUIRE_GRACE_MS = 5_000;

/** Splits `SERVER\INSTANCE` (SQL Server named instance) into its parts. */
export function splitMssqlHost(host: string): { server: string; instanceName?: string } {
  const idx = host.indexOf('\\');
  if (idx === -1) return { server: host };
  return { server: host.slice(0, idx), instanceName: host.slice(idx + 1) || undefined };
}

/** Builds the Knex config for one ERP connection. `password` is the decrypted secret. */
export function buildKnexConfig(
  conn: ErpConnectionConfig,
  password: string | undefined,
  opts: ErpPoolOptions,
): Knex.Config {
  const pool = { min: 0, max: opts.maxConnections, idleTimeoutMillis: 60_000 };
  const common = { pool, acquireConnectionTimeout: opts.timeoutMs + ACQUIRE_GRACE_MS };

  switch (conn.dbType) {
    case 'MSSQL': {
      const { server, instanceName } = splitMssqlHost(conn.host);
      return {
        ...common,
        client: 'mssql',
        connection: {
          server,
          port: conn.port,
          user: conn.username,
          password,
          database: conn.database,
          connectionTimeout: opts.timeoutMs,
          requestTimeout: opts.timeoutMs,
          options: {
            encrypt: conn.ssl,
            trustServerCertificate: conn.trustServerCert,
            appName: APP_NAME,
            ...(instanceName ? { instanceName } : {}),
          },
        },
      };
    }
    case 'POSTGRES':
      return {
        ...common,
        client: 'pg',
        connection: {
          host: conn.host,
          port: conn.port,
          user: conn.username,
          password,
          database: conn.database,
          ssl: conn.ssl ? { rejectUnauthorized: !conn.trustServerCert } : false,
          connectionTimeoutMillis: opts.timeoutMs,
          statement_timeout: opts.timeoutMs,
          query_timeout: opts.timeoutMs,
          application_name: APP_NAME,
        },
      };
    case 'MYSQL':
      return {
        ...common,
        client: 'mysql2',
        connection: {
          host: conn.host,
          port: conn.port,
          user: conn.username,
          password,
          database: conn.database,
          ssl: conn.ssl ? { rejectUnauthorized: !conn.trustServerCert } : undefined,
          connectTimeout: opts.timeoutMs,
        },
      };
    case 'ORACLE':
      return {
        ...common,
        client: 'oracledb',
        connection: {
          user: conn.username,
          password,
          // `database` is the Oracle service name.
          connectString: `${conn.ssl ? 'tcps://' : ''}${conn.host}:${conn.port}/${conn.database}`,
        },
      };
  }
}

/** Health-check query per dialect. */
export function pingSql(dbType: ErpConnection['dbType']): string {
  return dbType === 'ORACLE' ? 'SELECT 1 FROM DUAL' : 'SELECT 1';
}
