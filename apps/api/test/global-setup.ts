import { execSync } from 'node:child_process';
import path from 'node:path';

/** Applies migrations to the dedicated e2e database before any test file runs. */
export default function setup(): void {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://erpmail:erpmail@localhost:5432/erpmail_test';
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to run e2e against "${dbName}": database name must end with _test`);
  }
  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
