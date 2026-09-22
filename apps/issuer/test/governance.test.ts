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

  it('privacy scan is 501 until Step 17 wires it', async () => {
    expect((await app.request('/admin/privacy-scan')).status).toBe(501);
  });
});
