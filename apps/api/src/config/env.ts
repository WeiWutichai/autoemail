import { z } from 'zod';

const DURATION_UNITS_SEC = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/** Parses durations like `15m` / `7d` into seconds. */
export function parseDurationSec(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration "${value}" (expected e.g. 30s, 15m, 12h, 7d)`);
  }
  return Number(match[1]) * DURATION_UNITS_SEC[match[2] as keyof typeof DURATION_UNITS_SEC];
}

const durationSec = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((value, ctx) => {
      try {
        return parseDurationSec(value);
      } catch (err) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: (err as Error).message });
        return z.NEVER;
      }
    });

/** Settings shared by the api and the worker process. */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  MASTER_KEY: z.string().min(1),
  ERP_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  ERP_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(20).default(2),
});

export const envSchema = baseEnvSchema.extend({
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: durationSec('15m'),
  JWT_REFRESH_TTL: durationSec('7d'),
});

export const workerEnvSchema = baseEnvSchema.extend({
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  /** How often the worker looks for sync configs that are due. */
  SYNC_TICK_SEC: z.coerce.number().int().min(1).max(3600).default(30),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type Env = z.infer<typeof envSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  return envSchema.parse(raw);
}

export function validateWorkerEnv(raw: Record<string, unknown>): WorkerEnv {
  return workerEnvSchema.parse(raw);
}
