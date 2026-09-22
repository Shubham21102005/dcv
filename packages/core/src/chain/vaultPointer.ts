import type { Address, Hash, Hex, PublicClient, WalletClient } from 'viem';
import { VaultPointerAbi } from './abi/VaultPointer.js';
import type { Deployments } from './deployments.js';

type Writer = WalletClient & { account: NonNullable<WalletClient['account']> };

export async function getPointer(
  client: PublicClient,
  d: Pick<Deployments, 'vaultPointer'>,
  owner: Address,
): Promise<{ encryptedLocator: Hex; updatedAt: number }> {
  const [encryptedLocator, updatedAt] = await client.readContract({
    address: d.vaultPointer,
    abi: VaultPointerAbi,
    functionName: 'getPointer',
    args: [owner],
  });
  return { encryptedLocator, updatedAt: Number(updatedAt) };
}

export async function setPointer(
  wallet: Writer,
  client: PublicClient,
  d: Pick<Deployments, 'vaultPointer'>,
  encryptedLocator: Hex,
): Promise<Hash> {
  const hash = await wallet.writeContract({
    address: d.vaultPointer,
    abi: VaultPointerAbi,
    functionName: 'setPointer',
    args: [encryptedLocator],
    chain: wallet.chain,
    account: wallet.account,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`setPointer reverted (tx ${hash})`);
  return hash;
}

export async function clearPointer(wallet: Writer, client: PublicClient, d: Pick<Deployments, 'vaultPointer'>): Promise<Hash> {
  const hash = await wallet.writeContract({
    address: d.vaultPointer,
    abi: VaultPointerAbi,
    functionName: 'clearPointer',
    chain: wallet.chain,
    account: wallet.account,
  });
  await client.waitForTransactionReceipt({ hash });
  return hash;
}
