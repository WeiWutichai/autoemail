import { parseDurationSec, validateEnv, validateWorkerEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://x',
  MASTER_KEY: 'k',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv (api)', () => {
  it('requires DATABASE_URL, MASTER_KEY and JWT secrets', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: undefined })).toThrow();
    expect(() => validateEnv({ ...base, MASTER_KEY: undefined })).toThrow();
    expect(() => validateEnv({ ...base, JWT_SECRET: 'change-me' })).toThrow();
  });

  it('applies defaults and converts TTLs to seconds', () => {
    const env = validateEnv(base);
    expect(env.API_PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.JWT_ACCESS_TTL).toBe(900);
    expect(env.JWT_REFRESH_TTL).toBe(604800);
    expect(env.ERP_QUERY_TIMEOUT_MS).toBe(10000);
    expect(env.ERP_MAX_CONNECTIONS).toBe(2);
  });

  it('rejects malformed TTLs', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_TTL: '15 minutes' })).toThrow();
  });
});

describe('parseDurationSec', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['12h', 43200],
    ['7d', 604800],
  ])('parses %s', (input, expected) => {
    expect(parseDurationSec(input)).toBe(expected);
  });
});

describe('validateWorkerEnv', () => {
  it('does not require JWT secrets and defaults Redis / tick', () => {
    const env = validateWorkerEnv({ DATABASE_URL: 'postgresql://x', MASTER_KEY: 'k' });
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.SYNC_TICK_SEC).toBe(30);
    expect(env.ERP_MAX_CONNECTIONS).toBe(2);
  });

  it('requires DATABASE_URL and MASTER_KEY', () => {
    expect(() => validateWorkerEnv({ MASTER_KEY: 'k' })).toThrow();
    expect(() => validateWorkerEnv({ DATABASE_URL: 'postgresql://x' })).toThrow();
  });
});
