import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdminUserDto, CreateAdminUserInput, UpdateAdminUserInput } from '@erp-mail/shared';
import { Prisma } from '@prisma/client';
import { hashPassword } from '../auth/password';
import { SessionsService } from '../auth/sessions.service';
import { PrismaService } from '../prisma/prisma.service';
import { toAdminUserDto } from './admin-user.mapper';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  async list(): Promise<AdminUserDto[]> {
    const users = await this.prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map(toAdminUserDto);
  }

  async create(input: CreateAdminUserInput): Promise<AdminUserDto> {
    try {
      const user = await this.prisma.adminUser.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
        },
      });
      return toAdminUserDto(user);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'Email is already in use' });
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateAdminUserInput, actorId: string): Promise<AdminUserDto> {
    if (input.isActive === false && id === actorId) {
      throw new BadRequestException({
        code: 'CANNOT_DEACTIVATE_SELF',
        message: 'You cannot deactivate your own account',
      });
    }
    await this.findOrThrow(id);

    const user = await this.prisma.adminUser.update({
      where: { id },
      data: { name: input.name, isActive: input.isActive },
    });
    if (input.isActive === false) {
      await this.sessions.revokeAllForAdmin(id);
    }
    return toAdminUserDto(user);
  }

  /** Sets a new password and signs the admin out everywhere. */
  async resetPassword(id: string, password: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.adminUser.update({
      where: { id },
      data: { passwordHash: await hashPassword(password) },
    });
    await this.sessions.revokeAllForAdmin(id);
  }

  private async findOrThrow(id: string): Promise<void> {
    const exists = await this.prisma.adminUser.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw new NotFoundException({
        code: 'ADMIN_USER_NOT_FOUND',
        message: 'Admin user not found',
      });
    }
  }
}
