// IPFS backup + VaultPointer restore. Injectable deps so the unit tests use an
// in-memory blob store and a fake pointer; the app wires Kubo + Anvil.
import { parseEther, type Address, type Hex } from 'viem';
import { BackupStore, decryptLocator, encryptLocator } from '@dcv/core/ipfs/backupStore';
import type { BlobStore } from '@dcv/core/ipfs/blobStore';
import type { VaultRecord } from '@dcv/core/vault/record';
import type { Wallet } from './wallet';

export interface PointerChain {
  /** Write the encrypted locator from `account` (funding it first on the local chain). */
  setPointer(account: { address: Address; privateKey: Hex }, locator: Hex): Promise<{ txHash: string }>;
  getPointer(owner: Address): Promise<{ encryptedLocator: Hex; updatedAt: number }>;
}

export interface BackupDeps {
  blobStore: BlobStore;
  /** Fetch a blob for restore (gateway in the browser; blobStore.cat in tests). */
  fetchBlob?: (cid: string) => Promise<Uint8Array>;
  chain: PointerChain;
}

export async function backupToIpfs(wallet: Wallet, deps: BackupDeps): Promise<{ cid: string; bytes: number; txHash: string; pointerAddress: Address; records: number }> {
  const records = await wallet.store.list();
  const backupKey = await wallet.backupKey();
  const store = new BackupStore(deps.blobStore);
  const { cid, bytes } = await store.backup(backupKey, records);
  const locator = await encryptLocator(backupKey, cid);
  const pointer = await wallet.pointerAccount();
  const { txHash } = await deps.chain.setPointer(pointer, locator);
  return { cid, bytes, txHash, pointerAddress: pointer.address, records: records.length };
}

/**
 * Restore on a wiped device: the mnemonic re-derives the pointer account and the
 * backup key; the chain gives the encrypted locator; IPFS gives the bundle.
 * The wallet must already hold the restored identity (restoreFromMnemonic).
 */
export async function restoreFromIpfs(wallet: Wallet, deps: BackupDeps): Promise<{ cid: string; records: number }> {
  const pointer = await wallet.pointerAccount();
  const { encryptedLocator } = await deps.chain.getPointer(pointer.address);
  if (!encryptedLocator || encryptedLocator === '0x') throw new Error(`no backup pointer on chain for ${pointer.address}`);
  const backupKey = await wallet.backupKey();
  const cid = await decryptLocator(backupKey, encryptedLocator);
  const store = new BackupStore(deps.blobStore);
  const bundle = await store.restore(backupKey, cid, deps.fetchBlob);
  for (const r of bundle.records as VaultRecord[]) await wallet.store.put(r);
  wallet.notify();
  return { cid, records: bundle.records.length };
}

/** Wire the pointer chain to viem clients (used by the app; tests pass a fake). */
export function makePointerChain(opts: {
  rpcUrl: string;
  deployments: { vaultPointer: Address };
}): PointerChain {
  return {
    async setPointer(account, locator) {
      const [{ makePublicClient, makeTestClient, makeWalletClient }, { setPointer }, { setBalance }] = await Promise.all([
        import('@dcv/core/chain/client'),
        import('@dcv/core/chain/vaultPointer'),
        import('@dcv/core/chain/anvil'),
      ]);
      const publicClient = makePublicClient({ rpcUrl: opts.rpcUrl });
      const testClient = makeTestClient({ rpcUrl: opts.rpcUrl });
      // Local-chain cheat code; production would use a paymaster/relayer.
      await setBalance(testClient, account.address, parseEther('1'));
      const wallet = makeWalletClient({ rpcUrl: opts.rpcUrl, privateKey: account.privateKey });
      const txHash = await setPointer(wallet, publicClient, opts.deployments, locator);
      return { txHash };
    },
    async getPointer(owner) {
      const [{ makePublicClient }, { getPointer }] = await Promise.all([import('@dcv/core/chain/client'), import('@dcv/core/chain/vaultPointer')]);
      return getPointer(makePublicClient({ rpcUrl: opts.rpcUrl }), opts.deployments, owner);
    },
  };
}
