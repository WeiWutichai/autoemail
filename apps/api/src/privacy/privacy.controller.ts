import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { pdpaEraseInputSchema, type PdpaEraseInput, type PdpaEraseResult } from '@erp-mail/shared';
import { Audit } from '../audit/audit.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PrivacyService } from './privacy.service';

@Controller('pdpa')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Post('erase')
  @HttpCode(HttpStatus.OK)
  @Audit('pdpa.erase')
  erase(
    @Body(new ZodValidationPipe(pdpaEraseInputSchema)) body: PdpaEraseInput,
  ): Promise<PdpaEraseResult> {
    return this.privacy.erase(body.email);
  }
}
