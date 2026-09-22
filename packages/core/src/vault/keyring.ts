// Seed-rooted key tree (see PLAN.md section 5.4):
//   mnemonic -> seed -> HKDF-SHA256(salt "dcv/v1", info ...) ->
//     vault-key (AES-GCM), holder-key/<issuerDid> (pairwise secp256k1),
//     holder-key/default, pointer-key, backup-key.
// The seed is wrapped at rest by an argon2id-derived key and lives in memory only while unlocked.
import type { Address, Hex } from 'viem';
import { b64u } from '../crypto/base64url.js';
import { DCV_HKDF_SALT, hkdfSha256 } from '../crypto/hkdf.js';
import { generateMnemonic12, seedFromMnemonic } from '../crypto/mnemonic.js';
import { secpAddress, secpKeyFromHkdf } from '../crypto/secp.js';
import { addressToDid } from '../did/ethr.js';
import { deriveWrapKey, newKdfParams, type KdfParams } from './kdf.js';
import { VaultError, aesGcmDecrypt, aesGcmEncrypt } from './record.js';

export const SEED_AAD = 'dcv/seed/v1';

export interface VaultMeta {
  v: 1;
  kdf: KdfParams;
  /** base64url 12-byte IV for the wrapped seed */
  iv: string;
  /** base64url AES-GCM(wrapKey, seed) */
  wrappedSeed: string;
  createdAt: string;
  /** The display DID (holder-key/default), stored in clear for the lock screen. */
  defaultDid: string;
}

export interface HolderAccount {
  did: string;
  address: Address;
  privateKey: Hex;
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export class Keyring {
  private seed: Uint8Array | null;

  private constructor(seed: Uint8Array) {
    this.seed = seed;
  }

  /** Generate a new 12-word mnemonic and wrap its seed under `passphrase`. */
  static async create(
    passphrase: string,
    kdf: Partial<Omit<KdfParams, 'salt' | 'name'>> = {},
  ): Promise<{ keyring: Keyring; mnemonic: string; meta: VaultMeta }> {
    const mnemonic = generateMnemonic12();
    const { keyring, meta } = await Keyring.fromMnemonic(mnemonic, passphrase, kdf);
    return { keyring, mnemonic, meta };
  }

  /** Restore from a mnemonic and wrap the seed under a (possibly new) passphrase. */
  static async fromMnemonic(
    mnemonic: string,
    passphrase: string,
    kdf: Partial<Omit<KdfParams, 'salt' | 'name'>> = {},
  ): Promise<{ keyring: Keyring; meta: VaultMeta }> {
    let seed: Uint8Array;
    try {
      seed = await seedFromMnemonic(mnemonic);
    } catch {
      throw new VaultError('INVALID_MNEMONIC');
    }
    const params = newKdfParams(kdf);
    const wrapKey = await deriveWrapKey(passphrase, params);
    const { iv, ct } = await aesGcmEncrypt(wrapKey, seed, SEED_AAD);
    const keyring = new Keyring(seed);
    const meta: VaultMeta = {
      v: 1,
      kdf: params,
      iv: b64u.encode(iv),
      wrappedSeed: b64u.encode(ct),
      createdAt: new Date().toISOString(),
      defaultDid: (await keyring.holderAccount('default')).did,
    };
    return { keyring, meta };
  }

  /** Unwrap the seed with the passphrase used at creation. */
  static async unlock(meta: VaultMeta, passphrase: string): Promise<Keyring> {
    if (meta.v !== 1) throw new VaultError('BAD_FORMAT', `unsupported vault meta v${String(meta.v)}`);
    const wrapKey = await deriveWrapKey(passphrase, meta.kdf);
    try {
      const seed = await aesGcmDecrypt(wrapKey, b64u.decode(meta.iv), b64u.decode(meta.wrappedSeed), SEED_AAD);
      return new Keyring(seed);
    } catch {
      throw new VaultError('BAD_PASSPHRASE');
    }
  }

  get locked(): boolean {
    return this.seed === null;
  }

  /** Zero-fill the seed and forget it. Derived CryptoKeys are non-extractable and simply dropped. */
  lock(): void {
    if (this.seed) this.seed.fill(0);
    this.seed = null;
  }

  private requireSeed(): Uint8Array {
    if (!this.seed) throw new VaultError('LOCKED');
    return this.seed;
  }

  private derive(info: string, length = 32): Uint8Array {
    return hkdfSha256(this.requireSeed(), DCV_HKDF_SALT, info, length);
  }

  async vaultKey(): Promise<CryptoKey> {
    return importAesKey(this.derive('vault-key'));
  }

  async backupKey(): Promise<CryptoKey> {
    return importAesKey(this.derive('backup-key'));
  }

  /**
   * A pairwise secp256k1 account per context. `context` is the issuer DID for
   * credentials (so every issuer sees a different holder DID) or 'default' for
   * the wallet's display identity.
   */
  async holderAccount(context: string): Promise<HolderAccount> {
    const privateKey = secpKeyFromHkdf(this.requireSeed(), `holder-key/${context}`);
    const address = secpAddress(privateKey);
    return { did: addressToDid(address), address, privateKey };
  }

  /** The pseudonymous account that writes VaultPointer; unlinkable to any DID. */
  async pointerAccount(): Promise<{ address: Address; privateKey: Hex }> {
    const privateKey = secpKeyFromHkdf(this.requireSeed(), 'pointer-key');
    return { address: secpAddress(privateKey), privateKey };
  }
}
