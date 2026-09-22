// Compact JWS (RFC 7515) helpers over any Signer/Verifier pair.
import { b64u } from './base64url.js';
import type { Signer, Verifier } from './es256k.js';

export interface JwsHeader {
  alg: string;
  typ?: string;
  cty?: string;
  kid?: string;
  [k: string]: unknown;
}

export interface DecodedJws<P = Record<string, unknown>> {
  header: JwsHeader;
  payload: P;
  signingInput: string;
  signature: string;
  raw: string;
}

export async function signJws(header: JwsHeader, payload: unknown, signer: Signer): Promise<string> {
  const signingInput = `${b64u.encodeJson(header)}.${b64u.encodeJson(payload)}`;
  const signature = await signer(signingInput);
  return `${signingInput}.${signature}`;
}

/** Split and base64url-decode a compact JWS without verifying it. */
export function decodeJws<P = Record<string, unknown>>(jws: string): DecodedJws<P> {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('not a compact JWS (expected 3 segments)');
  const [h, p, s] = parts as [string, string, string];
  if (!s) throw new Error('JWS has an empty signature');
  const header = b64u.decodeJson<JwsHeader>(h);
  if (typeof header !== 'object' || header === null || typeof header.alg !== 'string') throw new Error('JWS header has no alg');
  return { header, payload: b64u.decodeJson<P>(p), signingInput: `${h}.${p}`, signature: s, raw: jws };
}

export async function verifyJws<P = Record<string, unknown>>(
  jws: string,
  verifier: Verifier,
): Promise<{ ok: boolean; decoded: DecodedJws<P> | null }> {
  let decoded: DecodedJws<P>;
  try {
    decoded = decodeJws<P>(jws);
  } catch {
    return { ok: false, decoded: null };
  }
  const ok = await verifier(decoded.signingInput, decoded.signature);
  return { ok, decoded };
}
