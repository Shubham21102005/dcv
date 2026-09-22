// IndexedDB persistence over idb-keyval. Stores ONLY VaultMeta (wrapped seed)
// and VaultRecord rows (ciphertext) - never plaintext.
import { clear, createStore, del, entries, get, set, type UseStore } from 'idb-keyval';
import type { VaultMeta } from './keyring.js';
import type { VaultRecord } from './record.js';

export const VAULT_DB_NAME = 'dcv';
const META_KEY = 'meta';
const REC_PREFIX = 'rec:';

export class VaultStore {
  private readonly store: UseStore;

  constructor(dbName: string = VAULT_DB_NAME) {
    this.store = createStore(dbName, 'vault');
  }

  putMeta(meta: VaultMeta): Promise<void> {
    return set(META_KEY, meta, this.store);
  }

  getMeta(): Promise<VaultMeta | undefined> {
    return get<VaultMeta>(META_KEY, this.store);
  }

  put(rec: VaultRecord): Promise<void> {
    return set(`${REC_PREFIX}${rec.id}`, rec, this.store);
  }

  get(id: string): Promise<VaultRecord | undefined> {
    return get<VaultRecord>(`${REC_PREFIX}${id}`, this.store);
  }

  delete(id: string): Promise<void> {
    return del(`${REC_PREFIX}${id}`, this.store);
  }

  async list(): Promise<VaultRecord[]> {
    const all = await entries<string, VaultRecord>(this.store);
    return all.filter(([k]) => k.startsWith(REC_PREFIX)).map(([, v]) => v);
  }

  /** Every raw key/value pair (used by the stolen-device test to prove nothing is in clear). */
  dumpRaw(): Promise<[string, unknown][]> {
    return entries<string, unknown>(this.store);
  }

  clear(): Promise<void> {
    return clear(this.store);
  }
}
