import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  mailListQuerySchema,
  type MailDetailDto,
  type MailListQuery,
  type MailStatsDto,
  type MailSummaryDto,
  type Paginated,
} from '@erp-mail/shared';
import { Audit } from '../audit/audit.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MailsService } from './mails.service';

@Controller('mails')
export class MailsController {
  constructor(private readonly mails: MailsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(mailListQuerySchema)) query: MailListQuery,
  ): Promise<Paginated<MailSummaryDto>> {
    return this.mails.list(query);
  }

  @Get('stats')
  stats(): Promise<MailStatsDto> {
    return this.mails.stats();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<MailDetailDto> {
    return this.mails.get(id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @Audit('mail.retry')
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<MailDetailDto> {
    return this.mails.retry(id, user.email);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Audit('mail.cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<MailDetailDto> {
    return this.mails.cancel(id, user.email);
  }
}
