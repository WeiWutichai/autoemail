import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://erpmail:erpmail@localhost:5432/erpmail_test?schema=public';

// Use a dedicated Redis db: e2e flushes it.
const testRedisUrl = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
      JWT_SECRET: 'e2e-access-secret-0123456789abcdef',
      JWT_REFRESH_SECRET: 'e2e-refresh-secret-0123456789abcdef',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      REDIS_URL: testRedisUrl,
      SYNC_TICK_SEC: '1',
    },
  },
});
