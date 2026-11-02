import type { AdminUserDto } from '@erp-mail/shared';
import type { AdminUser } from '@prisma/client';

/** Strips `passwordHash` and serializes dates. */
export function toAdminUserDto(user: AdminUser): AdminUserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
