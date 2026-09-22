// Passphrase -> AES-256-GCM wrapping key via argon2id (hash-wasm, WASM).
import { argon2id } from 'hash-wasm';
import { b64u } from '../crypto/base64url.js';
import { randomBytes } from '../crypto/random.js';

export interface KdfParams {
  name: 'argon2id';
  /** iterations (time cost) */
  t: number;
  /** memory in KiB */
  m: number;
  /** parallelism */
  p: number;
  /** base64url 16-byte salt */
  salt: string;
}

/** Defaults: ~0.3-0.8 s in a Web Worker on a laptop. Stored in the vault meta, so lowering them later is safe. */
export const DEFAULT_KDF: Omit<KdfParams, 'salt'> = { name: 'argon2id', t: 3, m: 32_768, p: 1 };

export function newKdfParams(overrides: Partial<Omit<KdfParams, 'salt' | 'name'>> = {}): KdfParams {
  return { ...DEFAULT_KDF, ...overrides, salt: b64u.encode(randomBytes(16)) };
}

export async function deriveWrapKey(passphrase: string, kdf: KdfParams): Promise<CryptoKey> {
  if (kdf.name !== 'argon2id') throw new Error(`unsupported kdf ${String(kdf.name)}`);
  const raw = await argon2id({
    password: passphrase.normalize('NFKC'),
    salt: b64u.decode(kdf.salt),
    iterations: kdf.t,
    memorySize: kdf.m,
    parallelism: kdf.p,
    hashLength: 32,
    outputType: 'binary',
  });
  return globalThis.crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
