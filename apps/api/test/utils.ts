import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
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
    'TRUNCATE TABLE admin_audit_logs, admin_sessions, admin_users, erp_connections, erp_sync_configs, contacts, mail_logs, mail_queue, mail_template_versions, mail_templates, smtp_configs, suppressed_emails RESTART IDENTITY CASCADE',
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

/** The e2e Postgres doubles as a real "ERP" database so the pg driver is exercised end-to-end. */
export function erpFromDatabaseUrl(name = 'ERP-PG') {
  const url = new URL(process.env.DATABASE_URL as string);
  return {
    name,
    dbType: 'POSTGRES' as const,
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.replace(/^\//, ''),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

/** Logs in and returns helpers that send authenticated requests. */
export async function loginApi(app: INestApplication, email: string, password: string) {
  const server = app.getHttpServer();
  const res = await request(server).post('/auth/login').send({ email, password }).expect(200);
  const token = res.body.accessToken as string;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (url: string) => auth(request(server).get(url)),
    post: (url: string) => auth(request(server).post(url)),
    patch: (url: string) => auth(request(server).patch(url)),
    put: (url: string) => auth(request(server).put(url)),
    delete: (url: string) => auth(request(server).delete(url)),
  };
}
export type TestApi = Awaited<ReturnType<typeof loginApi>>;

/** Extracts `refresh_token=<value>` from Set-Cookie headers. */
export function readRefreshCookie(setCookie: string[] | string | undefined): string | undefined {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = cookies.map((c) => /^refresh_token=([^;]*)/.exec(c)).find(Boolean);
  return match?.[1] || undefined;
}
