import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

function makeContext(headers: Record<string, string>): {
  ctx: ExecutionContext;
  req: { headers: Record<string, string>; user?: unknown };
} {
  const req: { headers: Record<string, string>; user?: unknown } = { headers };
  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

describe('JwtAuthGuard', () => {
  const user = { id: 'u', email: 'a@b.co', name: 'A', sessionId: 's' };
  const authService = { validateAccessToken: vi.fn().mockResolvedValue(user) };
  const getAllAndOverride = vi.fn().mockReturnValue(false);
  const reflector = { getAllAndOverride } as unknown as Reflector;

  it('allows public routes without a token', async () => {
    getAllAndOverride.mockReturnValueOnce(true);
    const guard = new JwtAuthGuard(reflector, authService as unknown as AuthService);
    await expect(guard.canActivate(makeContext({}).ctx)).resolves.toBe(true);
  });

  it('rejects requests without a bearer token', async () => {
    const guard = new JwtAuthGuard(reflector, authService as unknown as AuthService);
    await expect(guard.canActivate(makeContext({}).ctx)).rejects.toThrow(UnauthorizedException);
    await expect(
      guard.canActivate(makeContext({ authorization: 'Basic abc' }).ctx),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('attaches the user for a valid token', async () => {
    const guard = new JwtAuthGuard(reflector, authService as unknown as AuthService);
    const { ctx, req } = makeContext({ authorization: 'Bearer token-123' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authService.validateAccessToken).toHaveBeenCalledWith('token-123');
    expect(req.user).toEqual(user);
  });
});
