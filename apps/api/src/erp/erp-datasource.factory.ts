import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ErpConnection } from '@prisma/client';
import knex, { type Knex } from 'knex';
import { performance } from 'node:perf_hooks';
import { CryptoService } from '../common/crypto/crypto.service';
import { assertSelectSql } from '../common/sql/sql-validator';
import type { BaseEnv } from '../config/env';
import { normalizeRow, rawResultRows, type ErpRow } from './erp-rows';
import {
  buildKnexConfig,
  pingSql,
  type ErpConnectionConfig,
  type ErpPoolOptions,
} from './knex-config';

export type KnexFactory = (config: Knex.Config) => Knex;

export interface PingResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

const MAX_ERROR_LENGTH = 300;

/** A failed ERP query; the message is already sanitized (no password). */
export class ErpQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErpQueryError';
  }
}

/**
 * Creates and caches one Knex pool per ERP connection. A cached pool is replaced when the
 * connection row changes (`updatedAt`), so edited credentials take effect on next use.
 */
@Injectable()
export class ErpDataSourceFactory implements OnModuleDestroy {
  private readonly logger = new Logger(ErpDataSourceFactory.name);
  private readonly pools = new Map<string, { version: number; db: Knex }>();
  private readonly options: ErpPoolOptions;
  private readonly createKnex: KnexFactory;

  constructor(
    config: ConfigService<BaseEnv, true>,
    private readonly crypto: CryptoService,
    createKnex?: KnexFactory,
  ) {
    this.options = {
      timeoutMs: config.get('ERP_QUERY_TIMEOUT_MS', { infer: true }),
      maxConnections: config.get('ERP_MAX_CONNECTIONS', { infer: true }),
    };
    this.createKnex = createKnex ?? knex;
  }

  /** Returns the pooled Knex instance for this connection (creating it if needed). */
  async get(conn: ErpConnection): Promise<Knex> {
    const version = conn.updatedAt.getTime();
    const cached = this.pools.get(conn.id);
    if (cached?.version === version) return cached.db;

    if (cached) await this.destroyQuietly(cached.db);
    const db = this.build(conn, this.password(conn), this.options);
    this.pools.set(conn.id, { version, db });
    return db;
  }

  /** Closes the cached pool of a connection (after update / delete). */
  async invalidate(id: string): Promise<void> {
    const cached = this.pools.get(id);
    if (!cached) return;
    this.pools.delete(id);
    await this.destroyQuietly(cached.db);
  }

  /** Opens a throwaway single-connection pool and runs a ping query. Never throws. */
  testConnection(conn: ErpConnection): Promise<PingResult> {
    return this.testConfig(conn, this.password(conn));
  }

  /**
   * Same as `testConnection` for settings that are not saved yet (the edit dialog).
   * `password` is plain text and only used for this one attempt.
   */
  async testConfig(config: ErpConnectionConfig, password: string | undefined): Promise<PingResult> {
    const started = performance.now();
    let db: Knex | undefined;
    try {
      db = this.build(config, password, { ...this.options, maxConnections: 1 });
      await db.raw(pingSql(config.dbType)).timeout(this.options.timeoutMs);
      return { ok: true, latencyMs: Math.round(performance.now() - started) };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - started),
        error: sanitizeError(err, password),
      };
    } finally {
      if (db) await this.destroyQuietly(db);
    }
  }

  /**
   * Runs an admin-supplied SELECT on the ERP (validated by SqlValidator first) and returns
   * normalized rows: lower-case column names, JSON-safe values.
   */
  async query(conn: ErpConnection, sql: string): Promise<ErpRow[]> {
    assertSelectSql(sql);
    const db = await this.get(conn);
    try {
      const result: unknown = await db.raw(sql).timeout(this.options.timeoutMs);
      return rawResultRows(conn.dbType, result).map(normalizeRow);
    } catch (err) {
      throw new ErpQueryError(sanitizeError(err, this.password(conn)));
    }
  }

  async onModuleDestroy(): Promise<void> {
    const pools = [...this.pools.values()];
    this.pools.clear();
    await Promise.all(pools.map(({ db }) => this.destroyQuietly(db)));
  }

  /** Creates a Knex instance whose own console logging goes through the Nest logger, sanitized. */
  private build(
    conn: ErpConnectionConfig,
    password: string | undefined,
    options: ErpPoolOptions,
  ): Knex {
    const log = (level: 'warn' | 'debug') => (message: unknown) =>
      this.logger[level](sanitizeError(message, password));
    return this.createKnex({
      ...buildKnexConfig(conn, password, options),
      log: { warn: log('warn'), error: log('warn'), deprecate: log('debug'), debug: log('debug') },
    });
  }

  private password(conn: ErpConnection): string | undefined {
    return conn.passwordEnc ? this.crypto.decrypt(conn.passwordEnc) : undefined;
  }

  private async destroyQuietly(db: Knex): Promise<void> {
    try {
      await db.destroy();
    } catch (err) {
      this.logger.warn(`Failed to close ERP pool: ${(err as Error).message}`);
    }
  }
}

/** Driver error message without the password, trimmed for storage / display. */
export function sanitizeError(err: unknown, password: string | undefined): string {
  let message = err instanceof Error ? err.message : String(err);
  if (err instanceof AggregateError && err.errors.length > 0) {
    message = err.errors
      .map((e: unknown) => (e instanceof Error ? e.message : String(e)))
      .join('; ');
  }
  if (password) message = message.split(password).join('***');
  message = message.replace(/\s+/g, ' ').trim() || 'Connection failed';
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH)}…` : message;
}
