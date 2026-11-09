import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION = 'audit:action';

/** Records a successful call of this route in admin_audit_logs (see AuditInterceptor). */
export const Audit = (action: string) => SetMetadata(AUDIT_ACTION, action);
