import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  configureApp(app);

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.enableCors({ origin: config.get('WEB_URL', { infer: true }), credentials: true });

  await app.listen(config.get('API_PORT', { infer: true }));
}

void bootstrap();
