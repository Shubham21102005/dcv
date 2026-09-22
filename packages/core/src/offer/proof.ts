// Issuance proof of possession (OpenID4VCI-style `openid4vci-proof+jwt`):
// the wallet proves it controls the pairwise DID the credential will be bound to
// by signing the offer nonce with that key.
import type { Hex } from 'viem';
import { ES256K_R, createEs256kSigner, recoverEs256kAddress } from '../crypto/es256k.js';
import { decodeJws, signJws } from '../crypto/jws.js';
import { controllerKeyId, didToAddress, kidToDid } from '../did/ethr.js';
import { nowSeconds } from '../sdjwt/issue.js';

export const OFFER_PROOF_TYP = 'openid4vci-proof+jwt';

export interface OfferProofPayload {
  aud: string;
  nonce: string;
  iat: number;
}

export async function signOfferProof(opts: {
  holderKey: Hex;
  holderDid: string;
  issuerDid: string;
  nonce: string;
  now?: number;
}): Promise<string> {
  const header = { alg: ES256K_R, typ: OFFER_PROOF_TYP, kid: controllerKeyId(opts.holderDid) };
  const payload: OfferProofPayload = { aud: opts.issuerDid, nonce: opts.nonce, iat: opts.now ?? nowSeconds() };
  return signJws(header, payload, createEs256kSigner(opts.holderKey));
}

export type OfferProofResult =
  | { ok: true; holderDid: string; kid: string }
  | { ok: false; error: 'MALFORMED' | 'BAD_TYP' | 'BAD_KID' | 'SIGNATURE' | 'AUD' | 'NONCE' | 'STALE' };

export async function verifyOfferProof(
  jws: string,
  expected: { issuerDid: string; nonce: string; now?: number; maxAgeSeconds?: number },
): Promise<OfferProofResult> {
  let decoded;
  try {
    decoded = decodeJws<OfferProofPayload>(jws);
  } catch {
    return { ok: false, error: 'MALFORMED' };
  }
  if (decoded.header.typ !== OFFER_PROOF_TYP || decoded.header.alg !== ES256K_R) return { ok: false, error: 'BAD_TYP' };
  const kid = typeof decoded.header.kid === 'string' ? decoded.header.kid : '';
  let holderDid: string;
  let holderAddress: string;
  try {
    holderDid = kidToDid(kid);
    holderAddress = didToAddress(holderDid);
  } catch {
    return { ok: false, error: 'BAD_KID' };
  }
  const recovered = await recoverEs256kAddress(decoded.signingInput, decoded.signature);
  if (!recovered || recovered.toLowerCase() !== holderAddress.toLowerCase()) return { ok: false, error: 'SIGNATURE' };
  if (decoded.payload.aud !== expected.issuerDid) return { ok: false, error: 'AUD' };
  if (decoded.payload.nonce !== expected.nonce) return { ok: false, error: 'NONCE' };
  const now = expected.now ?? nowSeconds();
  const maxAge = expected.maxAgeSeconds ?? 300;
  if (typeof decoded.payload.iat !== 'number' || Math.abs(now - decoded.payload.iat) > maxAge) return { ok: false, error: 'STALE' };
  return { ok: true, holderDid, kid };
}
