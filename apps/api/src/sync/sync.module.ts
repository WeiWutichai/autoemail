import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { ContactSyncService } from './contact-sync.service';
import { SyncRunnerService } from './sync-runner.service';

/** Sync execution shared by the api ("Sync now") and the worker (schedule). */
@Module({
  imports: [ErpModule],
  providers: [ContactSyncService, SyncRunnerService],
  exports: [SyncRunnerService],
})
export class SyncModule {}
