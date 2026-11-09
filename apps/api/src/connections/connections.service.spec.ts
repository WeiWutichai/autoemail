import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type ErpConnection } from '@prisma/client';
import type { CryptoService } from '../common/crypto/crypto.service';
import type { ErpDataSourceFactory } from '../erp/erp-datasource.factory';
import type { PrismaService } from '../prisma/prisma.service';
import { ConnectionsService } from './connections.service';

const now = new Date('2026-11-09T00:00:00Z');
const conn: ErpConnection = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'ERP-HQ',
  dbType: 'MSSQL',
  host: 'erp.local',
  port: 1433,
  database: 'ERP',
  username: 'reader',
  passwordEnc: 'enc:secret',
  ssl: false,
  trustServerCert: true,
  isActive: true,
  lastTestAt: now,
  lastTestOk: true,
  createdAt: now,
  updatedAt: now,
};

const createInput = {
  name: 'ERP-HQ',
  dbType: 'MSSQL' as const,
  host: 'erp.local',
  port: 1433,
  database: 'ERP',
  username: 'reader',
  password: 'secret',
  ssl: false,
  trustServerCert: true,
  isActive: true,
};

function setup() {
  const prisma = {
    erpConnection: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    erpSyncConfig: { count: vi.fn().mockResolvedValue(0) },
    contact: { count: vi.fn().mockResolvedValue(0) },
    mailQueue: { count: vi.fn().mockResolvedValue(0) },
  };
  const crypto = { encrypt: vi.fn((v: string) => `enc:${v}`) };
  const datasources = {
    invalidate: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn(),
  };
  const service = new ConnectionsService(
    prisma as unknown as PrismaService,
    crypto as unknown as CryptoService,
    datasources as unknown as ErpDataSourceFactory,
  );
  return { prisma, crypto, datasources, service };
}

const duplicate = () =>
  new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' });

describe('ConnectionsService', () => {
  it('lists connections without the encrypted password', async () => {
    const { prisma, service } = setup();
    prisma.erpConnection.findMany.mockResolvedValue([conn, { ...conn, passwordEnc: null }]);

    const [a, b] = await service.list();
    expect(a).not.toHaveProperty('passwordEnc');
    expect(a.hasPassword).toBe(true);
    expect(b.hasPassword).toBe(false);
  });

  it('encrypts the password on create', async () => {
    const { prisma, service } = setup();
    prisma.erpConnection.create.mockResolvedValue(conn);

    await service.create(createInput);
    const data = prisma.erpConnection.create.mock.calls[0][0].data;
    expect(data.passwordEnc).toBe('enc:secret');
    expect(data).not.toHaveProperty('password');
  });

  it('stores null when created without a password', async () => {
    const { prisma, crypto, service } = setup();
    prisma.erpConnection.create.mockResolvedValue({ ...conn, passwordEnc: null });

    await service.create({ ...createInput, password: undefined });
    expect(prisma.erpConnection.create.mock.calls[0][0].data.passwordEnc).toBeNull();
    expect(crypto.encrypt).not.toHaveBeenCalled();
  });

  it('maps duplicate names to 409 CONNECTION_NAME_TAKEN', async () => {
    const { prisma, service } = setup();
    prisma.erpConnection.create.mockRejectedValue(duplicate());

    await expect(service.create(createInput)).rejects.toMatchObject({
      response: { code: 'CONNECTION_NAME_TAKEN' },
    });
  });

  it('keeps the stored password and test status when only renaming', async () => {
    const { prisma, crypto, datasources, service } = setup();
    prisma.erpConnection.findUnique.mockResolvedValue(conn);
    prisma.erpConnection.update.mockResolvedValue({ ...conn, name: 'New' });

    await service.update(conn.id, { name: 'New' });
    const data = prisma.erpConnection.update.mock.calls[0][0].data;
    expect(data).toEqual({ name: 'New' });
    expect(crypto.encrypt).not.toHaveBeenCalled();
    expect(datasources.invalidate).toHaveBeenCalledWith(conn.id);
  });

  it('re-encrypts a new password and resets the last test result', async () => {
    const { prisma, service } = setup();
    prisma.erpConnection.findUnique.mockResolvedValue(conn);
    prisma.erpConnection.update.mockResolvedValue(conn);

    await service.update(conn.id, { password: 'new', host: 'erp2.local' });
    expect(prisma.erpConnection.update.mock.calls[0][0].data).toEqual({
      host: 'erp2.local',
      passwordEnc: 'enc:new',
      lastTestAt: null,
      lastTestOk: null,
    });
  });

  it('maps duplicate names on update to 409', async () => {
    const { prisma, service } = setup();
    prisma.erpConnection.findUnique.mockResolvedValue(conn);
    prisma.erpConnection.update.mockRejectedValue(duplicate());

    await expect(service.update(conn.id, { name: 'Taken' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('deletes an unused connection and closes its pool', async () => {
    const { prisma, datasources, service } = setup();
    prisma.erpConnection.findUnique.mockResolvedValue(conn);

    await service.remove(conn.id);
    expect(prisma.erpConnection.delete).toHaveBeenCalledWith({ where: { id: conn.id } });
    expect(datasources.invalidate).toHaveBeenCalledWith(conn.id);
  });

  it('refuses to delete a connection that is in use', async () => {
    const { prisma, service } = setup();
    prisma.erpConnection.findUnique.mockResolvedValue(conn);
    prisma.mailQueue.count.mockResolvedValue(3);

    await expect(service.remove(conn.id)).rejects.toMatchObject({
      response: { code: 'CONNECTION_IN_USE', details: { syncConfigs: 0, contacts: 0, mails: 3 } },
    });
    expect(prisma.erpConnection.delete).not.toHaveBeenCalled();
  });

  it('records the test outcome on the connection', async () => {
    const { prisma, datasources, service } = setup();
    prisma.erpConnection.findUnique.mockResolvedValue(conn);
    datasources.testConnection.mockResolvedValue({ ok: false, latencyMs: 12, error: 'timeout' });

    const result = await service.test(conn.id);
    expect(result).toMatchObject({ ok: false, latencyMs: 12, error: 'timeout' });
    const data = prisma.erpConnection.update.mock.calls[0][0].data;
    expect(data.lastTestOk).toBe(false);
    expect(data.lastTestAt.toISOString()).toBe(result.testedAt);
  });

  it('returns 404 CONNECTION_NOT_FOUND for unknown ids', async () => {
    const { prisma, service } = setup();
    prisma.erpConnection.findUnique.mockResolvedValue(null);

    for (const call of [
      () => service.get(conn.id),
      () => service.update(conn.id, { name: 'x' }),
      () => service.remove(conn.id),
      () => service.test(conn.id),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(NotFoundException);
    }
  });
});
