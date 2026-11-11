import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateSuppressionInput, SuppressedEmailDto } from '@erp-mail/shared';
import { Prisma, type SuppressedEmail } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function toDto(row: SuppressedEmail): SuppressedEmailDto {
  return {
    id: row.id,
    email: row.email,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Admin-managed list of addresses that never receive a mail. */
@Injectable()
export class SuppressionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SuppressedEmailDto[]> {
    const rows = await this.prisma.suppressedEmail.findMany({ orderBy: { email: 'asc' } });
    return rows.map(toDto);
  }

  async create(input: CreateSuppressionInput): Promise<SuppressedEmailDto> {
    try {
      return toDto(await this.prisma.suppressedEmail.create({ data: input }));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'SUPPRESSION_EXISTS',
          message: 'Email is already on the suppression list',
        });
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const { count } = await this.prisma.suppressedEmail.deleteMany({ where: { id } });
    if (count === 0) {
      throw new NotFoundException({ code: 'SUPPRESSION_NOT_FOUND', message: 'Not found' });
    }
  }
}
