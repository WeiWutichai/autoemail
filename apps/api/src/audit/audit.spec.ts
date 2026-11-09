import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import type { PrismaService } from '../prisma/prisma.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { redactForAudit } from './redact';

describe('redactForAudit', () => {
  it('masks secrets and truncates long strings', () => {
    expect(
      redactForAudit({
        name: 'ERP',
        password: 'p',
        nested: { clientSecret: 'x', list: ['a'] },
        bodyHtmlTpl: 'x'.repeat(300),
      }),
    ).toEqual({
      name: 'ERP',
      password: '***',
      nested: { clientSecret: '***', list: ['a'] },
      bodyHtmlTpl: `${'x'.repeat(200)}…`,
    });
    expect(redactForAudit(undefined)).toBeNull();
  });
});

describe('AuditService', () => {
  it('stores the redacted body and never throws', async () => {
    const prisma = { adminAuditLog: { create: vi.fn().mockResolvedValue({}) } };
    const service = new AuditService(prisma as unknown as PrismaService);
    await service.record({
      adminId: 'a1',
      action: 'smtp.create',
      target: 's1',
      body: { password: 'x' },
      ip: '::1',
    });
    expect(prisma.adminAuditLog.create.mock.calls[0][0].data).toEqual({
      adminId: 'a1',
      action: 'smtp.create',
      target: 's1',
      diff: { password: '***' },
      ip: '::1',
    });

    prisma.adminAuditLog.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.record({ adminId: null, action: 'x', target: null, body: {}, ip: null }),
    ).resolves.toBeUndefined();
  });
});

describe('AuditInterceptor', () => {
  function context(params: Record<string, string> = {}) {
    const req = { user: { id: 'a1' }, params, body: { name: 'n' }, ip: '10.0.0.1' };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => () => undefined,
    } as unknown as ExecutionContext;
  }

  it('records only annotated routes, after success, using the param id or the result id', async () => {
    const audit = { record: vi.fn() };
    const reflector = new Reflector();
    const interceptor = new AuditInterceptor(reflector, audit as unknown as AuditService);
    const next: CallHandler = { handle: () => of({ id: 'new-id' }) };

    vi.spyOn(reflector, 'get').mockReturnValueOnce(undefined);
    await lastValueFrom(interceptor.intercept(context(), next));
    expect(audit.record).not.toHaveBeenCalled();

    vi.spyOn(reflector, 'get').mockReturnValueOnce('connection.create');
    await expect(lastValueFrom(interceptor.intercept(context(), next))).resolves.toEqual({
      id: 'new-id',
    });
    expect(audit.record).toHaveBeenCalledWith({
      adminId: 'a1',
      action: 'connection.create',
      target: 'new-id',
      body: { name: 'n' },
      ip: '10.0.0.1',
    });

    vi.spyOn(reflector, 'get').mockReturnValueOnce('connection.update');
    await lastValueFrom(interceptor.intercept(context({ id: 'c9' }), next));
    expect(audit.record.mock.calls[1][0].target).toBe('c9');
  });
});
