import crypto from 'node:crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'v1';

function getKey(): Buffer {
  const material = env.ENCRYPTION_KEY || env.SESSION_SECRET;
  // Hash to guarantee a 32-byte AES-256 key regardless of input length.
  return crypto.createHash('sha256').update(material).digest();
}

/** Encrypts a secret (SMTP password, OAuth token) for storage at rest. */
export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(
    ':',
  );
}

/** Decrypts a value produced by encryptSecret. Throws if the payload is invalid. */
export function decryptSecret(payload: string): string {
  const [prefix, ivPart, tagPart, dataPart] = payload.split(':');
  if (prefix !== PREFIX || !ivPart || !tagPart || !dataPart) {
    throw new Error('Invalid encrypted payload');
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivPart, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function randomState(): string {
  return crypto.randomBytes(32).toString('base64url');
}
