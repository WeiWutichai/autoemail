import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError } from '@erp-mail/shared';
import type { Response } from 'express';

const CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
};

/** Normalizes every error into `{ code, message, details? }`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toApiError(exception);
    res.status(status).json(body);
  }

  toApiError(exception: unknown): { status: number; body: ApiError } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const fallbackCode = CODE_BY_STATUS[status] ?? `HTTP_${status}`;

      if (typeof response === 'object' && response !== null) {
        const r = response as Partial<ApiError> & { message?: unknown };
        const message = Array.isArray(r.message) ? r.message.join(', ') : r.message;
        return {
          status,
          body: {
            code: typeof r.code === 'string' ? r.code : fallbackCode,
            message: typeof message === 'string' ? message : exception.message,
            ...(r.details !== undefined ? { details: r.details } : {}),
          },
        };
      }
      return { status, body: { code: fallbackCode, message: String(response) } };
    }

    this.logger.error(exception instanceof Error ? exception.stack : 'Unknown error');
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    };
  }
}
