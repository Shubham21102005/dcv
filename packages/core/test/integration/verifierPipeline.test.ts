import { beforeAll, describe, expect, it } from 'vitest';
import { keccak256, stringToBytes } from 'viem';
import { withSnapshot } from '../../src/chain/anvil.js';
import { trustRegistryWrites } from '../../src/chain/trustRegistry.js';
import { DEFAULTS } from '../../src/config.js';
import { b64u } from '../../src/crypto/base64url.js';
import { makeResolver } from '../../src/did/resolver.js';
import { presentSdJwtVc } from '../../src/sdjwt/present.js';
import { issueTestCredential, type TestIssuance } from '../../src/testing/issueTestCredential.js';
import { verifyPresentation, type PipelineDeps } from '../../src/verifier/pipeline.js';
import type { CheckName, VerificationReport } from '../../src/verifier/report.js';
import { MemoryNonceStore, createPresentationRequest, type PresentationRequest } from '../../src/verifier/request.js';
import { testClients } from '../helpers.js';

const HOLDER_KEY = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6'; // Anvil #3
const OTHER_KEY = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a'; // Anvil #4
const NOW = 1_790_000_000;
const AUD = 'http://localhost:4002';

function failedRows(r: VerificationReport): CheckName[] {
  return r.checks.filter((c) => !c.ok).map((c) => c.name);
}

describe('verifier pipeline (8 independent checks)', () => {
  const { deployments, publicClient, testClient, issuerWallet, adminWallet } = testClients();
  const resolver = makeResolver({ rpcUrl: deployments.rpcUrl, registry: deployments.didRegistry });
  let issued: TestIssuance;
  let nonces: MemoryNonceStore;

  const deps = (over: Partial<PipelineDeps> = {}): PipelineDeps => ({
    publicClient,
    resolver,
    deployments,
    nonces,
    fetchStatusList: issued.fetchStatusList,
    rpcUrl: deployments.rpcUrl,
    issuerPublicUrl: DEFAULTS.ISSUER_PUBLIC_URL,
    kbMaxAgeSeconds: 300,
    now: NOW,
    ...over,
  });

  const newRequest = (claims = ['credentialSubject.degree.name']): PresentationRequest => {
    const req = createPresentationRequest({ aud: AUD, credentialType: 'UniversityDegreeCredential', claims, ttlSeconds: 600, now: NOW });
    nonces.issue(req.id, req.nonce, 600);
    return req;
  };

  const present = (req: PresentationRequest, over: { holderKey?: `0x${string}`; aud?: string; nonce?: string; now?: number; sdJwt?: string } = {}) =>
    presentSdJwtVc({
      holderKey: over.holderKey ?? HOLDER_KEY,
      sdJwt: over.sdJwt ?? issued.sdJwt,
      disclose: req.claims,
      kb: { aud: over.aud ?? req.aud, nonce: over.nonce ?? req.nonce },
      now: over.now ?? NOW,
    });

  beforeAll(async () => {
    nonces = new MemoryNonceStore(() => NOW);
    issued = await issueTestCredential({
      publicClient,
      issuerWallet,
      deployments,
      issuerKey: DEFAULTS.ISSUER_PRIVATE_KEY,
      holderKey: HOLDER_KEY,
      now: NOW,
    });
  });

  it('happy path: 8/8 ok, issuer never contacted, chain reads counted', async () => {
    const req = newRequest();
    const vp = await present(req);
    const r = await verifyPresentation(vp, req, deps());
    expect(failedRows(r)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.issuerContacted).toBe(false);
    expect(r.outboundUrls).toEqual([]); // memory-backed status list: no HTTP at all
    expect(r.chainReads).toBeGreaterThan(0);
    expect(r.issuerDid).toBe(issued.issuerDid);
    expect(r.holderDid).toBe(issued.holderDid);
    const subject = r.disclosed['credentialSubject'] as Record<string, unknown>;
    expect((subject['degree'] as Record<string, unknown>)['name']).toBe('Bachelor of Science in Computer Science');
    expect(subject['name']).toBeUndefined();
    expect(r.digestsUndisclosed).toHaveLength(5);
    expect(r.checks.find((c) => c.name === 'status')?.evidence).toMatchObject({ bit: 42, source: 'ipfs' });

    // dry run of the same VP after the real run: still 8/8 (nonce peeked, not consumed)
    const dry = await verifyPresentation(vp, req, deps({ dryRun: true }));
    expect(failedRows(dry)).toEqual([]);
    expect(dry.dryRun).toBe(true);
  });

  it('(a) issuer revoked in the registry -> only issuerTrusted', async () => {
    await withSnapshot(testClient, async () => {
      await trustRegistryWrites.revokeIssuer(adminWallet, publicClient, deployments, issued.issuerAddress);
      const req = newRequest();
      const r = await verifyPresentation(await present(req), req, deps());
      expect(failedRows(r)).toEqual(['issuerTrusted']);
      expect(r.checks.find((c) => c.name === 'issuerTrusted')?.code).toBe('ISSUER_UNTRUSTED');
    });
  });

  it('(b) credential revoked (status list v2) -> only status, with bit/version/cid evidence', async () => {
    await withSnapshot(testClient, async () => {
      const v2 = await issued.republish([issued.index]);
      const req = newRequest();
      const r = await verifyPresentation(await present(req), req, deps());
      expect(failedRows(r)).toEqual(['status']);
      const status = r.checks.find((c) => c.name === 'status')!;
      expect(status.code).toBe('REVOKED');
      expect(status.evidence).toMatchObject({ bit: 42, version: v2.version, cid: v2.cid });
    });
    // reverted: republish a clean list so later tests see a clear bit
    await issued.republish([]);
  });

  it('(c) nonce mismatch -> only holderBinding NONCE_MISMATCH', async () => {
    const req = newRequest();
    const r = await verifyPresentation(await present(req, { nonce: 'wrong-nonce' }), req, deps());
    expect(failedRows(r)).toEqual(['holderBinding']);
    expect(r.checks.find((c) => c.name === 'holderBinding')?.code).toBe('NONCE_MISMATCH');
  });

  it('(d) same VP twice in real runs -> second is NONCE_REPLAY; (d\') dry-run simulateConsumedNonce', async () => {
    const req = newRequest();
    const vp = await present(req);
    expect(failedRows(await verifyPresentation(vp, req, deps()))).toEqual([]);
    const replay = await verifyPresentation(vp, req, deps());
    expect(failedRows(replay)).toEqual(['holderBinding']);
    expect(replay.checks.find((c) => c.name === 'holderBinding')?.code).toBe('NONCE_REPLAY');
    const simulated = await verifyPresentation(vp, req, deps({ dryRun: true, simulateConsumedNonce: true }));
    expect(failedRows(simulated)).toEqual(['holderBinding']);
    expect(simulated.checks.find((c) => c.name === 'holderBinding')?.code).toBe('NONCE_REPLAY');
  });

  it('(e) audience swapped -> only holderBinding AUD_MISMATCH', async () => {
    const req = newRequest();
    const r = await verifyPresentation(await present(req, { aud: 'http://evil.example' }), req, deps());
    expect(failedRows(r)).toEqual(['holderBinding']);
    expect(r.checks.find((c) => c.name === 'holderBinding')?.code).toBe('AUD_MISMATCH');
  });

  it('(f) KB-JWT one hour old -> only freshness KB_STALE', async () => {
    const req = newRequest();
    const r = await verifyPresentation(await present(req), req, deps({ now: NOW + 3600 }));
    expect(failedRows(r)).toEqual(['freshness']);
    expect(r.checks.find((c) => c.name === 'freshness')?.code).toBe('KB_STALE');
  });

  it('(g) credential past validUntil -> only validity EXPIRED', async () => {
    await withSnapshot(testClient, async () => {
      const short = await issueTestCredential({
        publicClient,
        issuerWallet,
        deployments,
        issuerKey: DEFAULTS.ISSUER_PRIVATE_KEY,
        holderKey: HOLDER_KEY,
        now: NOW - 2 * 365 * 24 * 3600,
        validYears: 1,
        blobStore: issued.blobStore,
      });
      const req = newRequest();
      const r = await verifyPresentation(await present(req, { sdJwt: short.sdJwt }), req, deps({ fetchStatusList: short.fetchStatusList }));
      expect(failedRows(r)).toEqual(['validity']);
      expect(r.checks.find((c) => c.name === 'validity')?.code).toBe('EXPIRED');
    });
    await issued.republish([]);
  });

  it('(h) status list served with a tampered byte -> only status STATUS_HASH_MISMATCH', async () => {
    const req = newRequest();
    const tamperedFetcher: PipelineDeps['fetchStatusList'] = async (...args) => {
      const real = await issued.fetchStatusList(...args);
      const [h, p, s] = real.jwt.split('.') as [string, string, string];
      const payload = b64u.decodeJson<Record<string, unknown>>(p);
      payload['validFrom'] = '2020-01-01T00:00:00Z';
      return { ...real, jwt: `${h}.${b64u.encodeJson(payload)}.${s}` };
    };
    const r = await verifyPresentation(await present(req), req, deps({ fetchStatusList: tamperedFetcher }));
    expect(failedRows(r)).toEqual(['status']);
    expect(r.checks.find((c) => c.name === 'status')?.code).toBe('STATUS_HASH_MISMATCH');
  });

  it('(i) tampered disclosure -> only disclosures', async () => {
    const req = newRequest();
    const vp = await present(req);
    const parts = vp.split('~');
    const d = parts[1]!;
    parts[1] = d.slice(0, 5) + (d[5] === 'A' ? 'B' : 'A') + d.slice(6);
    const r = await verifyPresentation(parts.join('~'), req, deps());
    expect(failedRows(r)).toEqual(['disclosures']);
    expect(['DISCLOSURE_DIGEST_MISMATCH', 'SD_HASH_MISMATCH']).toContain(r.checks.find((c) => c.name === 'disclosures')?.code);
  });

  it('(j) request for a type the credential is not -> format TYPE_MISMATCH (+ issuerTrusted: not allowed for that type)', async () => {
    // Changing the issuer header typ would also break the issuer signature (two rows),
    // so the format row is exercised via a credential-type mismatch instead.
    const req = { ...newRequest(), credentialType: 'PassportCredential' };
    nonces.issue(req.id, req.nonce, 600);
    const r = await verifyPresentation(await present(req), req, deps());
    expect(failedRows(r)).toEqual(['format', 'issuerTrusted']);
    expect(r.checks.find((c) => c.name === 'format')?.code).toBe('TYPE_MISMATCH');
  });

  it('KB-JWT signed by another key -> only holderBinding KB_SIG_INVALID', async () => {
    const req = newRequest();
    const r = await verifyPresentation(await present(req, { holderKey: OTHER_KEY }), req, deps());
    expect(failedRows(r)).toEqual(['holderBinding']);
    expect(r.checks.find((c) => c.name === 'holderBinding')?.code).toBe('KB_SIG_INVALID');
  });

  it('garbage input -> every row false, format FORMAT_INVALID, nothing throws', async () => {
    const req = newRequest();
    const r = await verifyPresentation('not.a.presentation', req, deps());
    expect(r.ok).toBe(false);
    expect(r.checks).toHaveLength(8);
    expect(r.checks.every((c) => !c.ok)).toBe(true);
    expect(r.checks[0]?.code).toBe('FORMAT_INVALID');
  });

  it('status evidence hash matches the anchored list', async () => {
    const req = newRequest();
    const r = await verifyPresentation(await present(req), req, deps());
    const fetched = await issued.fetchStatusList(issued.issuerAddress, 1, issued.listUrl);
    expect(r.checks.find((c) => c.name === 'status')?.evidence).toMatchObject({ contentHash: keccak256(stringToBytes(fetched.jwt)) });
  });
});
