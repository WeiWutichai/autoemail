import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { CryptoModule } from '../common/crypto/crypto.module';
import { validateWorkerEnv } from '../config/env';
import { ErpModule } from '../erp/erp.module';
import { PrismaModule } from '../prisma/prisma.module';

/** Root module of the worker process (no HTTP server). */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateWorkerEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      },
    }),
    PrismaModule,
    CryptoModule,
    ErpModule,
  ],
})
export class WorkerModule {}
