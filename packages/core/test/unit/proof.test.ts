import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { b64u } from '../../src/crypto/base64url.js';
import { addressToDid } from '../../src/did/ethr.js';
import { signOfferProof, verifyOfferProof } from '../../src/offer/proof.js';

const HOLDER_KEY = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6'; // Anvil #3
const OTHER_KEY = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a'; // Anvil #4
const holderDid = addressToDid(privateKeyToAccount(HOLDER_KEY).address);
const otherDid = addressToDid(privateKeyToAccount(OTHER_KEY).address);
const issuerDid = 'did:ethr:anvil:0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const NOW = 1_790_000_000;

describe('(8) issuance proof of possession', () => {
  it('accepts a proof with the right nonce and a kid matching the signer', async () => {
    const jws = await signOfferProof({ holderKey: HOLDER_KEY, holderDid, issuerDid, nonce: 'offer-1', now: NOW });
    const r = await verifyOfferProof(jws, { issuerDid, nonce: 'offer-1', now: NOW });
    expect(r).toEqual({ ok: true, holderDid, kid: `${holderDid}#controller` });
  });

  it('rejects a wrong nonce, wrong audience and a stale proof', async () => {
    const jws = await signOfferProof({ holderKey: HOLDER_KEY, holderDid, issuerDid, nonce: 'offer-1', now: NOW });
    expect(await verifyOfferProof(jws, { issuerDid, nonce: 'offer-2', now: NOW })).toEqual({ ok: false, error: 'NONCE' });
    expect(await verifyOfferProof(jws, { issuerDid: otherDid, nonce: 'offer-1', now: NOW })).toEqual({ ok: false, error: 'AUD' });
    expect(await verifyOfferProof(jws, { issuerDid, nonce: 'offer-1', now: NOW + 3600 })).toEqual({ ok: false, error: 'STALE' });
  });

  it('rejects a kid whose address differs from the recovered signer', async () => {
    // signed with HOLDER_KEY but claiming to be otherDid
    const jws = await signOfferProof({ holderKey: HOLDER_KEY, holderDid: otherDid, issuerDid, nonce: 'offer-1', now: NOW });
    expect(await verifyOfferProof(jws, { issuerDid, nonce: 'offer-1', now: NOW })).toEqual({ ok: false, error: 'SIGNATURE' });
  });

  it('rejects malformed input, wrong typ and a non-ethr kid', async () => {
    expect(await verifyOfferProof('garbage', { issuerDid, nonce: 'x', now: NOW })).toEqual({ ok: false, error: 'MALFORMED' });
    const jws = await signOfferProof({ holderKey: HOLDER_KEY, holderDid, issuerDid, nonce: 'offer-1', now: NOW });
    const [, p, s] = jws.split('.') as [string, string, string];
    const badTyp = `${b64u.encodeJson({ alg: 'ES256K-R', typ: 'JWT', kid: `${holderDid}#controller` })}.${p}.${s}`;
    expect(await verifyOfferProof(badTyp, { issuerDid, nonce: 'offer-1', now: NOW })).toEqual({ ok: false, error: 'BAD_TYP' });
    const badKid = `${b64u.encodeJson({ alg: 'ES256K-R', typ: 'openid4vci-proof+jwt', kid: 'did:key:z6Mk#0' })}.${p}.${s}`;
    expect(await verifyOfferProof(badKid, { issuerDid, nonce: 'offer-1', now: NOW })).toEqual({ ok: false, error: 'BAD_KID' });
  });
});
