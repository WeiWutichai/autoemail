import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  createAdminUserSchema,
  resetPasswordSchema,
  updateAdminUserSchema,
  type AdminUserDto,
  type CreateAdminUserInput,
  type ResetPasswordInput,
  type UpdateAdminUserInput,
} from '@erp-mail/shared';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminUsersService } from './admin-users.service';

@Controller('admin-users')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  list(): Promise<AdminUserDto[]> {
    return this.adminUsers.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createAdminUserSchema)) body: CreateAdminUserInput,
  ): Promise<AdminUserDto> {
    return this.adminUsers.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAdminUserSchema)) body: UpdateAdminUserInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<AdminUserDto> {
    return this.adminUsers.update(id, body, actor.id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
  ): Promise<void> {
    return this.adminUsers.resetPassword(id, body.password);
  }
}
