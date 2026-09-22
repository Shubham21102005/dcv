// Shared helpers for core integration tests: clients bound to the self-spawned Anvil.
import { makePublicClient, makeTestClient, makeWalletClient } from '../src/chain/client.js';
import { readDeploymentsFile } from '../src/chain/deploymentsNode.js';
import { DEFAULTS } from '../src/config.js';

export const TEST_DEPLOYMENTS_FILE = 'deployments/test-core.json';

export function testDeployments() {
  return readDeploymentsFile(TEST_DEPLOYMENTS_FILE);
}

export function testClients() {
  const deployments = testDeployments();
  return {
    deployments,
    publicClient: makePublicClient({ rpcUrl: deployments.rpcUrl }),
    testClient: makeTestClient({ rpcUrl: deployments.rpcUrl }),
    adminWallet: makeWalletClient({ rpcUrl: deployments.rpcUrl, privateKey: DEFAULTS.ADMIN_PRIVATE_KEY }),
    issuerWallet: makeWalletClient({ rpcUrl: deployments.rpcUrl, privateKey: DEFAULTS.ISSUER_PRIVATE_KEY }),
  };
}
