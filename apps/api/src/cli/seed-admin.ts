import { passwordSchema } from '@erp-mail/shared';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import { z } from 'zod';
import { hashPassword } from '../auth/password';

const seedEnvSchema = z.object({
  ADMIN_EMAIL: z.string().trim().toLowerCase().email(),
  ADMIN_PASSWORD: passwordSchema,
  ADMIN_NAME: z.string().trim().min(1).default('Administrator'),
});

export type SeedAdminInput = { email: string; password: string; name: string };

type AdminUserDelegate = Pick<PrismaClient['adminUser'], 'findUnique' | 'create'>;

/** Creates the first admin if the email does not exist yet. Never overwrites an existing password. */
export async function ensureAdmin(
  adminUser: AdminUserDelegate,
  input: SeedAdminInput,
): Promise<'created' | 'exists'> {
  const existing = await adminUser.findUnique({ where: { email: input.email } });
  if (existing) {
    return 'exists';
  }
  await adminUser.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
    },
  });
  return 'created';
}

async function main(): Promise<void> {
  const logger = pino({ name: 'seed-admin' });
  const parsed = seedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    logger.error(
      { issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
      'Invalid ADMIN_EMAIL / ADMIN_PASSWORD',
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password, ADMIN_NAME: name } = parsed.data;
    const result = await ensureAdmin(prisma.adminUser, { email, password, name });
    logger.info({ email, result }, 'Seed admin finished');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
