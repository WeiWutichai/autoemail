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
  type CollectContactsResult,
  createSyncConfigSchema,
  queryPreviewInputSchema,
  updateSyncConfigSchema,
  type CreateSyncConfigInput,
  type QueryPreviewInput,
  type QueryPreviewResult,
  type SyncConfigDto,
  type SyncRunResponse,
  type UpdateSyncConfigInput,
} from '@erp-mail/shared';
import { Audit } from '../audit/audit.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SyncConfigsService } from './sync-configs.service';
import { SyncRunnerService } from './sync-runner.service';

@Controller('sync-configs')
export class SyncConfigsController {
  constructor(
    private readonly configs: SyncConfigsService,
    private readonly runner: SyncRunnerService,
  ) {}

  @Get()
  list(): Promise<SyncConfigDto[]> {
    return this.configs.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SyncConfigDto> {
    return this.configs.get(id);
  }

  @Post()
  @Audit('sync_config.create')
  create(
    @Body(new ZodValidationPipe(createSyncConfigSchema)) body: CreateSyncConfigInput,
  ): Promise<SyncConfigDto> {
    return this.configs.create(body);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @Body(new ZodValidationPipe(queryPreviewInputSchema)) body: QueryPreviewInput,
  ): Promise<QueryPreviewResult> {
    return this.configs.preview(body);
  }

  @Post(':id/collect-contacts')
  @Audit('sync_config.collect_contacts')
  @HttpCode(HttpStatus.OK)
  collectContacts(@Param('id', ParseUUIDPipe) id: string): Promise<CollectContactsResult> {
    return this.configs.collectContacts(id);
  }

  @Patch(':id')
  @Audit('sync_config.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSyncConfigSchema)) body: UpdateSyncConfigInput,
  ): Promise<SyncConfigDto> {
    return this.configs.update(id, body);
  }

  @Delete(':id')
  @Audit('sync_config.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.configs.remove(id);
  }

  @Post(':id/run')
  @Audit('sync_config.run')
  @HttpCode(HttpStatus.OK)
  run(@Param('id', ParseUUIDPipe) id: string): Promise<SyncRunResponse> {
    return this.runner.run(id);
  }
}
