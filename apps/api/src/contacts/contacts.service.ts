import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ContactDto,
  ContactListQuery,
  CreateContactInput,
  Paginated,
  UpdateContactInput,
} from '@erp-mail/shared';
import type { Contact, ErpConnection, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ContactWithConnection = Contact & { connection: Pick<ErpConnection, 'name'> | null };

const INCLUDE = { connection: { select: { name: true } } } as const;

export function toContactDto(contact: ContactWithConnection): ContactDto {
  const raw = contact.raw;
  return {
    id: contact.id,
    source: contact.source,
    connectionId: contact.connectionId,
    connectionName: contact.connection?.name ?? null,
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
      ...(query.source ? { source: query.source } : {}),
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
        include: INCLUDE,
        orderBy: [{ email: 'asc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toContactDto), total, page: query.page, pageSize: query.pageSize };
  }

  /** Adds an address by hand (source MANUAL). */
  async create(input: CreateContactInput): Promise<ContactDto> {
    await this.assertConnection(input.connectionId);
    await this.assertNoManualDuplicate(input.email, input.connectionId);
    const contact = await this.prisma.contact.create({
      data: { ...input, source: 'MANUAL' },
      include: INCLUDE,
    });
    return toContactDto(contact);
  }

  async update(id: string, input: UpdateContactInput): Promise<ContactDto> {
    const current = await this.manualOrThrow(id);
    if (input.connectionId !== undefined) await this.assertConnection(input.connectionId);
    const email = input.email ?? current.email ?? '';
    const connectionId =
      input.connectionId !== undefined ? input.connectionId : current.connectionId;
    await this.assertNoManualDuplicate(email, connectionId, id);
    const contact = await this.prisma.contact.update({
      where: { id },
      data: input,
      include: INCLUDE,
    });
    return toContactDto(contact);
  }

  async remove(id: string): Promise<void> {
    await this.manualOrThrow(id);
    await this.prisma.contact.delete({ where: { id } });
  }

  /** ERP contacts mirror the ERP and are changed there, not here. */
  private async manualOrThrow(id: string): Promise<Contact> {
    const contact = await this.prisma.contact.findUnique({ where: { id } });
    if (!contact) {
      throw new NotFoundException({ code: 'CONTACT_NOT_FOUND', message: 'Contact not found' });
    }
    if (contact.source !== 'MANUAL') {
      throw new ConflictException({
        code: 'CONTACT_FROM_ERP',
        message: 'Contacts from the ERP can only be changed in the ERP',
      });
    }
    return contact;
  }

  private async assertConnection(connectionId: string | null): Promise<void> {
    if (!connectionId) return;
    const conn = await this.prisma.erpConnection.findUnique({
      where: { id: connectionId },
      select: { id: true },
    });
    if (!conn) {
      throw new NotFoundException({
        code: 'CONNECTION_NOT_FOUND',
        message: 'ERP connection not found',
      });
    }
  }

  private async assertNoManualDuplicate(
    email: string,
    connectionId: string | null,
    exceptId?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.contact.findFirst({
      where: {
        source: 'MANUAL',
        email,
        connectionId,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: 'CONTACT_EXISTS',
        message: 'This address was already added',
      });
    }
  }
}
