import { defineConfig } from 'vitest/config';
import e2e from './vitest.e2e.config';

/** `pnpm --filter @erp-mail/api test:load` — not part of the regular test runs. */
export default defineConfig({
  ...e2e,
  test: {
    ...e2e.test,
    include: ['test/load/**/*.load-spec.ts'],
    testTimeout: 900_000,
    env: {
      ...e2e.test?.env,
      SEND_CONCURRENCY: process.env.SEND_CONCURRENCY ?? '4',
      SEND_RATE_PER_SEC: process.env.SEND_RATE_PER_SEC ?? '100',
      SEND_TICK_SEC: '1',
      SYNC_TICK_SEC: '1',
    },
  },
});
