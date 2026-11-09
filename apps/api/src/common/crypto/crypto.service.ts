import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { BaseEnv } from '../../config/env';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** AES-256-GCM encryption for secrets stored in the database (ERP / SMTP passwords). */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService<BaseEnv, true>) {
    this.key = CryptoService.parseKey(config.get('MASTER_KEY', { infer: true }));
  }

  static parseKey(raw: string | undefined): Buffer {
    const key = Buffer.from(raw ?? '', 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error(`MASTER_KEY must be ${KEY_BYTES} bytes encoded as base64`);
    }
    return key;
  }

  /** Returns `v1:<iv_b64>:<tag_b64>:<cipher_b64>`. */
  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decrypt(enc: string): string {
    const parts = enc.split(':');
    if (parts.length !== 4 || parts[0] !== VERSION) {
      throw new Error('Unsupported ciphertext format');
    }
    const [, ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error('Unsupported ciphertext format');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
