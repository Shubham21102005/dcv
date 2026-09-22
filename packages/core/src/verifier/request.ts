// Presentation requests (what a verifier publishes) and the single-use nonce store.
import { b64u } from '../crypto/base64url.js';
import { randomBytes, randomUuid } from '../crypto/random.js';

export interface PresentationRequest {
  id: string;
  /** base64url(32 random bytes) - must come back in the KB-JWT. */
  nonce: string;
  /** The verifier's origin - must come back as the KB-JWT `aud`. */
  aud: string;
  credentialType: string;
  /** Dot-paths the verifier wants disclosed (see DISCLOSABLE_CLAIMS). */
  claims: string[];
  createdAt: number;
  expiresAt: number;
}

export function createPresentationRequest(opts: {
  aud: string;
  credentialType: string;
  claims: string[];
  ttlSeconds: number;
  now?: number;
}): PresentationRequest {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  return {
    id: randomUuid(),
    nonce: b64u.encode(randomBytes(32)),
    aud: opts.aud,
    credentialType: opts.credentialType,
    claims: [...opts.claims],
    createdAt: now,
    expiresAt: now + opts.ttlSeconds,
  };
}

export type NonceState = 'ok' | 'replay' | 'mismatch' | 'unknown';

export interface NonceStore {
  issue(id: string, nonce: string, ttlSeconds: number): void;
  /** Check and burn: a second call for the same id returns 'replay'. */
  consume(id: string, nonce: string): NonceState;
  /** Read-only check used by dry runs (never burns). */
  peek(id: string, nonce: string): NonceState;
  clear(): void;
}

export class MemoryNonceStore implements NonceStore {
  private readonly entries = new Map<string, { nonce: string; expiresAt: number; consumed: boolean }>();
  private readonly now: () => number;

  constructor(now: () => number = () => Math.floor(Date.now() / 1000)) {
    this.now = now;
  }

  issue(id: string, nonce: string, ttlSeconds: number): void {
    this.entries.set(id, { nonce, expiresAt: this.now() + ttlSeconds, consumed: false });
  }

  private check(id: string, nonce: string): { state: NonceState; entry?: { nonce: string; expiresAt: number; consumed: boolean } } {
    const entry = this.entries.get(id);
    if (!entry) return { state: 'unknown' };
    if (entry.nonce !== nonce) return { state: 'mismatch', entry };
    if (entry.consumed) return { state: 'replay', entry };
    return { state: 'ok', entry };
  }

  consume(id: string, nonce: string): NonceState {
    const { state, entry } = this.check(id, nonce);
    if (state === 'ok' && entry) entry.consumed = true;
    return state;
  }

  peek(id: string, nonce: string): NonceState {
    return this.check(id, nonce).state;
  }

  clear(): void {
    this.entries.clear();
  }
}
