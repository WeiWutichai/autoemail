import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  CreateErpConnectionInput,
  ErpConnectionDto,
  TestConnectionResult,
  UpdateErpConnectionInput,
} from '@erp-mail/shared';
import { Prisma, type ErpConnection } from '@prisma/client';
import { CryptoService } from '../common/crypto/crypto.service';
import { ErpDataSourceFactory } from '../erp/erp-datasource.factory';
import { PrismaService } from '../prisma/prisma.service';
import { toErpConnectionDto } from './connection.mapper';

/** Fields that change where / how we connect; editing any of them invalidates the last test. */
const CONNECTION_FIELDS = [
  'dbType',
  'host',
  'port',
  'database',
  'username',
  'password',
  'ssl',
  'trustServerCert',
] as const;

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly datasources: ErpDataSourceFactory,
  ) {}

  async list(): Promise<ErpConnectionDto[]> {
    const rows = await this.prisma.erpConnection.findMany({ orderBy: { name: 'asc' } });
    return rows.map(toErpConnectionDto);
  }

  async get(id: string): Promise<ErpConnectionDto> {
    return toErpConnectionDto(await this.findOrThrow(id));
  }

  async create(input: CreateErpConnectionInput): Promise<ErpConnectionDto> {
    const { password, ...rest } = input;
    const conn = await this.withUniqueName(() =>
      this.prisma.erpConnection.create({
        data: { ...rest, passwordEnc: password ? this.crypto.encrypt(password) : null },
      }),
    );
    return toErpConnectionDto(conn);
  }

  async update(id: string, input: UpdateErpConnectionInput): Promise<ErpConnectionDto> {
    await this.findOrThrow(id);
    const { password, ...rest } = input;
    const resetTest = CONNECTION_FIELDS.some((field) => input[field] !== undefined);

    const conn = await this.withUniqueName(() =>
      this.prisma.erpConnection.update({
        where: { id },
        data: {
          ...rest,
          ...(password !== undefined ? { passwordEnc: this.crypto.encrypt(password) } : {}),
          ...(resetTest ? { lastTestAt: null, lastTestOk: null } : {}),
        },
      }),
    );
    await this.datasources.invalidate(id);
    return toErpConnectionDto(conn);
  }

  /** Deletes only connections nothing refers to; otherwise the admin should deactivate it. */
  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    const [syncConfigs, contacts, mails] = await Promise.all([
      this.prisma.erpSyncConfig.count({ where: { connectionId: id } }),
      this.prisma.contact.count({ where: { connectionId: id } }),
      this.prisma.mailQueue.count({ where: { connectionId: id } }),
    ]);
    if (syncConfigs + contacts + mails > 0) {
      throw new ConflictException({
        code: 'CONNECTION_IN_USE',
        message: 'Connection is in use; deactivate it instead',
        details: { syncConfigs, contacts, mails },
      });
    }
    await this.prisma.erpConnection.delete({ where: { id } });
    await this.datasources.invalidate(id);
  }

  /** Pings the ERP database and records the outcome on the connection. */
  async test(id: string): Promise<TestConnectionResult> {
    const conn = await this.findOrThrow(id);
    const result = await this.datasources.testConnection(conn);
    const testedAt = new Date();
    await this.prisma.erpConnection.update({
      where: { id },
      data: { lastTestAt: testedAt, lastTestOk: result.ok },
    });
    this.logger.log(`ERP connection test id=${id} ok=${result.ok} latencyMs=${result.latencyMs}`);
    return { ...result, testedAt: testedAt.toISOString() };
  }

  private async findOrThrow(id: string): Promise<ErpConnection> {
    const conn = await this.prisma.erpConnection.findUnique({ where: { id } });
    if (!conn) {
      throw new NotFoundException({
        code: 'CONNECTION_NOT_FOUND',
        message: 'ERP connection not found',
      });
    }
    return conn;
  }

  private async withUniqueName(write: () => Promise<ErpConnection>): Promise<ErpConnection> {
    try {
      return await write();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'CONNECTION_NAME_TAKEN',
          message: 'Connection name is already in use',
        });
      }
      throw err;
    }
  }
}
