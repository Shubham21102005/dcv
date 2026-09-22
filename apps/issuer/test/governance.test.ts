import { beforeAll, describe, expect, it } from 'vitest';
import { withSnapshot } from '@dcv/core/chain/anvil';
import { isTrustedFor } from '@dcv/core/chain/trustRegistry';
import { json, makeIssuer } from './helpers.js';

describe('issuer: governance routes (admin key)', () => {
  const issuer = makeIssuer();
  const { app, deps, deployments, publicClient, testClient } = issuer;
  const issuerAddress = deps.issuerWallet.account.address;

  beforeAll(async () => {
    await issuer.boot();
  });

  it('revoke / reactivate issuer and allow / disallow type, visible in the event feed', async () => {
    await withSnapshot(testClient, async () => {
      expect((await app.request(`/admin/issuers/${issuerAddress}/revoke`, json(undefined))).status).toBe(200);
      expect(await isTrustedFor(publicClient, deployments, issuerAddress, 'UniversityDegreeCredential')).toBe(false);
      const events = (await (await app.request('/admin/events')).json()) as { events: Array<{ name: string; contract: string }> };
      expect(events.events.some((e) => e.name === 'IssuerRevoked')).toBe(true);
      expect(events.events.some((e) => e.name === 'StatusListPublished')).toBe(true);
      expect(events.events.map((e) => e.name)).toContain('IssuerRegistered');
      expect(events.events.map((e) => e.name)).toContain('CredentialTypeAllowed');

      expect((await app.request(`/admin/issuers/${issuerAddress}/reactivate`, json(undefined))).status).toBe(200);
      expect(await isTrustedFor(publicClient, deployments, issuerAddress, 'UniversityDegreeCredential')).toBe(true);

      expect((await app.request('/admin/types', json({ issuer: issuerAddress, credentialType: 'EmployeeIdCredential' }))).status).toBe(200);
      expect(await isTrustedFor(publicClient, deployments, issuerAddress, 'EmployeeIdCredential')).toBe(true);
      expect((await app.request('/admin/types', json({ issuer: issuerAddress, credentialType: 'EmployeeIdCredential' }, 'DELETE'))).status).toBe(200);
      expect(await isTrustedFor(publicClient, deployments, issuerAddress, 'EmployeeIdCredential')).toBe(false);

      const info = (await (await app.request(`/admin/issuers/${issuerAddress}`)).json()) as { active: boolean; name: string };
      expect(info).toMatchObject({ active: true, name: 'Anvil State University' });
    });
    // snapshot reverted: still trusted
    expect(await isTrustedFor(publicClient, deployments, issuerAddress, 'UniversityDegreeCredential')).toBe(true);
  });

  it('registers a new issuer', async () => {
    await withSnapshot(testClient, async () => {
      const addr = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'; // Anvil #3
      const res = await app.request('/admin/issuers', json({ address: addr, name: 'Second Uni', metadataURI: '' }));
      expect(res.status).toBe(200);
      const info = (await (await app.request(`/admin/issuers/${addr}`)).json()) as { active: boolean; name: string };
      expect(info).toMatchObject({ active: true, name: 'Second Uni' });
      expect((await app.request('/admin/issuers', json({ address: 'not-an-address', name: 'x' }))).status).toBe(400);
    });
  });

  it('privacy scan: 409 with an empty ledger, then 0 hits for real PII after an issuance', async () => {
    const { issueToHolder } = await import('./helpers.js');
    const empty = await app.request('/admin/privacy-scan');
    expect([200, 409]).toContain(empty.status); // other files may have issued already on the shared chain
    const { holderDid } = await issueToHolder(app, deps.issuerDid);
    const res = await app.request('/admin/privacy-scan');
    expect(res.status).toBe(200);
    const r = (await res.json()) as { terms: number; hits: unknown[]; blocks: number; blobs: number; termList: string[] };
    expect(r.terms).toBeGreaterThan(0);
    expect(r.termList).toContain('Alice Example');
    expect(r.termList).toContain(holderDid);
    expect(r.blocks).toBeGreaterThan(1);
    expect(r.blobs).toBeGreaterThan(0);
    expect(r.hits).toEqual([]);
  });
});
