import type { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { Env } from '../../config/env';
import { CryptoService } from './crypto.service';

function makeService(masterKey: string): CryptoService {
  const config = { get: () => masterKey } as unknown as ConfigService<Env, true>;
  return new CryptoService(config);
}

const newKey = (): string => randomBytes(32).toString('base64');

describe('CryptoService', () => {
  it('round-trips plaintext including unicode', () => {
    const service = makeService(newKey());
    const plain = 'p@ssw0rd-รหัสผ่าน';
    const enc = service.encrypt(plain);

    expect(enc).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(enc).not.toContain(plain);
    expect(service.decrypt(enc)).toBe(plain);
  });

  it('uses a fresh IV for each encryption', () => {
    const service = makeService(newKey());
    expect(service.encrypt('same')).not.toBe(service.encrypt('same'));
  });

  it('throws when MASTER_KEY is missing or not 32 bytes', () => {
    expect(() => makeService('')).toThrow(/MASTER_KEY/);
    expect(() => makeService('change-me-32-bytes-base64')).toThrow(/MASTER_KEY/);
    expect(() => makeService(randomBytes(16).toString('base64'))).toThrow(/MASTER_KEY/);
  });

  it('throws when decrypting with a different key', () => {
    const enc = makeService(newKey()).encrypt('secret');
    expect(() => makeService(newKey()).decrypt(enc)).toThrow();
  });

  it('throws when ciphertext is tampered', () => {
    const service = makeService(newKey());
    const [version, iv, tag, data] = service.encrypt('secret').split(':');
    const bytes = Buffer.from(data, 'base64');
    bytes[0] ^= 0xff;
    const tampered = [version, iv, tag, bytes.toString('base64')].join(':');

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('throws when auth tag is tampered', () => {
    const service = makeService(newKey());
    const [version, iv, , data] = service.encrypt('secret').split(':');
    const badTag = randomBytes(16).toString('base64');

    expect(() => service.decrypt([version, iv, badTag, data].join(':'))).toThrow();
  });

  it('rejects malformed or unknown-version payloads', () => {
    const service = makeService(newKey());
    expect(() => service.decrypt('not-encrypted')).toThrow(/format/);
    expect(() => service.decrypt(service.encrypt('x').replace(/^v1/, 'v2'))).toThrow(/format/);
  });
});
