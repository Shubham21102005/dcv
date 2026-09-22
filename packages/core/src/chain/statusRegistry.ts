import type { Address, Hash, Hex, PublicClient, WalletClient } from 'viem';
import { StatusListRegistryAbi } from './abi/StatusListRegistry.js';
import type { Deployments } from './deployments.js';

type Writer = WalletClient & { account: NonNullable<WalletClient['account']> };

export interface StatusListAnchor {
  cid: string;
  contentHash: Hex;
  purpose: string;
  version: number;
  updatedAt: number;
}

export async function getStatusList(
  client: PublicClient,
  d: Pick<Deployments, 'statusRegistry'>,
  issuer: Address,
  listId: bigint | number,
): Promise<StatusListAnchor> {
  const r = await client.readContract({
    address: d.statusRegistry,
    abi: StatusListRegistryAbi,
    functionName: 'get',
    args: [issuer, BigInt(listId)],
  });
  return { cid: r.cid, contentHash: r.contentHash, purpose: r.purpose, version: Number(r.version), updatedAt: Number(r.updatedAt) };
}

export async function versionOf(
  client: PublicClient,
  d: Pick<Deployments, 'statusRegistry'>,
  issuer: Address,
  listId: bigint | number,
): Promise<number> {
  const v = await client.readContract({
    address: d.statusRegistry,
    abi: StatusListRegistryAbi,
    functionName: 'versionOf',
    args: [issuer, BigInt(listId)],
  });
  return Number(v);
}

export async function publishStatusList(
  wallet: Writer,
  client: PublicClient,
  d: Pick<Deployments, 'statusRegistry'>,
  listId: bigint | number,
  cid: string,
  contentHash: Hex,
  purpose: string,
): Promise<Hash> {
  const hash = await wallet.writeContract({
    address: d.statusRegistry,
    abi: StatusListRegistryAbi,
    functionName: 'publish',
    args: [BigInt(listId), cid, contentHash, purpose],
    chain: wallet.chain,
    account: wallet.account,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`publish reverted (tx ${hash})`);
  return hash;
}
