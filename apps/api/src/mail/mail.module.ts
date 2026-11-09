import { Module } from '@nestjs/common';
import { CryptoService } from '../common/crypto/crypto.service';
import { MailerService } from './mailer.service';
import { TemplateRenderer } from './template-renderer';

/** Rendering + SMTP sending, shared by the api (test sends) and the worker. */
@Module({
  providers: [
    TemplateRenderer,
    {
      provide: MailerService,
      inject: [CryptoService],
      useFactory: (crypto: CryptoService) => new MailerService(crypto),
    },
  ],
  exports: [TemplateRenderer, MailerService],
})
export class MailModule {}
