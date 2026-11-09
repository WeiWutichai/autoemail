import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { DeadAlertService } from './dead-alert.service';
import { DeliveryService } from './delivery.service';

@Module({
  imports: [MailModule],
  providers: [DeliveryService, DeadAlertService],
  exports: [DeliveryService, DeadAlertService],
})
export class DeliveryModule {}
