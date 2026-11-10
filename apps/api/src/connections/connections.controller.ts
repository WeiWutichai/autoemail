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
  createErpConnectionSchema,
  testErpConnectionDraftSchema,
  updateErpConnectionSchema,
  type CreateErpConnectionInput,
  type ErpConnectionDto,
  type TestConnectionResult,
  type TestErpConnectionDraftInput,
  type UpdateErpConnectionInput,
} from '@erp-mail/shared';
import { Audit } from '../audit/audit.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ConnectionsService } from './connections.service';

@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  list(): Promise<ErpConnectionDto[]> {
    return this.connections.list();
  }

  /** Tests settings from the dialog before they are saved. */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  testDraft(
    @Body(new ZodValidationPipe(testErpConnectionDraftSchema)) body: TestErpConnectionDraftInput,
  ): Promise<TestConnectionResult> {
    return this.connections.testDraft(body);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ErpConnectionDto> {
    return this.connections.get(id);
  }

  @Post()
  @Audit('connection.create')
  create(
    @Body(new ZodValidationPipe(createErpConnectionSchema)) body: CreateErpConnectionInput,
  ): Promise<ErpConnectionDto> {
    return this.connections.create(body);
  }

  @Patch(':id')
  @Audit('connection.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateErpConnectionSchema)) body: UpdateErpConnectionInput,
  ): Promise<ErpConnectionDto> {
    return this.connections.update(id, body);
  }

  @Delete(':id')
  @Audit('connection.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.connections.remove(id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  test(@Param('id', ParseUUIDPipe) id: string): Promise<TestConnectionResult> {
    return this.connections.test(id);
  }
}
