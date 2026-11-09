import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [MailModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
