// Library-based verification of a presentation: issuer signature, disclosure
// digests, KB-JWT (signature, nonce, audience, age) and iat/exp in one call.
// The verifier *pipeline* (verifier/pipeline.ts) evaluates every check
// independently so a report can show exactly which row failed; this wrapper is
// the cross-check used by tests and by the wallet before it stores a credential.
import type { Address } from 'viem';
import { didToAddress } from '../did/ethr.js';
import { verifierSdJwt, type SdJwtVcPayload } from './instance.js';
import { peekSdJwt } from './decode.js';

export interface VerifySdJwtVcOptions {
  /** Address the issuer signature must recover to (resolved from `iss` by the caller). */
  issuerAddress: Address;
  /** Address the KB-JWT must recover to (resolved from `cnf.kid` by the caller). Omit to skip KB checks. */
  holderAddress?: Address;
  nonce?: string;
  aud?: string;
  kbMaxAgeSeconds?: number;
  /** Seconds since epoch used for iat/exp/KB-age checks (defaults to wall clock). */
  now?: number;
}

export interface VerifiedSdJwtVc {
  payload: SdJwtVcPayload;
  header: Record<string, unknown> | undefined;
  kb?: { payload: Record<string, unknown>; header: Record<string, unknown> };
}

export async function verifySdJwtVc(compact: string, opts: VerifySdJwtVcOptions): Promise<VerifiedSdJwtVc> {
  const holder = opts.holderAddress ?? ('0x0000000000000000000000000000000000000000' as Address);
  const instance = verifierSdJwt(opts.issuerAddress, holder);
  const result = await instance.verify(compact, {
    ...(opts.nonce !== undefined ? { keyBindingNonce: opts.nonce } : {}),
    ...(opts.aud !== undefined ? { expectedKeyBindingAudience: opts.aud } : {}),
    ...(opts.kbMaxAgeSeconds !== undefined ? { keyBindingMaxAgeSeconds: opts.kbMaxAgeSeconds } : {}),
    ...(opts.now !== undefined ? { currentDate: opts.now } : {}),
    requiredClaimKeys: ['credentialSubject', 'iss', 'cnf'],
  });
  return {
    payload: result.payload,
    header: result.header,
    kb: result.kb ? { payload: result.kb.payload as Record<string, unknown>, header: result.kb.header } : undefined,
  };
}

/** Convenience for the wallet: verify an issued credential against its own `iss`. */
export async function verifyIssuedSdJwtVc(compact: string, opts: { now?: number } = {}): Promise<VerifiedSdJwtVc> {
  const peek = await peekSdJwt(compact);
  return verifySdJwtVc(compact, { issuerAddress: didToAddress(peek.iss), ...opts });
}
