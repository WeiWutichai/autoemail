import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { MailModule } from '../mail/mail.module';
import { ContactSyncService } from './contact-sync.service';
import { OutboxSyncService } from './outbox-sync.service';
import { SyncRunnerService } from './sync-runner.service';

/** Sync execution shared by the api ("Sync now") and the worker (schedule). */
@Module({
  imports: [ErpModule, MailModule],
  providers: [ContactSyncService, OutboxSyncService, SyncRunnerService],
  exports: [SyncRunnerService],
})
export class SyncModule {}
