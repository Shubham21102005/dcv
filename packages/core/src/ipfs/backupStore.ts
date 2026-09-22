// Encrypted vault backups: AES-256-GCM bundle on IPFS + an encrypted locator in
// VaultPointer. Only ciphertext ever leaves the device (assertOpaque guards it).
import { bytesToHex, hexToBytes, type Hex } from 'viem';
import { assertOpaque } from '../privacy/opaque.js';
import { aesGcmDecrypt, aesGcmEncrypt, type VaultRecord } from '../vault/record.js';
import type { BlobStore } from './blobStore.js';

export const BACKUP_AAD = 'dcv/backup/v1';
export const POINTER_AAD = 'dcv/pointer/v1';

export interface BackupBundle {
  v: 1;
  records: VaultRecord[];
  createdAt: string;
}

/** iv(12) || ciphertext */
function pack(iv: Uint8Array, ct: Uint8Array): Uint8Array {
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
}
function unpack(bytes: Uint8Array): { iv: Uint8Array; ct: Uint8Array } {
  if (bytes.length < 12 + 16) throw new Error('backup blob too short');
  return { iv: bytes.slice(0, 12), ct: bytes.slice(12) };
}

export class BackupStore {
  private readonly blobs: BlobStore;

  constructor(blobs: BlobStore) {
    this.blobs = blobs;
  }

  /** Guarded add: refuses anything that is not opaque ciphertext. */
  async put(bytes: Uint8Array): Promise<string> {
    assertOpaque(bytes);
    return this.blobs.add(bytes);
  }

  /** Encrypt the records with the backup key and add the bundle; returns its CID. */
  async backup(backupKey: CryptoKey, records: VaultRecord[]): Promise<{ cid: string; bytes: number }> {
    const bundle: BackupBundle = { v: 1, records, createdAt: new Date().toISOString() };
    const { iv, ct } = await aesGcmEncrypt(backupKey, new TextEncoder().encode(JSON.stringify(bundle)), BACKUP_AAD);
    const blob = pack(iv, ct);
    const cid = await this.put(blob);
    return { cid, bytes: blob.length };
  }

  async restore(backupKey: CryptoKey, cid: string, fetchBlob?: (cid: string) => Promise<Uint8Array>): Promise<BackupBundle> {
    const blob = await (fetchBlob ?? ((c) => this.blobs.cat(c)))(cid);
    const { iv, ct } = unpack(blob);
    const pt = await aesGcmDecrypt(backupKey, iv, ct, BACKUP_AAD);
    const bundle = JSON.parse(new TextDecoder().decode(pt)) as BackupBundle;
    if (bundle.v !== 1 || !Array.isArray(bundle.records)) throw new Error('not a backup bundle');
    return bundle;
  }
}

/** Encrypt a CID into the bytes stored in VaultPointer. */
export async function encryptLocator(backupKey: CryptoKey, cid: string): Promise<Hex> {
  const { iv, ct } = await aesGcmEncrypt(backupKey, new TextEncoder().encode(cid), POINTER_AAD);
  const packed = pack(iv, ct);
  assertOpaque(packed);
  return bytesToHex(packed);
}

export async function decryptLocator(backupKey: CryptoKey, locator: Hex): Promise<string> {
  const { iv, ct } = unpack(hexToBytes(locator));
  return new TextDecoder().decode(await aesGcmDecrypt(backupKey, iv, ct, POINTER_AAD));
}
