import { validateEnv } from './env';

describe('validateEnv (api)', () => {
  it('requires DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow();
  });

  it('applies defaults', () => {
    const env = validateEnv({ DATABASE_URL: 'postgresql://x' });
    expect(env.API_PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
  });
});
