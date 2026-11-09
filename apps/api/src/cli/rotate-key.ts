import type { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import { CryptoService } from '../common/crypto/crypto.service';
import type { BaseEnv } from '../config/env';

export interface SecretRow {
  id: string;
  passwordEnc: string | null;
}

/** Re-encrypts every secret with the new key; throws if any secret does not decrypt. */
export function reencrypt(
  rows: SecretRow[],
  from: Pick<CryptoService, 'decrypt'>,
  to: Pick<CryptoService, 'encrypt'>,
): { id: string; passwordEnc: string }[] {
  return rows
    .filter((r): r is { id: string; passwordEnc: string } => r.passwordEnc !== null)
    .map((r) => ({ id: r.id, passwordEnc: to.encrypt(from.decrypt(r.passwordEnc)) }));
}

const cryptoWithKey = (key: string | undefined) =>
  new CryptoService({ get: () => key } as unknown as ConfigService<BaseEnv, true>);

/**
 * Usage: MASTER_KEY=<current> NEW_MASTER_KEY=<new> node dist/cli/rotate-key.js
 * Re-encrypts ERP and SMTP passwords in one transaction; afterwards put NEW_MASTER_KEY into
 * .env as MASTER_KEY and restart api + worker.
 */
async function main(): Promise<void> {
  const logger = pino({ name: 'rotate-key' });
  let from: CryptoService;
  let to: CryptoService;
  try {
    from = cryptoWithKey(process.env.MASTER_KEY);
    to = cryptoWithKey(process.env.NEW_MASTER_KEY);
  } catch (err) {
    logger.error((err as Error).message);
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const [connections, smtpConfigs] = await Promise.all([
      prisma.erpConnection.findMany({ select: { id: true, passwordEnc: true } }),
      prisma.smtpConfig.findMany({ select: { id: true, passwordEnc: true } }),
    ]);
    const conn = reencrypt(connections, from, to);
    const smtp = reencrypt(smtpConfigs, from, to);
    await prisma.$transaction([
      ...conn.map((r) =>
        prisma.erpConnection.update({ where: { id: r.id }, data: { passwordEnc: r.passwordEnc } }),
      ),
      ...smtp.map((r) =>
        prisma.smtpConfig.update({ where: { id: r.id }, data: { passwordEnc: r.passwordEnc } }),
      ),
    ]);
    logger.info(
      { erpConnections: conn.length, smtpConfigs: smtp.length },
      'Secrets re-encrypted; set MASTER_KEY to the new key and restart api + worker',
    );
  } catch (err) {
    logger.error(`Rotation aborted, nothing changed: ${(err as Error).message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
