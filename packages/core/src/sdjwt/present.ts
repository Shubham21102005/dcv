import type { PresentationFrame } from '@sd-jwt/core';
import type { Hex } from 'viem';
import { presentationFrameFor } from './frames.js';
import { holderSdJwt, type SdJwtVcPayload } from './instance.js';
import { nowSeconds } from './issue.js';

export interface PresentOptions {
  holderKey: Hex;
  sdJwt: string;
  /** Either a PresentationFrame or a list of dot-paths (see DISCLOSABLE_CLAIMS). */
  disclose: PresentationFrame<SdJwtVcPayload> | readonly string[];
  kb: { aud: string; nonce: string };
  /** KB-JWT iat in seconds (defaults to now). */
  now?: number;
}

/**
 * Build a presentation: keep only the requested disclosures and append a
 * Key-Binding JWT (iat, aud, nonce, sd_hash) signed with the holder's pairwise key.
 */
export async function presentSdJwtVc(opts: PresentOptions): Promise<string> {
  const frame = Array.isArray(opts.disclose)
    ? presentationFrameFor(opts.disclose as readonly string[])
    : (opts.disclose as PresentationFrame<SdJwtVcPayload>);
  return holderSdJwt(opts.holderKey).present(opts.sdJwt, frame, {
    kb: { payload: { iat: opts.now ?? nowSeconds(), aud: opts.kb.aud, nonce: opts.kb.nonce } },
  });
}
