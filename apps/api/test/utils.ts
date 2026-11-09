import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/auth/password';
import { PrismaService } from '../src/prisma/prisma.service';

export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE admin_audit_logs, admin_sessions, admin_users, erp_connections RESTART IDENTITY CASCADE',
  );
}

export async function createAdmin(
  prisma: PrismaService,
  data: { email: string; password: string; name?: string; isActive?: boolean },
): Promise<string> {
  const user = await prisma.adminUser.create({
    data: {
      email: data.email,
      name: data.name ?? 'Admin',
      isActive: data.isActive ?? true,
      passwordHash: await hashPassword(data.password),
    },
  });
  return user.id;
}

/** Extracts `refresh_token=<value>` from Set-Cookie headers. */
export function readRefreshCookie(setCookie: string[] | string | undefined): string | undefined {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = cookies.map((c) => /^refresh_token=([^;]*)/.exec(c)).find(Boolean);
  return match?.[1] || undefined;
}
