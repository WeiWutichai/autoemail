import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateSuppressionInput, SuppressedEmailDto } from '@erp-mail/shared';
import { Prisma, type ErpConnection, type SuppressedEmail } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Row = SuppressedEmail & { connection: Pick<ErpConnection, 'name'> | null };
const INCLUDE = { connection: { select: { name: true } } } as const;

function toDto(row: Row): SuppressedEmailDto {
  return {
    id: row.id,
    email: row.email,
    connectionId: row.connectionId,
    connectionName: row.connection?.name ?? null,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Admin-managed list of addresses that never receive a mail. */
@Injectable()
export class SuppressionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SuppressedEmailDto[]> {
    const rows = await this.prisma.suppressedEmail.findMany({
      include: INCLUDE,
      orderBy: [{ email: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toDto);
  }

  async create(input: CreateSuppressionInput): Promise<SuppressedEmailDto> {
    const exists = () =>
      new ConflictException({
        code: 'SUPPRESSION_EXISTS',
        message: 'Email is already on the suppression list for this database',
      });
    if (input.connectionId) {
      const conn = await this.prisma.erpConnection.findUnique({
        where: { id: input.connectionId },
        select: { id: true },
      });
      if (!conn) {
        throw new NotFoundException({ code: 'CONNECTION_NOT_FOUND', message: 'Not found' });
      }
    } else {
      // The unique index treats NULL connection ids as distinct.
      const global = await this.prisma.suppressedEmail.findFirst({
        where: { email: input.email, connectionId: null },
        select: { id: true },
      });
      if (global) throw exists();
    }
    try {
      return toDto(await this.prisma.suppressedEmail.create({ data: input, include: INCLUDE }));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw exists();
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
