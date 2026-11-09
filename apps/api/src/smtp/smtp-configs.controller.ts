import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  createSmtpConfigSchema,
  testSmtpInputSchema,
  updateSmtpConfigSchema,
  type CreateSmtpConfigInput,
  type SmtpConfigDto,
  type TestSmtpInput,
  type TestSmtpResult,
  type UpdateSmtpConfigInput,
} from '@erp-mail/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SmtpConfigsService } from './smtp-configs.service';

@Controller('smtp-configs')
export class SmtpConfigsController {
  constructor(private readonly smtp: SmtpConfigsService) {}

  @Get()
  list(): Promise<SmtpConfigDto[]> {
    return this.smtp.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SmtpConfigDto> {
    return this.smtp.get(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createSmtpConfigSchema)) body: CreateSmtpConfigInput,
  ): Promise<SmtpConfigDto> {
    return this.smtp.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSmtpConfigSchema)) body: UpdateSmtpConfigInput,
  ): Promise<SmtpConfigDto> {
    return this.smtp.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.smtp.remove(id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  test(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(testSmtpInputSchema)) body: TestSmtpInput,
  ): Promise<TestSmtpResult> {
    return this.smtp.test(id, body);
  }
}
