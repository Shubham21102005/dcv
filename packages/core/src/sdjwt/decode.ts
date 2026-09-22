// Unverified inspection of an SD-JWT / presentation. Everything here is data
// the verifier pipeline (Step 13) still has to check; nothing is trusted yet.
import { decodeSdJwt, getClaims, splitSdJwt, type Disclosure } from '@sd-jwt/core';
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
  kbJwt?: { header: Record<string, unknown>; payload: Record<string, unknown> };
  /** Payload with the presented disclosures resolved back into place. */
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

export async function peekSdJwt(compact: string): Promise<PeekedSdJwt> {
  const { jwt: issuerJwt } = splitSdJwt(compact);
  const decoded = await decodeSdJwt(compact, hasher);
  const payload = decoded.jwt.payload as SdJwtVcPayload;
  const disclosures: DecodedDisclosure[] = await Promise.all(
    decoded.disclosures.map(async (d: Disclosure) => ({
      key: d.key,
      value: d.value,
      digest: await d.digest({ hasher, alg: 'sha-256' }),
      encoded: d.encode(),
    })),
  );
  const claims = await getClaims<Record<string, unknown>>(decoded.jwt.payload, decoded.disclosures, hasher);
  const allDigests = listSdDigests(payload);
  const presented = new Set(disclosures.map((d) => d.digest));
  const cnfKid = typeof payload.cnf?.kid === 'string' ? payload.cnf.kid : '';
  return {
    header: decoded.jwt.header,
    payload,
    disclosures,
    kbJwt: decoded.kbJwt ? { header: decoded.kbJwt.header, payload: decoded.kbJwt.payload } : undefined,
    claims,
    iss: typeof payload.iss === 'string' ? payload.iss : '',
    cnfKid,
    holderDid: cnfKid ? kidToDid(cnfKid) : '',
    issuerJwt,
    undisclosedDigests: allDigests.filter((d) => !presented.has(d)),
  };
}
