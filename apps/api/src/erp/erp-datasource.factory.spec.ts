import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ErpConnection } from '@prisma/client';
import type { Knex } from 'knex';
import type { CryptoService } from '../common/crypto/crypto.service';
import type { BaseEnv } from '../config/env';
import { ErpDataSourceFactory, sanitizeError } from './erp-datasource.factory';

const conn: ErpConnection = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'ERP-HQ',
  dbType: 'MSSQL',
  host: 'erp.local',
  port: 1433,
  database: 'ERP',
  username: 'reader',
  passwordEnc: 'enc:s3cret',
  ssl: false,
  trustServerCert: false,
  isActive: true,
  lastTestAt: null,
  lastTestOk: null,
  createdAt: new Date('2026-11-09T00:00:00Z'),
  updatedAt: new Date('2026-11-09T00:00:00Z'),
};

function fakeKnex(rawResult: Promise<unknown> = Promise.resolve([])) {
  const timeout = vi.fn(() => rawResult);
  return {
    raw: vi.fn(() => ({ timeout })),
    destroy: vi.fn().mockResolvedValue(undefined),
    timeout,
  };
}

function setup(rawResult?: Promise<unknown>) {
  const config = {
    get: (key: keyof BaseEnv) =>
      ({ ERP_QUERY_TIMEOUT_MS: 5000, ERP_MAX_CONNECTIONS: 2 })[key as string],
  } as unknown as ConfigService<BaseEnv, true>;
  const crypto = { decrypt: vi.fn((v: string) => v.replace('enc:', '')) };
  const instances: ReturnType<typeof fakeKnex>[] = [];
  const createKnex = vi.fn((_cfg: Knex.Config) => {
    const k = fakeKnex(rawResult);
    instances.push(k);
    return k as unknown as Knex;
  });
  const factory = new ErpDataSourceFactory(config, crypto as unknown as CryptoService, createKnex);
  return { factory, createKnex, instances, crypto };
}

describe('ErpDataSourceFactory', () => {
  it('caches one pool per connection version and decrypts the password', async () => {
    const { factory, createKnex } = setup();
    const a = await factory.get(conn);
    const b = await factory.get(conn);
    expect(a).toBe(b);
    expect(createKnex).toHaveBeenCalledTimes(1);
    const cfg = createKnex.mock.calls[0][0];
    expect(cfg.connection).toMatchObject({ password: 's3cret' });
    expect(cfg.pool).toMatchObject({ max: 2 });
  });

  it('replaces and closes the pool when the connection changes', async () => {
    const { factory, createKnex, instances } = setup();
    await factory.get(conn);
    await factory.get({ ...conn, updatedAt: new Date('2026-11-10T00:00:00Z') });
    expect(createKnex).toHaveBeenCalledTimes(2);
    expect(instances[0].destroy).toHaveBeenCalled();
  });

  it('invalidates and destroys all pools on shutdown', async () => {
    const { factory, instances } = setup();
    await factory.get(conn);
    await factory.get({ ...conn, id: '22222222-2222-4222-8222-222222222222' });
    await factory.invalidate(conn.id);
    expect(instances[0].destroy).toHaveBeenCalledTimes(1);
    await factory.onModuleDestroy();
    expect(instances[1].destroy).toHaveBeenCalledTimes(1);
  });

  it('tests with a throwaway single-connection pool', async () => {
    const { factory, createKnex, instances } = setup();
    const result = await factory.testConnection(conn);
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(createKnex.mock.calls[0][0].pool).toMatchObject({ max: 1 });
    expect(instances[0].raw).toHaveBeenCalledWith('SELECT 1');
    expect(instances[0].timeout).toHaveBeenCalledWith(5000);
    expect(instances[0].destroy).toHaveBeenCalled();
  });

  it('returns a sanitized error when the ping fails', async () => {
    const { factory, instances } = setup(
      Promise.reject(new Error("Login failed for user 'reader' with password s3cret")),
    );
    const result = await factory.testConnection(conn);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Login failed for user 'reader' with password ***");
    expect(instances[0].destroy).toHaveBeenCalled();
  });

  it('routes knex logging through the Nest logger without the password', async () => {
    const { factory, createKnex } = setup();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await factory.testConnection(conn);
    const log = createKnex.mock.calls[0][0].log as { error: (m: unknown) => void };
    log.error(new Error('auth failed for s3cret'));
    expect(warn).toHaveBeenCalledWith('auth failed for ***');
    warn.mockRestore();
  });

  it('works without a stored password', async () => {
    const { factory, createKnex, crypto } = setup();
    await factory.testConnection({ ...conn, passwordEnc: null });
    expect(crypto.decrypt).not.toHaveBeenCalled();
    expect(createKnex.mock.calls[0][0].connection).toMatchObject({ password: undefined });
  });
});

describe('ErpDataSourceFactory.query', () => {
  it('validates the SQL before touching the ERP', async () => {
    const { factory, createKnex } = setup();
    await expect(factory.query(conn, 'DELETE FROM t')).rejects.toMatchObject({
      response: { code: 'SQL_NOT_ALLOWED' },
    });
    expect(createKnex).not.toHaveBeenCalled();
  });

  it('returns normalized rows from the pooled instance', async () => {
    const { factory, instances } = setup(Promise.resolve([{ DocNo: 'PR1', Amount: 10n }]));
    await expect(factory.query(conn, 'SELECT DocNo, Amount FROM t')).resolves.toEqual([
      { docno: 'PR1', amount: '10' },
    ]);
    expect(instances[0].raw).toHaveBeenCalledWith('SELECT DocNo, Amount FROM t');
    expect(instances[0].timeout).toHaveBeenCalledWith(5000);
  });

  it('wraps driver errors without the password', async () => {
    const { factory } = setup(Promise.reject(new Error('Invalid object name t (s3cret)')));
    await expect(factory.query(conn, 'SELECT 1 FROM t')).rejects.toMatchObject({
      name: 'ErpQueryError',
      message: 'Invalid object name t (***)',
    });
  });
});

describe('sanitizeError', () => {
  it('joins AggregateError causes and truncates long messages', () => {
    const agg = new AggregateError([new Error('a'), new Error('b')], '');
    expect(sanitizeError(agg, undefined)).toBe('a; b');
    expect(sanitizeError(new Error('x'.repeat(400)), undefined)).toHaveLength(301);
  });

  it('falls back to a generic message', () => {
    expect(sanitizeError(new Error(''), undefined)).toBe('Connection failed');
  });
});
