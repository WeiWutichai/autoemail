import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { concatMap } from 'rxjs';
import type { AuthenticatedRequest } from '../auth/current-user.decorator';
import { AUDIT_ACTION } from './audit.decorator';
import { AuditService } from './audit.service';

/** After a successful @Audit() route, stores who did what to which record. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string | undefined>(AUDIT_ACTION, context.getHandler());
    if (!action) return next.handle();
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return next.handle().pipe(
      concatMap(async (result: unknown) => {
        const resultId =
          result && typeof result === 'object' && 'id' in result ? String(result.id) : null;
        await this.audit.record({
          adminId: req.user?.id ?? null,
          action,
          target: req.params?.id ?? resultId,
          body: req.body,
          ip: req.ip ?? null,
        });
        return result;
      }),
    );
  }
}
