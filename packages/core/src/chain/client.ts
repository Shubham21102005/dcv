import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  type Chain,
  type Hex,
  type PublicClient,
  type TestClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

/** The local Anvil chain (chainId 31337). */
export const anvilChain: Chain = {
  id: 31337,
  name: 'anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
};

export function makePublicClient(opts: { rpcUrl: string }): PublicClient {
  return createPublicClient({ chain: anvilChain, transport: http(opts.rpcUrl), pollingInterval: 200 });
}

export function makeWalletClient(opts: { rpcUrl: string; privateKey: Hex }): WalletClient & { account: PrivateKeyAccount } {
  const account = privateKeyToAccount(opts.privateKey);
  return createWalletClient({ account, chain: anvilChain, transport: http(opts.rpcUrl), pollingInterval: 200 }) as WalletClient & {
    account: PrivateKeyAccount;
  };
}

/** Test client for Anvil cheat codes (setBalance, snapshot, revert, ...). */
export function makeTestClient(opts: { rpcUrl: string }): TestClient<'anvil'> {
  return createTestClient({ mode: 'anvil', chain: anvilChain, transport: http(opts.rpcUrl) });
}
