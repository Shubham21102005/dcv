import { describe, expect, it } from 'vitest';
import { withSnapshot } from '../../src/chain/anvil.js';
import { isTrusted, isTrustedFor, trustRegistryWrites } from '../../src/chain/trustRegistry.js';
import { testClients } from '../helpers.js';

const STRANGER = '0x000000000000000000000000000000000000dEaD';

describe('IssuerTrustRegistry via viem', () => {
  it('seeded issuer is trusted for the degree type only', async () => {
    const { deployments, publicClient } = testClients();
    const issuer = deployments.issuer.address;
    expect(await isTrusted(publicClient, deployments, issuer)).toBe(true);
    expect(await isTrustedFor(publicClient, deployments, issuer, 'UniversityDegreeCredential')).toBe(true);
    expect(await isTrustedFor(publicClient, deployments, issuer, 'PassportCredential')).toBe(false);
    expect(await isTrustedFor(publicClient, deployments, STRANGER, 'UniversityDegreeCredential')).toBe(false);
  });

  it('mutations inside withSnapshot are rolled back', async () => {
    const { deployments, publicClient, testClient, adminWallet } = testClients();
    const issuer = deployments.issuer.address;
    await withSnapshot(testClient, async () => {
      await trustRegistryWrites.allowCredentialType(adminWallet, publicClient, deployments, issuer, 'EmployeeIdCredential');
      expect(await isTrustedFor(publicClient, deployments, issuer, 'EmployeeIdCredential')).toBe(true);
      await trustRegistryWrites.revokeIssuer(adminWallet, publicClient, deployments, issuer);
      expect(await isTrustedFor(publicClient, deployments, issuer, 'UniversityDegreeCredential')).toBe(false);
    });
    // reverted: back to the seeded state
    expect(await isTrustedFor(publicClient, deployments, issuer, 'EmployeeIdCredential')).toBe(false);
    expect(await isTrustedFor(publicClient, deployments, issuer, 'UniversityDegreeCredential')).toBe(true);
  });
});
