// Claim flow: verify the wallet's proof of possession, allocate a status index,
// build the VCDM 2.0 credential, secure it as vc+sd-jwt, record the ledger row.
import { bytesToHex, type Hex } from 'viem';
import { sha256Bytes } from '@dcv/core/crypto/hkdf';
import { verifyOfferProof } from '@dcv/core/offer/proof';
import { listSdDigests, peekSdJwt } from '@dcv/core/sdjwt/decode';
import { issueSdJwtVc } from '@dcv/core/sdjwt/issue';
import { buildDegreeCredential } from '@dcv/core/vc/build';
import { DEGREE_CREDENTIAL_TYPE } from '@dcv/core/vc/types';
import type { Ledger, LedgerRow } from './ledger.js';
import type { Offer } from './offers.js';
import type { StatusListPublisher } from './statusList.js';

export interface IssueDeps {
  ledger: Ledger;
  statusList: StatusListPublisher;
  issuerKey: Hex;
  issuerDid: string;
  issuerName: string;
  now?: () => number;
}

export type ClaimResult =
  | { ok: true; sdJwt: string; row: LedgerRow; holderDid: string }
  | { ok: false; status: 401 | 400; error: string };

export function hashDid(did: string): string {
  return bytesToHex(sha256Bytes(did));
}

export async function claimOffer(deps: IssueDeps, offer: Offer, proof: string): Promise<ClaimResult> {
  if (offer.type !== DEGREE_CREDENTIAL_TYPE) return { ok: false, status: 400, error: `unsupported credential type ${offer.type}` };
  const nowSec = deps.now ? deps.now() : undefined;
  const verified = await verifyOfferProof(proof, { issuerDid: deps.issuerDid, nonce: offer.nonce, now: nowSec });
  if (!verified.ok) return { ok: false, status: 401, error: `invalid proof: ${verified.error}` };

  const holderDid = verified.holderDid;
  const index = deps.statusList.allocateIndex();
  const credential = buildDegreeCredential({
    issuerDid: deps.issuerDid,
    issuerName: deps.issuerName,
    holderDid,
    subject: offer.subject,
    status: { listUrl: deps.statusList.listUrl(), index },
    now: nowSec !== undefined ? new Date(nowSec * 1000) : undefined,
  });
  const sdJwt = await issueSdJwtVc({ issuerKey: deps.issuerKey, issuerDid: deps.issuerDid, credential, holderDid, now: nowSec });
  const peek = await peekSdJwt(sdJwt);
  const row: LedgerRow = {
    id: credential.id,
    type: DEGREE_CREDENTIAL_TYPE,
    statusListIndex: index,
    revoked: false,
    holderDidHash: hashDid(holderDid),
    issuedAt: credential.validFrom,
    offerId: offer.id,
    subject: offer.subject,
    signedPreview: { header: peek.header, sdDigests: listSdDigests(peek.payload), statusListIndex: index },
  };
  deps.ledger.add(row);
  return { ok: true, sdJwt, row, holderDid };
}
