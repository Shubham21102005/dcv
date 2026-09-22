import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fromRoot } from '../../src/chain/deploymentsNode.js';
import { TEST_DEPLOYMENTS_FILE, testClients } from '../helpers.js';

// Well-known addresses of Anvil account #0's first four deployments.
const EXPECTED = {
  didRegistry: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  trustRegistry: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  statusRegistry: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  vaultPointer: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
};

describe('self-spawned anvil + deploy', () => {
  it('wrote deployments/test-core.json for chain 31337', async () => {
    const { deployments, publicClient } = testClients();
    expect(existsSync(fromRoot(TEST_DEPLOYMENTS_FILE))).toBe(true);
    expect(deployments.chainId).toBe(31337);
    expect(deployments.rpcUrl).toBe('http://127.0.0.1:8546');
    expect(await publicClient.getChainId()).toBe(31337);
  });

  it('deployed the four contracts at the deterministic addresses', async () => {
    const { deployments, publicClient } = testClients();
    for (const [k, addr] of Object.entries(EXPECTED) as [keyof typeof EXPECTED, string][]) {
      expect(deployments[k].toLowerCase()).toBe(addr.toLowerCase());
      const code = await publicClient.getCode({ address: deployments[k] });
      expect(code && code.length > 2).toBe(true);
    }
  });

  it('records the issuer DID and metadata URI', () => {
    const { deployments } = testClients();
    expect(deployments.issuer.address).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    expect(deployments.issuer.did).toBe('did:ethr:anvil:0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    expect(deployments.issuer.metadataURI).toBe('http://localhost:4001/metadata.json');
  });
});
