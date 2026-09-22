// The 8-check verification pipeline. Every check is evaluated independently
// (never short-circuits) so the report shows exactly which property failed.
import { keccak256, stringToBytes, type Address, type PublicClient } from 'viem';
import type { Resolver } from 'did-resolver';
import type { Deployments } from '../chain/deployments.js';
import { getIssuer, isTrustedFor } from '../chain/trustRegistry.js';
import { b64u } from '../crypto/base64url.js';
import { ES256K_R, createAddressVerifier, recoverEs256kAddress } from '../crypto/es256k.js';
import { sha256Bytes } from '../crypto/hkdf.js';
import { decodeJws, verifyJws } from '../crypto/jws.js';
import { isEthrDid } from '../did/ethr.js';
import { resolveControllerAddress } from '../did/resolver.js';
import { listSdDigests, peekSdJwt, type PeekedSdJwt } from '../sdjwt/decode.js';
import { KB_JWT_TYP, VC_SD_JWT_TYP } from '../sdjwt/instance.js';
import { decodeStatusListCredential, readStatusBit, verifyStatusListSignature } from '../status/credential.js';
import { CredentialV2Schema, listIdFromStatusUrl } from '../vc/schema.js';
import { issuerIdOf } from '../vc/types.js';
import { withFetchRecorder } from './fetchRecorder.js';
import { CHECK_ORDER, makeCheck, type Check, type CheckName, type VerificationReport } from './report.js';
import type { NonceStore, PresentationRequest } from './request.js';
import type { StatusListFetcher } from './statusFetch.js';

export interface PipelineDeps {
  publicClient: PublicClient;
  resolver: Resolver;
  deployments: Deployments;
  nonces: NonceStore;
  fetchStatusList: StatusListFetcher;
  /** Origins used by the fetch recorder. */
  rpcUrl: string;
  issuerPublicUrl: string;
  kbMaxAgeSeconds?: number;
  /** Seconds since epoch (tests override). */
  now?: number;
  /**
   * Dry run: evaluate the nonce read-only (peek) and treat the request's own
   * nonce as still valid even if a real run already consumed it.
   */
  dryRun?: boolean;
  /** With dryRun: make holderBinding report NONCE_REPLAY (the attack lab's Replay button). */
  simulateConsumedNonce?: boolean;
}

const nowSec = () => Math.floor(Date.now() / 1000);

export async function verifyPresentation(vp: string, req: PresentationRequest, deps: PipelineDeps): Promise<VerificationReport> {
  const { result, record } = await withFetchRecorder({ rpcUrl: deps.rpcUrl, issuerPublicUrl: deps.issuerPublicUrl }, () => runChecks(vp, req, deps));
  return { ...result, outboundUrls: record.outboundUrls, chainReads: record.chainReads, issuerContacted: record.issuerContacted };
}

type Partial8 = Omit<VerificationReport, 'outboundUrls' | 'chainReads' | 'issuerContacted'>;

async function runChecks(vp: string, req: PresentationRequest, deps: PipelineDeps): Promise<Partial8> {
  const now = deps.now ?? nowSec();
  const kbMaxAge = deps.kbMaxAgeSeconds ?? 300;
  const dryRun = deps.dryRun === true;
  const checks = new Map<CheckName, Check>();
  const set = (c: Check) => checks.set(c.name, c);

  // ---- decode (no trust yet) -----------------------------------------------------
  let peek: PeekedSdJwt | null = null;
  let decodeError = '';
  try {
    peek = await peekSdJwt(vp);
  } catch (err) {
    decodeError = (err as Error).message;
  }

  const notEvaluated = (name: CheckName, why: string) => set(makeCheck(name, false, `not evaluated: ${why}`, 'NOT_EVALUATED'));

  // ---- 1. format ------------------------------------------------------------------
  const credentialType = req.credentialType;
  let issuerDid = '';
  let holderDid = '';
  if (!peek) {
    set(makeCheck('format', false, `could not decode presentation: ${decodeError}`, 'FORMAT_INVALID'));
  } else {
    const problems: string[] = [];
    if (peek.header['typ'] !== VC_SD_JWT_TYP) problems.push(`typ is ${String(peek.header['typ'])}, expected ${VC_SD_JWT_TYP}`);
    if (peek.header['cty'] !== 'vc') problems.push(`cty is ${String(peek.header['cty'])}, expected vc`);
    if (peek.header['alg'] !== ES256K_R) problems.push(`alg is ${String(peek.header['alg'])}, expected ${ES256K_R}`);
    const parsed = CredentialV2Schema.safeParse(peek.claims);
    if (!parsed.success) problems.push(`not a VCDM 2.0 credential: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    const types = Array.isArray(peek.payload.type) ? peek.payload.type : [];
    const typeOk = types.includes(credentialType);
    if (!typeOk) problems.push(`credential type ${JSON.stringify(types)} does not include ${credentialType}`);
    issuerDid = peek.iss || (parsed.success ? issuerIdOf(peek.claims as { issuer: string | { id: string } }) : '');
    holderDid = peek.holderDid;
    if (!isEthrDid(issuerDid)) problems.push(`iss is not a did:ethr:anvil DID: ${issuerDid}`);
    set(
      problems.length
        ? makeCheck('format', false, problems.join('; '), typeOk ? 'FORMAT_INVALID' : 'TYPE_MISMATCH', { types })
        : makeCheck('format', true, `vc+sd-jwt carrying ${types.join(' and ')}; ${peek.disclosures.length} disclosure${peek.disclosures.length === 1 ? '' : 's'} presented`, undefined, { types, typ: peek.header['typ'], alg: peek.header['alg'] }),
    );
  }

  // ---- resolve DIDs from the chain (shared by 2, 5, 8) ---------------------------------
  let issuerAddress: Address | null = null;
  let issuerResolveError = '';
  if (issuerDid && isEthrDid(issuerDid)) {
    try {
      issuerAddress = await resolveControllerAddress(deps.resolver, issuerDid);
    } catch (err) {
      issuerResolveError = (err as Error).message;
    }
  }
  let holderAddress: Address | null = null;
  let holderResolveError = '';
  if (holderDid && isEthrDid(holderDid)) {
    try {
      holderAddress = await resolveControllerAddress(deps.resolver, holderDid);
    } catch (err) {
      holderResolveError = (err as Error).message;
    }
  }

  // ---- 2. issuer signature ------------------------------------------------------------
  if (!peek) notEvaluated('issuerSignature', 'undecodable');
  else if (!issuerAddress) set(makeCheck('issuerSignature', false, `could not resolve ${issuerDid || '(no iss)'}: ${issuerResolveError}`, 'DID_UNRESOLVABLE'));
  else {
    const { ok } = await verifyJws(peek.issuerJwt, createAddressVerifier(issuerAddress));
    set(
      ok
        ? makeCheck('issuerSignature', true, `ES256K-R signature recovers to ${issuerAddress} (controller of ${issuerDid})`, undefined, { issuerDid, issuerAddress, kid: peek.header['kid'] })
        : makeCheck('issuerSignature', false, `signature does not recover to ${issuerAddress}`, 'ISSUER_SIG_INVALID', { issuerDid, issuerAddress }),
    );
  }

  // ---- 3. issuer trusted ----------------------------------------------------------------
  if (!issuerAddress) notEvaluated('issuerTrusted', 'issuer DID unresolved');
  else {
    const trusted = await isTrustedFor(deps.publicClient, deps.deployments, issuerAddress, credentialType);
    const info = await getIssuer(deps.publicClient, deps.deployments, issuerAddress);
    set(
      trusted
        ? makeCheck('issuerTrusted', true, `${info.name || issuerAddress} is active and allowed to issue ${credentialType}`, undefined, { registry: deps.deployments.trustRegistry, issuerName: info.name, active: info.active })
        : makeCheck('issuerTrusted', false, `${info.name || issuerAddress} is ${info.active ? 'not allowed to issue ' + credentialType : 'not an active issuer'}`, 'ISSUER_UNTRUSTED', { registry: deps.deployments.trustRegistry, issuerName: info.name, active: info.active }),
    );
  }

  // ---- 4. disclosures ---------------------------------------------------------------------
  if (!peek) notEvaluated('disclosures', 'undecodable');
  else {
    const signed = new Set([...peek.undisclosedDigests, ...peek.disclosures.map((d) => d.digest)]);
    const payloadDigests = new Set(listSdDigests(peek.payload));
    const bad = peek.disclosures.filter((d) => !payloadDigests.has(d.digest));
    const corrupt = peek.invalidDisclosures.length;
    let sdHashOk = true;
    let sdHashDetail = '';
    if (peek.kbJwt) {
      const presentationPart = vp.slice(0, vp.lastIndexOf('~') + 1);
      const expected = b64u.encode(sha256Bytes(presentationPart));
      sdHashOk = peek.kbJwt.payload['sd_hash'] === expected;
      sdHashDetail = sdHashOk ? 'sd_hash binds the KB-JWT to exactly these disclosures' : 'KB-JWT sd_hash does not match the presented disclosures';
    }
    if (bad.length || corrupt) {
      set(makeCheck('disclosures', false, `${bad.length + corrupt} disclosure(s) do not match any signed digest (tampered or foreign)`, 'DISCLOSURE_DIGEST_MISMATCH', { badKeys: bad.map((d) => d.key), corrupt, signedDigests: signed.size }));
    } else if (!sdHashOk) {
      set(makeCheck('disclosures', false, sdHashDetail, 'SD_HASH_MISMATCH'));
    } else {
      set(makeCheck('disclosures', true, `${peek.disclosures.length} of ${signed.size} signed digests disclosed; ${sdHashDetail || 'no KB-JWT to bind'}`, undefined, { disclosedKeys: peek.disclosures.map((d) => d.key), undisclosed: peek.undisclosedDigests.length }));
    }
  }

  // ---- 5. holder binding --------------------------------------------------------------------
  if (!peek) notEvaluated('holderBinding', 'undecodable');
  else if (!peek.kbJwt) set(makeCheck('holderBinding', false, 'presentation carries no Key-Binding JWT', 'KB_MISSING'));
  else {
    const kb = peek.kbJwt.payload;
    const problems: Array<{ code: Check['code']; detail: string }> = [];
    const kbSegments = vp.slice(vp.lastIndexOf('~') + 1);
    let recovered: Address | null = null;
    try {
      const decoded = decodeJws(kbSegments);
      if (decoded.header.typ !== KB_JWT_TYP) problems.push({ code: 'KB_SIG_INVALID', detail: `KB-JWT typ is ${String(decoded.header.typ)}` });
      recovered = await recoverEs256kAddress(decoded.signingInput, decoded.signature);
    } catch {
      problems.push({ code: 'KB_SIG_INVALID', detail: 'KB-JWT is malformed' });
    }
    if (!holderAddress) problems.push({ code: 'KB_SIG_INVALID', detail: `holder DID ${holderDid || '(missing cnf.kid)'} unresolvable: ${holderResolveError}` });
    else if (!recovered || recovered.toLowerCase() !== holderAddress.toLowerCase()) problems.push({ code: 'KB_SIG_INVALID', detail: `KB-JWT signature recovers to ${recovered ?? 'nothing'}, expected ${holderAddress} (controller of ${holderDid})` });
    const subjectId = (peek.payload.credentialSubject as { id?: string } | undefined)?.id;
    if (subjectId !== holderDid) problems.push({ code: 'HOLDER_MISMATCH', detail: `credentialSubject.id ${subjectId} is not the bound holder ${holderDid}` });
    if (kb['nonce'] !== req.nonce) problems.push({ code: 'NONCE_MISMATCH', detail: 'KB-JWT nonce is not the nonce of this request' });
    else {
      const state = dryRun ? deps.nonces.peek(req.id, req.nonce) : deps.nonces.consume(req.id, req.nonce);
      if (dryRun && deps.simulateConsumedNonce) problems.push({ code: 'NONCE_REPLAY', detail: 'this nonce was already used (replayed presentation)' });
      else if (state === 'replay' && !dryRun) problems.push({ code: 'NONCE_REPLAY', detail: 'this nonce was already used (replayed presentation)' });
      else if (state === 'unknown') problems.push({ code: 'NONCE_UNKNOWN', detail: 'request nonce unknown to this verifier' });
      else if (state === 'mismatch') problems.push({ code: 'NONCE_MISMATCH', detail: 'nonce does not belong to this request' });
    }
    if (kb['aud'] !== req.aud) problems.push({ code: 'AUD_MISMATCH', detail: `KB-JWT audience ${String(kb['aud'])} is not this verifier (${req.aud})` });
    const first = problems[0];
    set(
      first
        ? makeCheck('holderBinding', false, problems.map((p) => p.detail).join('; '), first.code, { holderDid, holderAddress, codes: problems.map((p) => p.code) })
        : makeCheck('holderBinding', true, `KB-JWT signed by ${holderAddress} (controller of ${holderDid}); nonce and audience match`, undefined, { holderDid, holderAddress, nonce: req.nonce, aud: req.aud, dryRun }),
    );
  }

  // ---- 6. freshness ---------------------------------------------------------------------------
  if (!peek || !peek.kbJwt) notEvaluated('freshness', 'no KB-JWT');
  else {
    const iat = peek.kbJwt.payload['iat'];
    const problems: Array<{ code: Check['code']; detail: string }> = [];
    if (typeof iat !== 'number' || Math.abs(now - iat) > kbMaxAge) problems.push({ code: 'KB_STALE', detail: `KB-JWT issued ${typeof iat === 'number' ? now - iat : '?'} s ago (max ${kbMaxAge} s)` });
    if (now > req.expiresAt) problems.push({ code: 'REQUEST_EXPIRED', detail: `request expired ${now - req.expiresAt} s ago` });
    const first = problems[0];
    set(
      first
        ? makeCheck('freshness', false, problems.map((p) => p.detail).join('; '), first.code, { iat, now, maxAge: kbMaxAge, requestExpiresAt: req.expiresAt })
        : makeCheck('freshness', true, `KB-JWT is ${typeof iat === 'number' ? now - iat : 0} s old (max ${kbMaxAge} s); request valid for ${req.expiresAt - now} s more`, undefined, { iat, now, maxAge: kbMaxAge }),
    );
  }

  // ---- 7. validity ------------------------------------------------------------------------
  if (!peek) notEvaluated('validity', 'undecodable');
  else {
    const from = Date.parse(peek.payload.validFrom ?? '') / 1000;
    const until = peek.payload.validUntil ? Date.parse(peek.payload.validUntil) / 1000 : Number.POSITIVE_INFINITY;
    if (Number.isNaN(from)) set(makeCheck('validity', false, 'validFrom is missing or malformed', 'FORMAT_INVALID'));
    else if (now < from) set(makeCheck('validity', false, `credential not valid before ${peek.payload.validFrom}`, 'NOT_YET_VALID', { validFrom: peek.payload.validFrom, now }));
    else if (now > until) set(makeCheck('validity', false, `credential expired at ${peek.payload.validUntil}`, 'EXPIRED', { validUntil: peek.payload.validUntil, now }));
    else set(makeCheck('validity', true, `valid from ${peek.payload.validFrom}${peek.payload.validUntil ? ` until ${peek.payload.validUntil}` : ''}`, undefined, { validFrom: peek.payload.validFrom, validUntil: peek.payload.validUntil }));
  }

  // ---- 8. status ----------------------------------------------------------------------------
  if (!peek) notEvaluated('status', 'undecodable');
  else if (!issuerAddress) notEvaluated('status', 'issuer DID unresolved');
  else {
    const status = peek.payload.credentialStatus;
    if (!status || status.type !== 'BitstringStatusListEntry') set(makeCheck('status', false, 'credential has no BitstringStatusListEntry', 'NO_STATUS'));
    else {
      let listId = -1;
      try {
        listId = listIdFromStatusUrl(status.statusListCredential);
      } catch {
        /* handled below */
      }
      const index = Number.parseInt(status.statusListIndex, 10);
      if (listId < 0 || !Number.isInteger(index)) set(makeCheck('status', false, 'malformed credentialStatus entry', 'FORMAT_INVALID', { status }));
      else {
        try {
          const fetched = await deps.fetchStatusList(issuerAddress, listId, status.statusListCredential);
          const bytes = stringToBytes(fetched.jwt);
          const evidence: Record<string, unknown> = { bit: index, listId, version: fetched.anchor.version, cid: fetched.anchor.cid, source: fetched.source, url: fetched.url, contentHash: fetched.anchor.contentHash };
          if (keccak256(bytes) !== fetched.anchor.contentHash) set(makeCheck('status', false, 'fetched status list does not match the hash anchored on chain', 'STATUS_HASH_MISMATCH', evidence));
          else if (!(await verifyStatusListSignature(fetched.jwt, issuerAddress))) set(makeCheck('status', false, 'status list is not signed by the issuer', 'STATUS_SIG_INVALID', evidence));
          else {
            const { payload } = decodeStatusListCredential(fetched.jwt);
            if (payload.issuer !== issuerDid || payload.id !== status.statusListCredential) set(makeCheck('status', false, `status list issuer/id (${payload.issuer}, ${payload.id}) do not match the credential`, 'STATUS_LIST_MISMATCH', evidence));
            else {
              const { revoked, listSize } = await readStatusBit(fetched.jwt, index, status.statusPurpose);
              set(
                revoked
                  ? makeCheck('status', false, `bit ${index} is set in status list v${fetched.anchor.version} (${status.statusPurpose})`, 'REVOKED', { ...evidence, listSize })
                  : makeCheck('status', true, `bit ${index} of ${listSize} is clear in status list v${fetched.anchor.version} (hash anchored on chain, fetched via ${fetched.source})`, undefined, { ...evidence, listSize }),
              );
            }
          }
        } catch (err) {
          set(makeCheck('status', false, `status list unavailable: ${(err as Error).message}`, 'STATUS_UNAVAILABLE', { listId, bit: index }));
        }
      }
    }
  }

  const ordered = CHECK_ORDER.map((name) => checks.get(name) ?? makeCheck(name, false, 'not evaluated', 'NOT_EVALUATED'));
  return {
    ok: ordered.every((c) => c.ok),
    checks: ordered,
    disclosed: peek ? (peek.claims as Record<string, unknown>) : {},
    digestsUndisclosed: peek ? peek.undisclosedDigests : [],
    issuerDid: issuerDid || undefined,
    holderDid: holderDid || undefined,
    credentialType,
    verifiedAt: now,
    dryRun,
  };
}
