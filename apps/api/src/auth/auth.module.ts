import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SessionsService } from './sessions.service';

@Module({
  imports: [
    JwtModule.register({ signOptions: { algorithm: 'HS256' } }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 5 }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionsService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  exports: [AuthService, SessionsService],
})
export class AuthModule {}
