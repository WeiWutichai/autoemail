import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/** Shared HTTP setup used by `main.ts` and e2e tests. */
export function configureApp(app: INestApplication): void {
  const http = app.getHttpAdapter().getInstance() as Express;
  http.disable('x-powered-by');
  // Requests arrive through nginx / the Next.js proxy on a private network: use X-Forwarded-For
  // from those hops only, so rate limiting and audit logs see the real client IP.
  http.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
}
