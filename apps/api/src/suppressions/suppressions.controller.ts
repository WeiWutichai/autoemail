import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  createSuppressionSchema,
  type CreateSuppressionInput,
  type SuppressedEmailDto,
} from '@erp-mail/shared';
import { Audit } from '../audit/audit.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SuppressionsService } from './suppressions.service';

@Controller('suppressions')
export class SuppressionsController {
  constructor(private readonly suppressions: SuppressionsService) {}

  @Get()
  list(): Promise<SuppressedEmailDto[]> {
    return this.suppressions.list();
  }

  @Post()
  @Audit('suppression.create')
  create(
    @Body(new ZodValidationPipe(createSuppressionSchema)) body: CreateSuppressionInput,
  ): Promise<SuppressedEmailDto> {
    return this.suppressions.create(body);
  }

  @Delete(':id')
  @Audit('suppression.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.suppressions.remove(id);
  }
}
