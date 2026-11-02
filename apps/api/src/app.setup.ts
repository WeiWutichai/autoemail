import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/** Shared HTTP setup used by `main.ts` and e2e tests. */
export function configureApp(app: INestApplication): void {
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
}
