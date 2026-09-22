import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { EthereumDIDRegistryAbi } from '../../src/chain/abi/EthereumDIDRegistry.js';
import { withSnapshot } from '../../src/chain/anvil.js';
import { makeWalletClient } from '../../src/chain/client.js';
import { addressToDid } from '../../src/did/ethr.js';
import { makeResolver, resolveControllerAddress, resolveDid } from '../../src/did/resolver.js';
import { testClients } from '../helpers.js';

// Anvil accounts #5 and #6 - throwaway identities so the issuer (#1) is never mutated.
const KEY_5 = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
const KEY_6 = '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e';

describe('did:ethr resolution against the local registry', () => {
  it('resolves a fresh identity to its own address as controller', async () => {
    const { deployments } = testClients();
    const resolver = makeResolver({ rpcUrl: deployments.rpcUrl, registry: deployments.didRegistry });
    const did = addressToDid(deployments.issuer.address);
    const doc = await resolveDid(resolver, did);
    expect(doc.id).toBe(did);
    const vm = doc.verificationMethod?.[0];
    expect(vm?.id).toBe(`${did}#controller`);
    expect(vm?.type).toBe('EcdsaSecp256k1RecoveryMethod2020');
    expect(vm?.blockchainAccountId).toBe(`eip155:31337:${deployments.issuer.address}`);
    expect(await resolveControllerAddress(resolver, did)).toBe(deployments.issuer.address);
  });

  it('reflects changeOwner on chain (throwaway identity, snapshot-reverted)', async () => {
    const { deployments, publicClient, testClient } = testClients();
    const resolver = makeResolver({ rpcUrl: deployments.rpcUrl, registry: deployments.didRegistry });
    const acct5 = privateKeyToAccount(KEY_5).address;
    const acct6 = privateKeyToAccount(KEY_6).address;
    const did5 = addressToDid(acct5);
    await withSnapshot(testClient, async () => {
      const wallet5 = makeWalletClient({ rpcUrl: deployments.rpcUrl, privateKey: KEY_5 });
      const hash = await wallet5.writeContract({
        address: deployments.didRegistry,
        abi: EthereumDIDRegistryAbi,
        functionName: 'changeOwner',
        args: [acct5, acct6],
        chain: wallet5.chain,
        account: wallet5.account,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      expect(await resolveControllerAddress(resolver, did5)).toBe(acct6);
    });
    expect(await resolveControllerAddress(resolver, did5)).toBe(acct5);
  });
});
