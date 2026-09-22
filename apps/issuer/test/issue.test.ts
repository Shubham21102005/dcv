import { beforeAll, describe, expect, it } from 'vitest';
import { bytesToHex } from 'viem';
import { getStatusList } from '@dcv/core/chain/statusRegistry';
import { sha256Bytes } from '@dcv/core/crypto/hkdf';
import { peekSdJwt } from '@dcv/core/sdjwt/decode';
import { verifyIssuedSdJwtVc } from '@dcv/core/sdjwt/verify';
import { CredentialV2Schema } from '@dcv/core/vc/schema';
import { HOLDER_KEY, hashOf, issueToHolder, json, makeIssuer } from './helpers.js';
import { signOfferProof } from '@dcv/core/offer/proof';
import { privateKeyToAccount } from 'viem/accounts';
import { addressToDid } from '@dcv/core/did/ethr';

describe('issuer: offers, claims, ledger', () => {
  const issuer = makeIssuer();
  const { app, deps, deployments, publicClient } = issuer;

  beforeAll(async () => {
    await issuer.boot();
  });

  it('publishes status list v1 at boot and anchors it on chain', async () => {
    // Test files share one Anvil, so the version is >= 1; what matters is that the
    // served JWT is exactly the anchored one.
    const anchor = await getStatusList(publicClient, deployments, deps.issuerWallet.account.address, 1);
    expect(anchor.version).toBeGreaterThanOrEqual(1);
    expect(anchor.cid.startsWith('bafkrei')).toBe(true);
    const health = (await (await app.request('/health')).json()) as { statusListVersion: number };
    expect(health.statusListVersion).toBe(anchor.version);
    const statusRes = await app.request('/status/1');
    expect(statusRes.headers.get('content-type')).toContain('application/vc+jwt');
    const jwt = await statusRes.text();
    expect(jwt.split('.')).toHaveLength(3);
    expect(hashOf(jwt)).toBe(anchor.contentHash);
    const info = (await (await app.request('/status/1/info')).json()) as { version: number; cid: string };
    expect(info).toMatchObject({ version: anchor.version, cid: anchor.cid });
  });

  it('GET /did reports the trusted issuer', async () => {
    const did = (await (await app.request('/did')).json()) as { did: string; trusted: boolean; trustedFor: Record<string, boolean> };
    expect(did.did).toBe(deps.issuerDid);
    expect(did.trusted).toBe(true);
    expect(did.trustedFor['UniversityDegreeCredential']).toBe(true);
  });

  it('creates an offer (201) with wallet link, then claims it with a valid proof', async () => {
    const versionBefore = (await getStatusList(publicClient, deployments, deps.issuerWallet.account.address, 1)).version;
    const { offer, holderDid, claimRes, claim } = await issueToHolder(app, deps.issuerDid);
    expect(offer.walletLink.startsWith('http://localhost:5173/#/accept?offer=')).toBe(true);
    expect(claimRes.status).toBe(200);
    expect(claim.credentialId.startsWith('urn:uuid:')).toBe(true);

    const peek = await peekSdJwt(claim.sdJwt);
    expect(CredentialV2Schema.safeParse(peek.claims).success).toBe(true);
    expect(peek.cnfKid).toBe(`${holderDid}#controller`);
    expect(peek.payload.credentialSubject.id).toBe(holderDid);
    expect(peek.payload.credentialStatus?.statusListIndex).toBe(String(claim.statusListIndex));
    expect(peek.payload.credentialStatus?.statusListCredential).toBe('http://localhost:4001/status/1');
    await expect(verifyIssuedSdJwtVc(claim.sdJwt)).resolves.toBeTruthy();

    // issuance does not republish the status list
    expect((await getStatusList(publicClient, deployments, deps.issuerWallet.account.address, 1)).version).toBe(versionBefore);

    // ledger is redacted, preview has the digests
    const list = (await (await app.request('/credentials')).json()) as { credentials: Array<Record<string, unknown>> };
    const row = list.credentials.find((r) => r['id'] === claim.credentialId)!;
    expect(row).toBeDefined();
    expect(row['subject']).toBeUndefined();
    expect(row['signedPreview']).toBeUndefined();
    expect(row['holderDidHash']).toBe(bytesToHex(sha256Bytes(holderDid)));
    expect(row['revoked']).toBe(false);
    const preview = (await (await app.request(`/credentials/${claim.credentialId}/preview`)).json()) as { header: { typ: string }; sdDigests: string[] };
    expect(preview.header.typ).toBe('vc+sd-jwt');
    expect(preview.sdDigests).toHaveLength(6);

    // offers are single-use
    const again = await app.request(`/offers/${offer.offerId}/claim`, json({ proof: 'x' }));
    expect(again.status).toBe(410);
    expect((await app.request(`/offers/${offer.offerId}`)).status).toBe(410);
  });

  it('rejects a bad proof with 401 and keeps the offer open', async () => {
    const offerRes = await app.request('/credentials', json({ type: 'UniversityDegreeCredential', subject: { name: 'Bob', birthDate: '2000-01-01', studentId: 'X', degree: { type: 'BachelorDegree', name: 'BA', grade: 'Pass', awardedOn: '2024-01-01' } } }));
    expect(offerRes.status).toBe(201);
    const { offerId } = (await offerRes.json()) as { offerId: string };
    const holderDid = addressToDid(privateKeyToAccount(HOLDER_KEY).address);
    const wrongNonce = await signOfferProof({ holderKey: HOLDER_KEY, holderDid, issuerDid: deps.issuerDid, nonce: 'not-the-nonce' });
    const res = await app.request(`/offers/${offerId}/claim`, json({ proof: wrongNonce }));
    expect(res.status).toBe(401);
    expect((await app.request(`/offers/${offerId}`)).status).toBe(200);
    expect((await app.request(`/offers/${offerId}/claim`, json({}))).status).toBe(400);
    expect((await app.request('/offers/nope')).status).toBe(404);
  });

  it('validates the subject and the type', async () => {
    expect((await app.request('/credentials', json({ type: 'PassportCredential', subject: {} }))).status).toBe(400);
    expect((await app.request('/credentials', json({ type: 'UniversityDegreeCredential', subject: { name: 'x' } }))).status).toBe(400);
  });

  it('allocates distinct status indices per credential', async () => {
    const a = await issueToHolder(app, deps.issuerDid);
    const b = await issueToHolder(app, deps.issuerDid);
    expect(a.claim.statusListIndex).not.toBe(b.claim.statusListIndex);
  });
});
