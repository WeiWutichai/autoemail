import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Hold the event loop open until a stop signal; BullMQ workers keep it alive once added (M5).
  const keepAlive = setInterval(() => undefined, 60_000);
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.log(`Received ${signal}, shutting down`);
    clearInterval(keepAlive);
    await app.close();
  };
  process.once('SIGTERM', (s) => void shutdown(s));
  process.once('SIGINT', (s) => void shutdown(s));

  logger.log('Worker started');
}

void bootstrap();
