// In-memory credential offers: single-use, expire after nonceTtlSeconds.
import { b64u } from '@dcv/core/crypto/base64url';
import { randomBytes, randomUuid } from '@dcv/core/crypto/random';
import type { DegreeSubjectInput } from '@dcv/core/vc/types';

export interface Offer {
  id: string;
  type: string;
  subject: DegreeSubjectInput;
  nonce: string;
  createdAt: number;
  expiresAt: number;
  claimedAt?: number;
  credentialId?: string;
}

export class OfferStore {
  private readonly offers = new Map<string, Offer>();

  constructor(private readonly ttlSeconds: number, private readonly now: () => number = () => Math.floor(Date.now() / 1000)) {}

  create(type: string, subject: DegreeSubjectInput): Offer {
    const t = this.now();
    const offer: Offer = {
      id: randomUuid(),
      type,
      subject,
      nonce: b64u.encode(randomBytes(32)),
      createdAt: t,
      expiresAt: t + this.ttlSeconds,
    };
    this.offers.set(offer.id, offer);
    return offer;
  }

  get(id: string): Offer | undefined {
    return this.offers.get(id);
  }

  /** 'ok' | 'claimed' | 'expired' | 'unknown' */
  state(id: string): 'ok' | 'claimed' | 'expired' | 'unknown' {
    const o = this.offers.get(id);
    if (!o) return 'unknown';
    if (o.claimedAt !== undefined) return 'claimed';
    if (this.now() > o.expiresAt) return 'expired';
    return 'ok';
  }

  markClaimed(id: string, credentialId: string): void {
    const o = this.offers.get(id);
    if (!o) throw new Error(`unknown offer ${id}`);
    o.claimedAt = this.now();
    o.credentialId = credentialId;
  }

  clear(): void {
    this.offers.clear();
  }
}
