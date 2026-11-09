import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { SyncConfigsController } from './sync-configs.controller';
import { SyncConfigsService } from './sync-configs.service';
import { SyncModule } from './sync.module';

@Module({
  imports: [ErpModule, SyncModule],
  controllers: [SyncConfigsController],
  providers: [SyncConfigsService],
})
export class SyncConfigsModule {}
