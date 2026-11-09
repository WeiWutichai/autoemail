import type { ConfigService } from '@nestjs/config';
import { CryptoService } from '../common/crypto/crypto.service';
import type { BaseEnv } from '../config/env';
import { reencrypt } from './rotate-key';

const crypto = (fill: number) =>
  new CryptoService({
    get: () => Buffer.alloc(32, fill).toString('base64'),
  } as unknown as ConfigService<BaseEnv, true>);

describe('reencrypt', () => {
  it('re-encrypts secrets with the new key and skips empty ones', () => {
    const oldKey = crypto(1);
    const newKey = crypto(2);
    const rows = [
      { id: 'a', passwordEnc: oldKey.encrypt('erp-pass') },
      { id: 'b', passwordEnc: null },
    ];
    const out = reencrypt(rows, oldKey, newKey);
    expect(out).toHaveLength(1);
    expect(newKey.decrypt(out[0].passwordEnc)).toBe('erp-pass');
    expect(() => oldKey.decrypt(out[0].passwordEnc)).toThrow();
  });

  it('fails when a secret was not encrypted with the current key', () => {
    const rows = [{ id: 'a', passwordEnc: crypto(3).encrypt('x') }];
    expect(() => reencrypt(rows, crypto(1), crypto(2))).toThrow();
  });
});
