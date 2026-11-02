import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Revokes every active session of an admin (deactivate / password reset). */
  async revokeAllForAdmin(adminId: string): Promise<number> {
    const { count } = await this.prisma.adminSession.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }
}
