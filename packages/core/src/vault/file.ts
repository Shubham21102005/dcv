// Encrypted export/import format (vault.dcv.json): the wrapped seed + ciphertext records.
import type { VaultMeta } from './keyring.js';
import { VaultError, type VaultRecord } from './record.js';

export interface VaultFile {
  v: 1;
  meta: VaultMeta;
  records: VaultRecord[];
}

export function exportVaultFile(meta: VaultMeta, records: VaultRecord[]): VaultFile {
  return { v: 1, meta, records };
}

export function parseVaultFile(json: string): VaultFile {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new VaultError('BAD_FORMAT', 'not JSON');
  }
  const f = value as Partial<VaultFile> | null;
  if (!f || f.v !== 1 || !f.meta || typeof f.meta.wrappedSeed !== 'string' || !Array.isArray(f.records)) {
    throw new VaultError('BAD_FORMAT', 'not a vault file');
  }
  for (const r of f.records) {
    if (typeof r.id !== 'string' || typeof r.iv !== 'string' || typeof r.ct !== 'string' || !r.header) {
      throw new VaultError('BAD_FORMAT', 'bad record');
    }
  }
  return f as VaultFile;
}
