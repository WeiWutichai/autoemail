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
  createMailTemplateSchema,
  renderTemplateInputSchema,
  testSendInputSchema,
  updateMailTemplateSchema,
  type CreateMailTemplateInput,
  type MailTemplateDto,
  type MailTemplateVersionDto,
  type RenderedMail,
  type RenderTemplateInput,
  type TestSendInput,
  type TestSendResult,
  type UpdateMailTemplateInput,
} from '@erp-mail/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TemplatesService } from './templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(): Promise<MailTemplateDto[]> {
    return this.templates.list();
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @Body(new ZodValidationPipe(renderTemplateInputSchema)) body: RenderTemplateInput,
  ): RenderedMail {
    return this.templates.preview(body);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<MailTemplateDto> {
    return this.templates.get(id);
  }

  @Get(':id/versions')
  versions(@Param('id', ParseUUIDPipe) id: string): Promise<MailTemplateVersionDto[]> {
    return this.templates.versions(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createMailTemplateSchema)) body: CreateMailTemplateInput,
  ): Promise<MailTemplateDto> {
    return this.templates.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMailTemplateSchema)) body: UpdateMailTemplateInput,
  ): Promise<MailTemplateDto> {
    return this.templates.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.templates.remove(id);
  }

  @Post(':id/test-send')
  @HttpCode(HttpStatus.OK)
  testSend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(testSendInputSchema)) body: TestSendInput,
  ): Promise<TestSendResult> {
    return this.templates.testSend(id, body);
  }
}
