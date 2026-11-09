import type { ErpConnectionDto } from '@erp-mail/shared';
import type { ErpConnection } from '@prisma/client';

/** Strips `passwordEnc` (exposes `hasPassword` only) and serializes dates. */
export function toErpConnectionDto(conn: ErpConnection): ErpConnectionDto {
  return {
    id: conn.id,
    name: conn.name,
    dbType: conn.dbType,
    host: conn.host,
    port: conn.port,
    database: conn.database,
    username: conn.username,
    hasPassword: conn.passwordEnc !== null,
    ssl: conn.ssl,
    trustServerCert: conn.trustServerCert,
    isActive: conn.isActive,
    lastTestAt: conn.lastTestAt?.toISOString() ?? null,
    lastTestOk: conn.lastTestOk,
    createdAt: conn.createdAt.toISOString(),
    updatedAt: conn.updatedAt.toISOString(),
  };
}
