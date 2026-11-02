import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { loginSchema, type LoginInput, type LoginResponse } from '@erp-mail/shared';
import type { CookieOptions, Request, Response } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthService, type AuthResult } from './auth.service';
import { REFRESH_COOKIE } from './auth.types';
import { Public } from './public.decorator';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const result = await this.authService.login(body, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return this.respond(res, result);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    try {
      const result = await this.authService.refresh(this.readCookie(req));
      return this.respond(res, result);
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.authService.logout(this.readCookie(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  private respond(res: Response, { accessToken, refreshToken, user }: AuthResult): LoginResponse {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.cookieOptions(),
      maxAge: this.authService.refreshTtlSec * 1000,
    });
    return { accessToken, user };
  }

  private readCookie(req: Request): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: true, sameSite: 'strict', path: '/' };
  }
}
