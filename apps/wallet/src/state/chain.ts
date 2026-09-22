// Read-only chain + IPFS access for the wallet (viem public client, no ethers,
// no DID resolver - the wallet only needs address recovery and registry reads).
import { keccak256, stringToBytes, type Address } from 'viem';
import { makePublicClient } from '@dcv/core/chain/client';
import { parseDeployments, type Deployments } from '@dcv/core/chain/deployments';
import { getStatusList } from '@dcv/core/chain/statusRegistry';
import { isTrustedFor } from '@dcv/core/chain/trustRegistry';
import { didToAddress } from '@dcv/core/did/ethr';
import { readStatusBit, verifyStatusListSignature } from '@dcv/core/status/credential';
import { listIdFromStatusUrl } from '@dcv/core/vc/schema';
import { KuboBlobStore } from '@dcv/core/ipfs/blobStore';
import { makePointerChain } from './backup';
import type { BackupDeps } from './backup';
import type { StoredCredential } from './wallet';

export const RPC_URL: string = (import.meta.env.VITE_RPC_URL as string | undefined) ?? 'http://127.0.0.1:8545';
export const IPFS_GATEWAY_URL: string = (import.meta.env.VITE_IPFS_GATEWAY_URL as string | undefined) ?? 'http://127.0.0.1:8080';
export const IPFS_API_URL: string = (import.meta.env.VITE_IPFS_API_URL as string | undefined) ?? 'http://127.0.0.1:5001';
export const ISSUER_URL: string = (import.meta.env.VITE_ISSUER_URL as string | undefined) ?? 'http://localhost:4001';

let deploymentsPromise: Promise<Deployments> | null = null;

/** deployments/anvil.json is served by the Vite dev server at /deployments.json (see vite.config.ts). */
export function loadDeployments(): Promise<Deployments> {
  deploymentsPromise ??= fetch('/deployments.json')
    .then(async (r) => {
      if (!r.ok) throw new Error(`deployments.json ${r.status} - run pnpm dev (it deploys the contracts)`);
      return parseDeployments(await r.json());
    })
    .catch((err) => {
      deploymentsPromise = null;
      throw err;
    });
  return deploymentsPromise;
}

export const publicClient = makePublicClient({ rpcUrl: RPC_URL });

export async function chainIsTrustedFor(issuer: Address, credentialType: string): Promise<boolean> {
  const d = await loadDeployments();
  return isTrustedFor(publicClient, d, issuer, credentialType);
}

export type CredentialStatus =
  | { state: 'valid'; version: number; bit: number; cid: string }
  | { state: 'revoked'; version: number; bit: number; cid: string }
  | { state: 'expired' }
  | { state: 'unknown'; reason: string };

/** Live status: chain anchor -> IPFS gateway -> hash + signature -> bit. Never asks the issuer. */
export async function credentialStatus(cred: StoredCredential): Promise<CredentialStatus> {
  const validUntil = (cred.claims as { validUntil?: string }).validUntil;
  if (validUntil && Date.parse(validUntil) < Date.now()) return { state: 'expired' };
  if (!cred.credentialStatus) return { state: 'unknown', reason: 'no credentialStatus' };
  try {
    const d = await loadDeployments();
    const issuer = didToAddress(cred.issuerDid);
    const listId = listIdFromStatusUrl(cred.credentialStatus.statusListCredential);
    const anchor = await getStatusList(publicClient, d, issuer, listId);
    if (anchor.version === 0) return { state: 'unknown', reason: 'no status list anchored yet' };
    const res = await fetch(`${IPFS_GATEWAY_URL}/ipfs/${anchor.cid}`);
    if (!res.ok) return { state: 'unknown', reason: `gateway ${res.status}` };
    const jwt = (await res.text()).trim();
    if (keccak256(stringToBytes(jwt)) !== anchor.contentHash) return { state: 'unknown', reason: 'status list hash mismatch' };
    if (!(await verifyStatusListSignature(jwt, issuer))) return { state: 'unknown', reason: 'status list signature invalid' };
    const bit = Number.parseInt(cred.credentialStatus.statusListIndex, 10);
    const { revoked } = await readStatusBit(jwt, bit, cred.credentialStatus.statusPurpose as 'revocation' | 'suspension');
    return { state: revoked ? 'revoked' : 'valid', version: anchor.version, bit, cid: anchor.cid };
  } catch (err) {
    return { state: 'unknown', reason: (err as Error).message };
  }
}

/** Backup deps wired to the local Kubo API (CORS-enabled by scripts/ipfs.mjs) and Anvil. */
export async function ipfsBackupDeps(): Promise<BackupDeps> {
  const d = await loadDeployments();
  const kubo = new KuboBlobStore({ apiUrl: IPFS_API_URL, gatewayUrl: IPFS_GATEWAY_URL });
  if (!(await kubo.isReachable())) throw new Error(`IPFS API ${IPFS_API_URL} not reachable (pnpm ipfs)`);
  return {
    blobStore: kubo,
    // read through the public gateway, exactly as a verifier would
    fetchBlob: async (cid) => {
      const res = await fetch(`${IPFS_GATEWAY_URL}/ipfs/${cid}`);
      if (!res.ok) throw new Error(`gateway ${res.status} for ${cid}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    chain: makePointerChain({ rpcUrl: RPC_URL, deployments: d }),
  };
}
