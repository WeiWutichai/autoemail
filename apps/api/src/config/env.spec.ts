import { validateEnv } from './env';

describe('validateEnv (api)', () => {
  it('requires DATABASE_URL and MASTER_KEY', () => {
    expect(() => validateEnv({ MASTER_KEY: 'k' })).toThrow();
    expect(() => validateEnv({ DATABASE_URL: 'postgresql://x' })).toThrow();
  });

  it('applies defaults', () => {
    const env = validateEnv({ DATABASE_URL: 'postgresql://x', MASTER_KEY: 'k' });
    expect(env.API_PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
  });
});
