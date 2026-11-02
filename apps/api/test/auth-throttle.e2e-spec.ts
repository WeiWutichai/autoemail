import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDb } from './utils';

describe('Auth login rate limit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows 5 login attempts per minute per IP, then returns 429', async () => {
    const body = { email: 'nobody@example.com', password: 'whatever' };
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).post('/auth/login').send(body).expect(401);
    }
    const res = await request(app.getHttpServer()).post('/auth/login').send(body).expect(429);
    expect(res.body.code).toBe('TOO_MANY_REQUESTS');
  });
});
