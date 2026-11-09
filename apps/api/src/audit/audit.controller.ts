import { Controller, Get, Query } from '@nestjs/common';
import {
  auditListQuerySchema,
  type AuditListQuery,
  type AuditLogDto,
  type Paginated,
} from '@erp-mail/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuditService } from './audit.service';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(auditListQuerySchema)) query: AuditListQuery,
  ): Promise<Paginated<AuditLogDto>> {
    return this.audit.list(query);
  }
}
