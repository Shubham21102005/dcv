// AES-256-GCM records: fresh 96-bit IV per record, AAD = the plaintext header so
// a ciphertext cannot be moved to another row without failing the tag check.
import { b64u } from '../crypto/base64url.js';
import { randomBytes } from '../crypto/random.js';

export type RecordType = 'credential' | 'setting';

export interface RecordHeader {
  v: 1;
  id: string;
  type: RecordType;
  createdAt: string;
}

export interface VaultRecord {
  id: string;
  header: RecordHeader;
  /** base64url 12-byte IV */
  iv: string;
  /** base64url ciphertext || 16-byte GCM tag */
  ct: string;
}

export type VaultErrorCode = 'BAD_PASSPHRASE' | 'LOCKED' | 'INVALID_MNEMONIC' | 'DECRYPT_FAILED' | 'BAD_FORMAT';

export class VaultError extends Error {
  readonly code: VaultErrorCode;

  constructor(code: VaultErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'VaultError';
    this.code = code;
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function aesGcmEncrypt(key: CryptoKey, plaintext: Uint8Array, aad: string): Promise<{ iv: Uint8Array; ct: Uint8Array }> {
  const iv = randomBytes(12);
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(aad) as BufferSource },
    key,
    plaintext as BufferSource,
  );
  return { iv, ct: new Uint8Array(ct) };
}

export async function aesGcmDecrypt(key: CryptoKey, iv: Uint8Array, ct: Uint8Array, aad: string): Promise<Uint8Array> {
  try {
    const pt = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(aad) as BufferSource },
      key,
      ct as BufferSource,
    );
    return new Uint8Array(pt);
  } catch {
    throw new VaultError('DECRYPT_FAILED', 'AES-GCM authentication failed');
  }
}

export function newRecordHeader(type: RecordType, id: string = globalThis.crypto.randomUUID()): RecordHeader {
  return { v: 1, id, type, createdAt: new Date().toISOString() };
}

export async function encryptRecord(key: CryptoKey, header: RecordHeader, value: unknown): Promise<VaultRecord> {
  const aad = JSON.stringify(header);
  const { iv, ct } = await aesGcmEncrypt(key, enc.encode(JSON.stringify(value)), aad);
  return { id: header.id, header, iv: b64u.encode(iv), ct: b64u.encode(ct) };
}

export async function decryptRecord<T = unknown>(key: CryptoKey, rec: VaultRecord): Promise<T> {
  const pt = await aesGcmDecrypt(key, b64u.decode(rec.iv), b64u.decode(rec.ct), JSON.stringify(rec.header));
  return JSON.parse(dec.decode(pt)) as T;
}
