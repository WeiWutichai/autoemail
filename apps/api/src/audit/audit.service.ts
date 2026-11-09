import { Injectable, Logger } from '@nestjs/common';
import type { AuditListQuery, AuditLogDto, Paginated } from '@erp-mail/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { redactForAudit } from './redact';

export interface AuditEntry {
  adminId: string | null;
  action: string;
  target: string | null;
  body: unknown;
  ip: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Never throws: a failed audit write must not fail the admin's action. */
  async record(entry: AuditEntry): Promise<void> {
    const diff = redactForAudit(entry.body);
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId: entry.adminId,
          action: entry.action,
          target: entry.target,
          diff:
            diff && typeof diff === 'object' && Object.keys(diff).length > 0
              ? (diff as Prisma.InputJsonObject)
              : undefined,
          ip: entry.ip,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log for ${entry.action}: ${(err as Error).message}`);
    }
  }

  async list(query: AuditListQuery): Promise<Paginated<AuditLogDto>> {
    const where: Prisma.AdminAuditLogWhereInput = query.action
      ? { action: { startsWith: query.action } }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.adminAuditLog.count({ where }),
      this.prisma.adminAuditLog.findMany({
        where,
        include: { admin: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        adminEmail: r.admin?.email ?? null,
        action: r.action,
        target: r.target,
        diff: r.diff && typeof r.diff === 'object' && !Array.isArray(r.diff) ? r.diff : null,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
