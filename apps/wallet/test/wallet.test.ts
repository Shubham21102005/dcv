import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bytesToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { DEFAULTS } from '@dcv/core/config';
import { sha256Bytes } from '@dcv/core/crypto/hkdf';
import { addressToDid } from '@dcv/core/did/ethr';
import { verifyOfferProof } from '@dcv/core/offer/proof';
import { peekSdJwt } from '@dcv/core/sdjwt/decode';
import { issueSdJwtVc } from '@dcv/core/sdjwt/issue';
import { verifySdJwtVc } from '@dcv/core/sdjwt/verify';
import { SAMPLE_DEGREE_SUBJECT, buildDegreeCredential } from '@dcv/core/vc/build';
import { VaultStore } from '@dcv/core/vault/store';
import { startIdleLock } from '../src/state/idleLock';
import { NotMyCredential, Wallet, type OfferDetails, type RequestDetails } from '../src/state/wallet';

const ISSUER_KEY = DEFAULTS.ISSUER_PRIVATE_KEY;
const issuerAddress = privateKeyToAccount(ISSUER_KEY).address;
const issuerDid = addressToDid(issuerAddress);
const FAST = { t: 1, m: 8192 };
let dbSeq = 0;

function makeWallet(fetchImpl?: typeof fetch, trusted = true) {
  return new Wallet({
    store: new VaultStore(`dcv-wallet-test-${++dbSeq}`),
    keyringOptions: { kdf: FAST },
    fetch: fetchImpl,
    isTrustedFor: async () => trusted,
  });
}

/** A fake issuer: answers the claim POST by issuing to whatever DID signed the proof. */
function fakeIssuer(nonce: string) {
  const ledger: Array<{ holderDidHash: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/claim')) {
      const { proof } = JSON.parse(String(init?.body)) as { proof: string };
      const r = await verifyOfferProof(proof, { issuerDid, nonce });
      if (!r.ok) return new Response(JSON.stringify({ error: r.error }), { status: 401 });
      const credential = buildDegreeCredential({ issuerDid, issuerName: 'Anvil State University', holderDid: r.holderDid, subject: SAMPLE_DEGREE_SUBJECT, status: { listUrl: 'http://localhost:4001/status/1', index: 42 } });
      const sdJwt = await issueSdJwtVc({ issuerKey: ISSUER_KEY, issuerDid, credential, holderDid: r.holderDid });
      ledger.push({ holderDidHash: bytesToHex(sha256Bytes(r.holderDid)) });
      return new Response(JSON.stringify({ sdJwt, credentialId: credential.id }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500 });
  };
  const offer: OfferDetails = { id: 'o1', issuerDid, issuerName: 'Anvil State University', type: 'UniversityDegreeCredential', nonce, expiresAt: 0, subjectPreview: { name: 'Alice Example', degree: 'BSc' }, claimUrl: 'http://localhost:4001/offers/o1/claim' };
  return { fetchImpl, offer, ledger };
}

describe('Wallet state (happy-dom + fake-indexeddb)', () => {
  it('onboard -> lock -> unlock restores the default DID; wrong passphrase stays locked', async () => {
    const w = makeWallet();
    await w.init();
    expect(w.status).toBe('none');
    const { mnemonic, did } = await w.create('correct horse battery');
    expect(mnemonic.split(' ')).toHaveLength(12);
    expect(w.status).toBe('unlocked');
    expect(w.defaultDid).toBe(did);
    w.lock();
    expect(w.status).toBe('locked');
    await expect(w.unlock('wrong passphrase')).rejects.toMatchObject({ code: 'BAD_PASSPHRASE' });
    expect(w.status).toBe('locked');
    await w.unlock('correct horse battery');
    expect(w.status).toBe('unlocked');
    expect((await w.holderAccount('default')).did).toBe(did);
    // a fresh Wallet over the same store finds the vault (persisted meta)
    const again = new Wallet({ store: w.store, keyringOptions: { kdf: FAST } });
    await again.init();
    expect(again.status).toBe('locked');
    expect(again.defaultDid).toBe(did);
  });

  it('claims an offer with a pairwise DID and stores the credential; issuer sees only that DID', async () => {
    const { fetchImpl, offer, ledger } = fakeIssuer('nonce-1');
    const w = makeWallet(fetchImpl);
    await w.init();
    await w.create('passphrase-1');
    const cred = await w.claimOffer(offer);
    const pairwise = await w.holderAccount(issuerDid);
    const defaultAcct = await w.holderAccount('default');
    expect(cred.holderDid).toBe(pairwise.did);
    expect(cred.issuerDid).toBe(issuerDid);
    expect(cred.issuerName).toBe('Anvil State University');
    expect(cred.type).toEqual(['VerifiableCredential', 'UniversityDegreeCredential']);
    expect(cred.credentialStatus).toMatchObject({ statusListIndex: '42', statusPurpose: 'revocation' });
    // pairwise assertion: the issuer's ledger hash matches the pairwise DID, not the default one
    expect(ledger[0]?.holderDidHash).toBe(bytesToHex(sha256Bytes(pairwise.did)));
    expect(ledger[0]?.holderDidHash).not.toBe(bytesToHex(sha256Bytes(defaultAcct.did)));
    // stored encrypted, listed decrypted
    const list = await w.listCredentials();
    expect(list).toHaveLength(1);
    expect(list[0]?.sdJwt).toBe(cred.sdJwt);
    const raw = JSON.stringify(await w.store.dumpRaw());
    expect(raw.includes('Alice')).toBe(false);
    expect(raw.includes(cred.sdJwt.slice(0, 40))).toBe(false);
  });

  it('rejects a credential bound to someone else (NotMyCredential) and an untrusted issuer', async () => {
    const w = makeWallet(undefined, true);
    await w.init();
    await w.create('passphrase-2');
    const other = addressToDid(privateKeyToAccount('0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a').address);
    const credential = buildDegreeCredential({ issuerDid, issuerName: 'X', holderDid: other, subject: SAMPLE_DEGREE_SUBJECT, status: { listUrl: 'http://localhost:4001/status/1', index: 1 } });
    const sdJwt = await issueSdJwtVc({ issuerKey: ISSUER_KEY, issuerDid, credential, holderDid: other });
    await expect(w.acceptCredential(sdJwt, { issuerDid })).rejects.toBeInstanceOf(NotMyCredential);

    const untrusted = makeWallet(undefined, false);
    await untrusted.init();
    await untrusted.create('passphrase-3');
    const mine = await untrusted.holderAccount(issuerDid);
    const cred2 = buildDegreeCredential({ issuerDid, issuerName: 'X', holderDid: mine.did, subject: SAMPLE_DEGREE_SUBJECT, status: { listUrl: 'http://localhost:4001/status/1', index: 2 } });
    const sdJwt2 = await issueSdJwtVc({ issuerKey: ISSUER_KEY, issuerDid, credential: cred2, holderDid: mine.did });
    await expect(untrusted.acceptCredential(sdJwt2, { issuerDid })).rejects.toThrow(/not trusted/);
    expect(await untrusted.listCredentials()).toHaveLength(0);
  });

  it('builds a presentation with only the consented claims and a KB-JWT for the request', async () => {
    const { fetchImpl, offer } = fakeIssuer('nonce-2');
    const w = makeWallet(fetchImpl);
    await w.init();
    await w.create('passphrase-4');
    const cred = await w.claimOffer(offer);
    const req: RequestDetails = { id: 'r1', nonce: 'n-abc', aud: 'http://localhost:4002', credentialType: 'UniversityDegreeCredential', claims: ['credentialSubject.degree.name'], expiresAt: 0, verifierName: 'Acme', submitUrl: 'http://localhost:4002/requests/r1/presentation', state: 'pending' };
    const vp = await w.buildPresentation(cred, req, req.claims);
    const peek = await peekSdJwt(vp);
    expect(peek.disclosures.map((d) => d.key)).toEqual(['name']);
    expect(peek.kbJwt?.payload).toMatchObject({ nonce: 'n-abc', aud: 'http://localhost:4002' });
    const holderAddress = privateKeyToAccount((await w.holderAccount(issuerDid)).privateKey).address;
    await expect(verifySdJwtVc(vp, { issuerAddress, holderAddress, nonce: 'n-abc', aud: 'http://localhost:4002' })).resolves.toBeTruthy();
  });

  it('export -> wipe -> import -> unlock brings the credentials back', async () => {
    const { fetchImpl, offer } = fakeIssuer('nonce-3');
    const w = makeWallet(fetchImpl);
    await w.init();
    await w.create('passphrase-5');
    await w.claimOffer(offer);
    const file = JSON.stringify(await w.exportFile());
    await w.wipe();
    expect(w.status).toBe('none');
    await w.importFile(file);
    expect(w.status).toBe('locked');
    await w.unlock('passphrase-5');
    expect(await w.listCredentials()).toHaveLength(1);
  });

  it('restoreFromMnemonic re-derives the same pairwise DIDs', async () => {
    const w = makeWallet();
    await w.init();
    const { mnemonic } = await w.create('passphrase-6');
    const before = await w.holderAccount(issuerDid);
    const w2 = makeWallet();
    await w2.init();
    await w2.restoreFromMnemonic(mnemonic, 'another passphrase');
    expect((await w2.holderAccount(issuerDid)).did).toBe(before.did);
  });
});

describe('idle auto-lock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('locks after N seconds of inactivity, not when the user is active', () => {
    const onIdle = vi.fn();
    const handle = startIdleLock({ seconds: 1, onIdle });
    vi.advanceTimersByTime(500);
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(700);
    expect(onIdle).not.toHaveBeenCalled(); // reset at 0.5 s -> fires at 1.5 s
    vi.advanceTimersByTime(400);
    expect(onIdle).toHaveBeenCalledTimes(1);
    handle.stop();
    vi.advanceTimersByTime(5000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});

describe('IPFS backup + VaultPointer restore (memory blob store, fake chain)', () => {
  it('backup writes ciphertext only; restore from the mnemonic alone brings the credential back', async () => {
    const { MemoryBlobStore } = await import('@dcv/core/ipfs/blobStore');
    const { backupToIpfs, restoreFromIpfs } = await import('../src/state/backup');
    const { PlaintextRejected } = await import('@dcv/core/privacy/opaque');
    const blobStore = new MemoryBlobStore();
    const pointers = new Map<string, `0x${string}`>();
    const chain = {
      async setPointer(account: { address: string }, locator: `0x${string}`) {
        pointers.set(account.address, locator);
        return { txHash: '0xfake' };
      },
      async getPointer(owner: string) {
        return { encryptedLocator: pointers.get(owner) ?? ('0x' as const), updatedAt: 0 };
      },
    };

    const { fetchImpl, offer } = fakeIssuer('nonce-backup');
    const w = makeWallet(fetchImpl);
    await w.init();
    const { mnemonic } = await w.create('passphrase-7');
    const cred = await w.claimOffer(offer);
    const r = await backupToIpfs(w, { blobStore, chain });
    expect(r.records).toBe(1);
    expect(r.cid.startsWith('bafkrei')).toBe(true);
    // the blob on "IPFS" is opaque and the pointer is ciphertext
    const blob = await blobStore.cat(r.cid);
    expect(() => { throw new PlaintextRejected('x'); }).toThrow(); // sanity: class importable
    const blobText = new TextDecoder('utf-8', { fatal: false }).decode(blob);
    expect(blobText.includes('credentialSubject')).toBe(false);
    expect(blobText.includes(cred.holderDid)).toBe(false);
    expect(pointers.get(r.pointerAddress)!.includes('bafkrei')).toBe(false);

    // wiped device: only the 12 words
    const fresh = makeWallet();
    await fresh.init();
    await fresh.restoreFromMnemonic(mnemonic, 'brand new passphrase');
    expect(await fresh.listCredentials()).toHaveLength(0);
    const restored = await restoreFromIpfs(fresh, { blobStore, chain });
    expect(restored.records).toBe(1);
    const list = await fresh.listCredentials();
    expect(list).toHaveLength(1);
    expect(list[0]?.sdJwt).toBe(cred.sdJwt);
    // and the restored keys still match the credential binding
    expect((await fresh.holderAccount(cred.issuerDid)).did).toBe(cred.holderDid);

    // a wallet with a different seed cannot read the pointer or the blob
    const stranger = makeWallet();
    await stranger.init();
    await stranger.create('passphrase-8');
    await expect(restoreFromIpfs(stranger, { blobStore, chain })).rejects.toThrow(/no backup pointer/);
  });
});
