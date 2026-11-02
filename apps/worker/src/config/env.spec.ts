import { validateEnv } from './env';

describe('validateEnv', () => {
  it('defaults NODE_ENV to development', () => {
    expect(validateEnv({}).NODE_ENV).toBe('development');
  });

  it('rejects unknown NODE_ENV', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow();
  });
});
