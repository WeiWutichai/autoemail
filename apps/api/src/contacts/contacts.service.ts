import { Injectable } from '@nestjs/common';
import type { ContactDto, ContactListQuery, Paginated } from '@erp-mail/shared';
import type { Contact, ErpConnection, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ContactWithConnection = Contact & { connection: Pick<ErpConnection, 'name'> };

export function toContactDto(contact: ContactWithConnection): ContactDto {
  const raw = contact.raw;
  return {
    id: contact.id,
    connectionId: contact.connectionId,
    connectionName: contact.connection.name,
    erpRefId: contact.erpRefId,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
    raw: raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null,
    syncedAt: contact.syncedAt.toISOString(),
  };
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ContactListQuery): Promise<Paginated<ContactDto>> {
    const where: Prisma.ContactWhereInput = {
      ...(query.connectionId ? { connectionId: query.connectionId } : {}),
      ...(query.q
        ? {
            OR: (['name', 'email', 'company', 'erpRefId'] as const).map((field) => ({
              [field]: { contains: query.q, mode: 'insensitive' as const },
            })),
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.contact.count({ where }),
      this.prisma.contact.findMany({
        where,
        include: { connection: { select: { name: true } } },
        orderBy: [{ name: 'asc' }, { email: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toContactDto), total, page: query.page, pageSize: query.pageSize };
  }
}
