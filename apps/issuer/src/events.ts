// Live on-chain event feed for the governance tab: every log from the four
// contracts since block 0, decoded with viem.
import { parseEventLogs, type Abi, type PublicClient } from 'viem';
import { EthereumDIDRegistryAbi } from '@dcv/core/chain/abi/EthereumDIDRegistry';
import { IssuerTrustRegistryAbi } from '@dcv/core/chain/abi/IssuerTrustRegistry';
import { StatusListRegistryAbi } from '@dcv/core/chain/abi/StatusListRegistry';
import { VaultPointerAbi } from '@dcv/core/chain/abi/VaultPointer';
import type { Deployments } from '@dcv/core/chain/deployments';

export interface ChainEvent {
  contract: string;
  name: string;
  args: Record<string, unknown>;
  blockNumber: number;
  txHash: string;
  logIndex: number;
}

const jsonSafe = (v: unknown): unknown =>
  typeof v === 'bigint' ? v.toString() : Array.isArray(v) ? v.map(jsonSafe) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonSafe(x)])) : v;

export async function listChainEvents(client: PublicClient, d: Deployments): Promise<ChainEvent[]> {
  const contracts: Array<{ name: string; address: `0x${string}`; abi: Abi }> = [
    { name: 'EthereumDIDRegistry', address: d.didRegistry, abi: EthereumDIDRegistryAbi as unknown as Abi },
    { name: 'IssuerTrustRegistry', address: d.trustRegistry, abi: IssuerTrustRegistryAbi as unknown as Abi },
    { name: 'StatusListRegistry', address: d.statusRegistry, abi: StatusListRegistryAbi as unknown as Abi },
    { name: 'VaultPointer', address: d.vaultPointer, abi: VaultPointerAbi as unknown as Abi },
  ];
  const logs = await client.getLogs({ address: contracts.map((c) => c.address), fromBlock: 0n, toBlock: 'latest' });
  const out: ChainEvent[] = [];
  for (const c of contracts) {
    const mine = logs.filter((l) => l.address.toLowerCase() === c.address.toLowerCase());
    const parsed = parseEventLogs({ abi: c.abi, logs: mine });
    for (const p of parsed) {
      out.push({
        contract: c.name,
        name: p.eventName,
        args: jsonSafe(p.args ?? {}) as Record<string, unknown>,
        blockNumber: Number(p.blockNumber),
        txHash: p.transactionHash,
        logIndex: p.logIndex,
      });
    }
  }
  return out.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}
