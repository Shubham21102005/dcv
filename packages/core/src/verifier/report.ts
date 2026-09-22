// The verifier's report card: eight independent checks, plain-English labels,
// structured error codes and evidence for the UI's expanders.
export type CheckName =
  | 'format'
  | 'issuerSignature'
  | 'issuerTrusted'
  | 'disclosures'
  | 'holderBinding'
  | 'freshness'
  | 'validity'
  | 'status';

export const CHECK_ORDER: CheckName[] = [
  'format',
  'issuerSignature',
  'issuerTrusted',
  'disclosures',
  'holderBinding',
  'freshness',
  'validity',
  'status',
];

export const CHECK_LABELS: Record<CheckName, string> = {
  format: 'Well-formed W3C credential secured as vc+sd-jwt',
  issuerSignature: "Signed by the issuer's DID key (resolved from the chain)",
  issuerTrusted: 'Issuer trusted for this credential type (on-chain registry)',
  disclosures: 'Disclosed claims match the signed digests',
  holderBinding: "Presented by the credential's holder (key, nonce, audience)",
  freshness: 'Fresh: key-binding recent, request not expired',
  validity: 'Within the credential validity period',
  status: 'Not revoked (status list hash-anchored on chain)',
};

export type CheckCode =
  | 'NOT_EVALUATED'
  | 'FORMAT_INVALID'
  | 'TYPE_MISMATCH'
  | 'DID_UNRESOLVABLE'
  | 'ISSUER_SIG_INVALID'
  | 'ISSUER_UNTRUSTED'
  | 'DISCLOSURE_DIGEST_MISMATCH'
  | 'SD_HASH_MISMATCH'
  | 'KB_MISSING'
  | 'KB_SIG_INVALID'
  | 'HOLDER_MISMATCH'
  | 'NONCE_MISMATCH'
  | 'NONCE_REPLAY'
  | 'NONCE_UNKNOWN'
  | 'AUD_MISMATCH'
  | 'KB_STALE'
  | 'REQUEST_EXPIRED'
  | 'NOT_YET_VALID'
  | 'EXPIRED'
  | 'NO_STATUS'
  | 'STATUS_UNAVAILABLE'
  | 'STATUS_HASH_MISMATCH'
  | 'STATUS_SIG_INVALID'
  | 'STATUS_LIST_MISMATCH'
  | 'REVOKED';

export interface Check {
  name: CheckName;
  label: string;
  ok: boolean;
  code?: CheckCode;
  detail: string;
  evidence?: Record<string, unknown>;
}

export interface VerificationReport {
  ok: boolean;
  checks: Check[];
  /** The claims the holder chose to disclose (resolved), plus the non-SD fields. */
  disclosed: Record<string, unknown>;
  /** Digests still hidden - what the verifier did NOT learn. */
  digestsUndisclosed: string[];
  /** Every non-RPC URL fetched during verification. */
  outboundUrls: string[];
  chainReads: number;
  issuerContacted: boolean;
  issuerDid?: string;
  holderDid?: string;
  credentialType?: string;
  verifiedAt: number;
  dryRun: boolean;
}

export function makeCheck(name: CheckName, ok: boolean, detail: string, code?: CheckCode, evidence?: Record<string, unknown>): Check {
  return { name, label: CHECK_LABELS[name], ok, ...(code ? { code } : {}), detail, ...(evidence ? { evidence } : {}) };
}
