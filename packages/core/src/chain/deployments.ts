import type { Address } from 'viem';

/** Shape of deployments/anvil.json, written by scripts/deploy.ts. */
export interface Deployments {
  chainId: number;
  rpcUrl: string;
  didRegistry: Address;
  trustRegistry: Address;
  statusRegistry: Address;
  vaultPointer: Address;
  issuer: { address: Address; did: string; name: string; metadataURI: string };
  block: number;
  deployedAt: string;
}

const ADDR = /^0x[0-9a-fA-F]{40}$/;

/** Validate a parsed JSON value as Deployments (throws with a clear message). */
export function parseDeployments(value: unknown): Deployments {
  const d = value as Partial<Deployments> | null;
  if (!d || typeof d !== 'object') throw new Error('deployments: not an object');
  for (const k of ['didRegistry', 'trustRegistry', 'statusRegistry', 'vaultPointer'] as const) {
    if (typeof d[k] !== 'string' || !ADDR.test(d[k] as string)) throw new Error(`deployments: bad ${k}`);
  }
  if (typeof d.chainId !== 'number' || typeof d.rpcUrl !== 'string') throw new Error('deployments: bad chainId/rpcUrl');
  if (!d.issuer || !ADDR.test(d.issuer.address) || typeof d.issuer.did !== 'string') {
    throw new Error('deployments: bad issuer');
  }
  return d as Deployments;
}
