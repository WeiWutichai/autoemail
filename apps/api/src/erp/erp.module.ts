import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../common/crypto/crypto.service';
import type { BaseEnv } from '../config/env';
import { ErpDataSourceFactory } from './erp-datasource.factory';

@Module({
  providers: [
    {
      provide: ErpDataSourceFactory,
      inject: [ConfigService, CryptoService],
      useFactory: (config: ConfigService<BaseEnv, true>, crypto: CryptoService) =>
        new ErpDataSourceFactory(config, crypto),
    },
  ],
  exports: [ErpDataSourceFactory],
})
export class ErpModule {}
