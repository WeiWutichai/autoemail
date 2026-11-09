import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { SmtpConfigsController } from './smtp-configs.controller';
import { SmtpConfigsService } from './smtp-configs.service';

@Module({
  imports: [MailModule],
  controllers: [SmtpConfigsController],
  providers: [SmtpConfigsService],
})
export class SmtpModule {}
