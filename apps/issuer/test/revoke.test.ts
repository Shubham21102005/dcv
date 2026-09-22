import { beforeAll, describe, expect, it } from 'vitest';
import { getStatusList } from '@dcv/core/chain/statusRegistry';
import { readStatusBit } from '@dcv/core/status/credential';
import { hashOf, issueToHolder, json, makeIssuer } from './helpers.js';

describe('issuer: revocation republishes and re-anchors the status list', () => {
  const issuer = makeIssuer();
  const { app, deps, deployments, publicClient } = issuer;
  const issuerAddress = deps.issuerWallet.account.address;

  beforeAll(async () => {
    await issuer.boot();
  });

  it('revoke -> bit set, v+1, hash anchored; unrevoke -> bit clear, v+1', async () => {
    const { claim } = await issueToHolder(app, deps.issuerDid);
    const before = await getStatusList(publicClient, deployments, issuerAddress, 1);
    const jwtBefore = await (await app.request('/status/1')).text();
    expect((await readStatusBit(jwtBefore, claim.statusListIndex, 'revocation')).revoked).toBe(false);

    const revokeRes = await app.request(`/credentials/${claim.credentialId}/revoke`, json(undefined));
    expect(revokeRes.status).toBe(200);
    const revoked = (await revokeRes.json()) as { version: number; cid: string; contentHash: string; statusListIndex: number };
    expect(revoked.version).toBe(before.version + 1);
    expect(revoked.statusListIndex).toBe(claim.statusListIndex);

    const jwt = await (await app.request('/status/1')).text();
    expect((await readStatusBit(jwt, claim.statusListIndex, 'revocation')).revoked).toBe(true);
    const anchor = await getStatusList(publicClient, deployments, issuerAddress, 1);
    expect(anchor.version).toBe(before.version + 1);
    expect(anchor.contentHash).toBe(hashOf(jwt));
    expect(anchor.cid).toBe(revoked.cid);
    // the blob store holds exactly the published bytes
    expect(new TextDecoder().decode(await deps.blobStore.cat(anchor.cid))).toBe(jwt);

    const list = (await (await app.request('/credentials')).json()) as { credentials: Array<{ id: string; revoked: boolean }> };
    expect(list.credentials.find((r) => r.id === claim.credentialId)?.revoked).toBe(true);

    const unrevokeRes = await app.request(`/credentials/${claim.credentialId}/unrevoke`, json(undefined));
    const unrevoked = (await unrevokeRes.json()) as { version: number };
    expect(unrevoked.version).toBe(before.version + 2);
    const jwt3 = await (await app.request('/status/1')).text();
    expect((await readStatusBit(jwt3, claim.statusListIndex, 'revocation')).revoked).toBe(false);
    expect((await getStatusList(publicClient, deployments, issuerAddress, 1)).contentHash).toBe(hashOf(jwt3));
  });

  it('404 for unknown credential ids', async () => {
    expect((await app.request('/credentials/urn:uuid:nope/revoke', json(undefined))).status).toBe(404);
    expect((await app.request('/credentials/urn:uuid:nope/preview')).status).toBe(404);
  });

  it('POST /admin/reset truncates the ledger and republishes', async () => {
    await issueToHolder(app, deps.issuerDid);
    const before = await getStatusList(publicClient, deployments, issuerAddress, 1);
    const res = await app.request('/admin/reset', json(undefined));
    expect(res.status).toBe(200);
    const list = (await (await app.request('/credentials')).json()) as { credentials: unknown[] };
    expect(list.credentials).toHaveLength(0);
    expect((await getStatusList(publicClient, deployments, issuerAddress, 1)).version).toBe(before.version + 1);
  });
});
