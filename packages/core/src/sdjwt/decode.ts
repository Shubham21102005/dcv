// Unverified inspection of an SD-JWT / presentation. Everything here is data
// the verifier pipeline (Step 13) still has to check; nothing is trusted yet.
// Tolerant by design: a corrupted disclosure is reported, not thrown, so the
// other checks can still be evaluated.
import { Disclosure, getClaims, splitSdJwt } from '@sd-jwt/core';
import { decodeJws } from '../crypto/jws.js';
import { kidToDid } from '../did/ethr.js';
import { hasher, type SdJwtVcPayload } from './instance.js';

export interface DecodedDisclosure {
  key?: string;
  value: unknown;
  digest: string;
  encoded: string;
}

export interface PeekedSdJwt {
  header: Record<string, unknown>;
  /** Raw signed payload (still contains `_sd` digest arrays). */
  payload: SdJwtVcPayload;
  disclosures: DecodedDisclosure[];
  /** Disclosure segments that could not be decoded at all (tampered). */
  invalidDisclosures: string[];
  kbJwt?: { header: Record<string, unknown>; payload: Record<string, unknown> };
  /** Payload with the presented (decodable) disclosures resolved back into place. */
  claims: Record<string, unknown>;
  iss: string;
  cnfKid: string;
  holderDid: string;
  /** The issuer-signed JWT alone (header.payload.signature). */
  issuerJwt: string;
  /** Digests present in the payload whose disclosure was NOT presented. */
  undisclosedDigests: string[];
}

/** Every `_sd` digest anywhere in a signed payload (depth-first). */
export function listSdDigests(payload: unknown): string[] {
  const out: string[] = [];
  collectDigests(payload, out);
  return out;
}

function collectDigests(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const v of node) collectDigests(v, out);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === '_sd' && Array.isArray(v)) out.push(...(v as string[]));
      else collectDigests(v, out);
    }
  }
}

const HASH = { hasher, alg: 'sha-256' };

export async function peekSdJwt(compact: string): Promise<PeekedSdJwt> {
  const { jwt: issuerJwt, disclosures: encodedDisclosures, kbJwt: encodedKb } = splitSdJwt(compact);
  const jwt = decodeJws<SdJwtVcPayload>(issuerJwt);
  const payload = jwt.payload;
  if (!payload || typeof payload !== 'object') throw new Error('SD-JWT payload is not an object');

  const valid: Disclosure[] = [];
  const invalidDisclosures: string[] = [];
  for (const enc of encodedDisclosures) {
    try {
      valid.push(await Disclosure.fromEncode(enc, HASH));
    } catch {
      invalidDisclosures.push(enc);
    }
  }
  const disclosures: DecodedDisclosure[] = await Promise.all(
    valid.map(async (d) => ({ key: d.key, value: d.value, digest: await d.digest(HASH), encoded: d.encode() })),
  );

  let kbJwt: PeekedSdJwt['kbJwt'];
  if (encodedKb) {
    const kb = decodeJws<Record<string, unknown>>(encodedKb);
    kbJwt = { header: kb.header, payload: kb.payload };
  }

  const claims = await getClaims<Record<string, unknown>>(payload as Record<string, unknown>, valid, hasher);
  const allDigests = listSdDigests(payload);
  const presented = new Set(disclosures.map((d) => d.digest));
  const cnfKid = typeof payload.cnf?.kid === 'string' ? payload.cnf.kid : '';
  return {
    header: jwt.header,
    payload,
    disclosures,
    invalidDisclosures,
    kbJwt,
    claims,
    iss: typeof payload.iss === 'string' ? payload.iss : '',
    cnfKid,
    holderDid: cnfKid ? kidToDid(cnfKid) : '',
    issuerJwt,
    undisclosedDigests: allDigests.filter((d) => !presented.has(d)),
  };
}
