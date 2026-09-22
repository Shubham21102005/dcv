// Wallet core state: the unlocked Keyring lives in this module (never React
// state, never localStorage). Everything here is framework-agnostic so it can be
// unit-tested with fake-indexeddb.
import { Keyring, type VaultMeta } from '@dcv/core/vault/keyring';
import { VaultError, decryptRecord, encryptRecord, newRecordHeader, type VaultRecord } from '@dcv/core/vault/record';
import { VaultStore } from '@dcv/core/vault/store';
import { exportVaultFile, parseVaultFile, type VaultFile } from '@dcv/core/vault/file';
import type { KeyringOptions } from '@dcv/core/vault/keyring';
import { peekSdJwt } from '@dcv/core/sdjwt/decode';
import { verifyIssuedSdJwtVc } from '@dcv/core/sdjwt/verify';
import { CredentialV2Schema } from '@dcv/core/vc/schema';
import { didToAddress } from '@dcv/core/did/ethr';
import { signOfferProof } from '@dcv/core/offer/proof';
import { presentSdJwtVc } from '@dcv/core/sdjwt/present';
import type { Address } from 'viem';

/** What the wallet stores per credential (encrypted at rest). */
export interface StoredCredential {
  id: string;
  sdJwt: string;
  issuerDid: string;
  issuerName: string;
  holderDid: string;
  type: string[];
  /** Resolved claims (issuer-signed), kept so the UI never re-decodes on render. */
  claims: Record<string, unknown>;
  credentialStatus?: { statusListCredential: string; statusListIndex: string; statusPurpose: string };
  receivedAt: string;
}

export interface OfferDetails {
  id: string;
  issuerDid: string;
  issuerName: string;
  type: string;
  nonce: string;
  expiresAt: number;
  subjectPreview: { name: string; degree: string };
  claimUrl: string;
}

export interface RequestDetails {
  id: string;
  nonce: string;
  aud: string;
  credentialType: string;
  claims: string[];
  expiresAt: number;
  verifierName: string;
  submitUrl: string;
  state: string;
}

export class NotMyCredential extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotMyCredential';
  }
}

type Listener = () => void;

export interface WalletDeps {
  store?: VaultStore;
  keyringOptions?: KeyringOptions;
  fetch?: typeof fetch;
  /** Chain read used before accepting a credential (injected so tests need no chain). */
  isTrustedFor?: (issuer: Address, credentialType: string) => Promise<boolean>;
}

export class Wallet {
  private keyring: Keyring | null = null;
  private meta: VaultMeta | null = null;
  private readonly listeners = new Set<Listener>();
  readonly store: VaultStore;
  private readonly fetchFn: typeof fetch;
  private readonly keyringOptions: KeyringOptions;
  private readonly isTrustedFor: WalletDeps['isTrustedFor'];

  constructor(deps: WalletDeps = {}) {
    this.store = deps.store ?? new VaultStore();
    this.fetchFn = deps.fetch ?? ((...args) => globalThis.fetch(...args));
    this.keyringOptions = deps.keyringOptions ?? {};
    this.isTrustedFor = deps.isTrustedFor;
  }

  // ---- reactivity -------------------------------------------------------------------
  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit(): void {
    for (const l of this.listeners) l();
  }
  /** Public re-render trigger for helpers that mutate the store directly (backup restore). */
  notify(): void {
    this.emit();
  }

  // ---- lifecycle ---------------------------------------------------------------------
  /** 'none' (no vault yet) | 'locked' | 'unlocked' */
  get status(): 'none' | 'locked' | 'unlocked' {
    if (!this.meta) return 'none';
    return this.keyring && !this.keyring.locked ? 'unlocked' : 'locked';
  }

  get defaultDid(): string | null {
    return this.meta?.defaultDid ?? null;
  }

  /** Load persisted meta (call once at startup). */
  async init(): Promise<void> {
    this.meta = (await this.store.getMeta()) ?? null;
    this.emit();
  }

  async create(passphrase: string): Promise<{ mnemonic: string; did: string }> {
    const { keyring, mnemonic, meta } = await Keyring.create(passphrase, this.keyringOptions);
    await this.store.clear();
    await this.store.putMeta(meta);
    this.keyring = keyring;
    this.meta = meta;
    this.emit();
    return { mnemonic, did: meta.defaultDid };
  }

  /** Restore identity from a mnemonic under a new passphrase (records come from a file/IPFS backup). */
  async restoreFromMnemonic(mnemonic: string, passphrase: string): Promise<{ did: string }> {
    const { keyring, meta } = await Keyring.fromMnemonic(mnemonic, passphrase, this.keyringOptions);
    await this.store.clear();
    await this.store.putMeta(meta);
    this.keyring = keyring;
    this.meta = meta;
    this.emit();
    return { did: meta.defaultDid };
  }

  async unlock(passphrase: string): Promise<void> {
    if (!this.meta) throw new VaultError('BAD_FORMAT', 'no vault');
    this.keyring = await Keyring.unlock(this.meta, passphrase, this.keyringOptions);
    this.emit();
  }

  lock(): void {
    this.keyring?.lock();
    this.keyring = null;
    this.emit();
  }

  private requireKeyring(): Keyring {
    if (!this.keyring || this.keyring.locked) throw new VaultError('LOCKED');
    return this.keyring;
  }

  holderAccount(context: string) {
    return this.requireKeyring().holderAccount(context);
  }

  pointerAccount() {
    return this.requireKeyring().pointerAccount();
  }

  backupKey() {
    return this.requireKeyring().backupKey();
  }

  // ---- credentials ------------------------------------------------------------------------
  async listCredentials(): Promise<StoredCredential[]> {
    const key = await this.requireKeyring().vaultKey();
    const records = (await this.store.list()).filter((r) => r.header.type === 'credential');
    const out: StoredCredential[] = [];
    for (const r of records) out.push(await decryptRecord<StoredCredential>(key, r));
    return out.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  }

  async getCredential(id: string): Promise<StoredCredential | null> {
    return (await this.listCredentials()).find((c) => c.id === id) ?? null;
  }

  async removeCredential(id: string): Promise<void> {
    await this.store.delete(id);
    this.emit();
  }

  /**
   * Verify an issued credential locally, then store it. Rejects anything not
   * bound to one of our keys or not issued by a trusted issuer.
   */
  async acceptCredential(sdJwt: string, opts: { issuerName?: string; issuerDid: string } ): Promise<StoredCredential> {
    const keyring = this.requireKeyring();
    const peek = await peekSdJwt(sdJwt);
    // 1. bound to the pairwise key we derived for this issuer
    const mine = await keyring.holderAccount(opts.issuerDid);
    if (peek.holderDid !== mine.did) throw new NotMyCredential(`credential is bound to ${peek.holderDid}, not to our key for this issuer (${mine.did})`);
    // 2. issuer signature recovers to the iss address
    if (peek.iss !== opts.issuerDid) throw new Error(`iss ${peek.iss} is not the offering issuer ${opts.issuerDid}`);
    await verifyIssuedSdJwtVc(sdJwt); // throws on bad signature / times
    // 3. schema
    const parsed = CredentialV2Schema.safeParse(peek.claims);
    if (!parsed.success) throw new Error(`not a VCDM 2.0 credential: ${parsed.error.issues[0]?.message}`);
    // 4. issuer trusted on chain for this type
    const type = Array.isArray(peek.payload.type) ? peek.payload.type : [];
    const credentialType = type.find((t) => t !== 'VerifiableCredential') ?? '';
    if (this.isTrustedFor && !(await this.isTrustedFor(didToAddress(opts.issuerDid), credentialType))) {
      throw new Error(`issuer ${opts.issuerDid} is not trusted on chain for ${credentialType}`);
    }
    const status = peek.payload.credentialStatus;
    const cred: StoredCredential = {
      id: typeof peek.payload.id === 'string' ? peek.payload.id : crypto.randomUUID(),
      sdJwt,
      issuerDid: opts.issuerDid,
      issuerName: opts.issuerName ?? (typeof peek.payload.issuer === 'object' ? (peek.payload.issuer.name ?? '') : ''),
      holderDid: peek.holderDid,
      type,
      claims: peek.claims,
      ...(status ? { credentialStatus: { statusListCredential: status.statusListCredential, statusListIndex: status.statusListIndex, statusPurpose: status.statusPurpose } } : {}),
      receivedAt: new Date().toISOString(),
    };
    const key = await keyring.vaultKey();
    await this.store.put(await encryptRecord(key, newRecordHeader('credential', cred.id), cred));
    this.emit();
    return cred;
  }

  // ---- protocol: offer -> claim ----------------------------------------------------------------
  async fetchOffer(offerUrl: string): Promise<OfferDetails> {
    const res = await this.fetchFn(offerUrl);
    if (!res.ok) throw new Error(`offer ${res.status}: ${((await res.json().catch(() => ({}))) as { error?: string }).error ?? offerUrl}`);
    return (await res.json()) as OfferDetails;
  }

  /** Derive the pairwise key for this issuer, prove possession, claim, verify and store. */
  async claimOffer(offer: OfferDetails): Promise<StoredCredential> {
    const keyring = this.requireKeyring();
    const pairwise = await keyring.holderAccount(offer.issuerDid);
    const proof = await signOfferProof({ holderKey: pairwise.privateKey, holderDid: pairwise.did, issuerDid: offer.issuerDid, nonce: offer.nonce });
    const res = await this.fetchFn(offer.claimUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proof }) });
    const body = (await res.json().catch(() => ({}))) as { sdJwt?: string; error?: string };
    if (!res.ok || !body.sdJwt) throw new Error(`claim failed (${res.status}): ${body.error ?? 'no sdJwt'}`);
    return this.acceptCredential(body.sdJwt, { issuerDid: offer.issuerDid, issuerName: offer.issuerName });
  }

  // ---- protocol: request -> presentation ------------------------------------------------------
  async fetchRequest(requestUrl: string): Promise<RequestDetails> {
    const res = await this.fetchFn(requestUrl);
    if (!res.ok) throw new Error(`request ${res.status}: ${((await res.json().catch(() => ({}))) as { error?: string }).error ?? requestUrl}`);
    return (await res.json()) as RequestDetails;
  }

  /** Build a presentation with exactly the consented claims and a KB-JWT for this request. */
  async buildPresentation(cred: StoredCredential, req: RequestDetails, consentedClaims: string[]): Promise<string> {
    const keyring = this.requireKeyring();
    const pairwise = await keyring.holderAccount(cred.issuerDid);
    if (pairwise.did !== cred.holderDid) throw new NotMyCredential('stored credential is not bound to our key for its issuer');
    return presentSdJwtVc({ holderKey: pairwise.privateKey, sdJwt: cred.sdJwt, disclose: consentedClaims, kb: { aud: req.aud, nonce: req.nonce } });
  }

  async submitPresentation(req: RequestDetails, vp: string): Promise<{ state: string; report: unknown }> {
    const res = await this.fetchFn(req.submitUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vp }) });
    const body = (await res.json().catch(() => ({}))) as { state?: string; report?: unknown; error?: string };
    if (!res.ok && !body.report) throw new Error(`submit failed (${res.status}): ${body.error ?? ''}`);
    return { state: body.state ?? body.error ?? 'unknown', report: body.report };
  }

  // ---- export / import ------------------------------------------------------------------------
  async exportFile(): Promise<VaultFile> {
    const meta = await this.store.getMeta();
    if (!meta) throw new VaultError('BAD_FORMAT', 'no vault to export');
    return exportVaultFile(meta, await this.store.list());
  }

  /** Replace the vault with a file's contents (still locked until unlock()). */
  async importFile(json: string): Promise<void> {
    const file = parseVaultFile(json);
    await this.store.clear();
    await this.store.putMeta(file.meta);
    for (const r of file.records) await this.store.put(r as VaultRecord);
    this.keyring = null;
    this.meta = file.meta;
    this.emit();
  }

  /** Wipe everything (demo reset). */
  async wipe(): Promise<void> {
    this.lock();
    await this.store.clear();
    this.meta = null;
    this.emit();
  }
}
