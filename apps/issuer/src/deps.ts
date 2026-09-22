// Build the real dependency set for the issuer from config + deployments.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makePublicClient, makeWalletClient } from '@dcv/core/chain/client';
import { fromRoot, readDeploymentsFile } from '@dcv/core/chain/deploymentsNode';
import { getConfig } from '@dcv/core/config';
import { addressToDid } from '@dcv/core/did/ethr';
import { KuboBlobStore, MemoryBlobStore, type BlobStore } from '@dcv/core/ipfs/blobStore';
import type { IssuerDeps } from './app.js';
import { Ledger } from './ledger.js';

/** Kubo if reachable, otherwise an in-memory store (with a loud warning). */
export async function resolveBlobStore(opts: { apiUrl: string; gatewayUrl: string; log?: (s: string) => void }): Promise<BlobStore> {
  const kubo = new KuboBlobStore({ apiUrl: opts.apiUrl, gatewayUrl: opts.gatewayUrl });
  if (await kubo.isReachable()) return kubo;
  opts.log?.(`WARNING: IPFS API ${opts.apiUrl} not reachable - status lists will be served from memory only (run: pnpm ipfs)`);
  return new MemoryBlobStore();
}

export async function buildIssuerDeps(overrides: Partial<IssuerDeps> & { ledgerFile?: string } = {}): Promise<IssuerDeps> {
  const cfg = getConfig();
  const deployments = overrides.deployments ?? readDeploymentsFile(cfg.deploymentsFile);
  const publicClient = overrides.publicClient ?? makePublicClient({ rpcUrl: deployments.rpcUrl });
  const issuerWallet = overrides.issuerWallet ?? makeWalletClient({ rpcUrl: deployments.rpcUrl, privateKey: cfg.issuerPrivateKey });
  const adminWallet = overrides.adminWallet ?? makeWalletClient({ rpcUrl: deployments.rpcUrl, privateKey: cfg.adminPrivateKey });
  const metadata = overrides.metadata ?? (JSON.parse(readFileSync(fromRoot('data/issuer-metadata.json'), 'utf8')) as Record<string, unknown>);
  return {
    config: {
      issuerName: cfg.issuerName,
      issuerPublicUrl: cfg.issuerPublicUrl,
      walletUrl: cfg.walletUrl,
      verifierWebUrl: 'http://localhost:5174',
      nonceTtlSeconds: cfg.nonceTtlSeconds,
      statusListSize: cfg.statusListSize,
    },
    deployments,
    publicClient,
    issuerWallet,
    adminWallet,
    issuerKey: cfg.issuerPrivateKey,
    issuerDid: addressToDid(issuerWallet.account.address),
    ledger: overrides.ledger ?? new Ledger(resolve(fromRoot(overrides.ledgerFile ?? 'data/issuer.json'))),
    blobStore: overrides.blobStore ?? (await resolveBlobStore({ apiUrl: cfg.ipfsApiUrl, gatewayUrl: cfg.ipfsGatewayUrl, log: console.warn })),
    metadata,
    ...(overrides.now ? { now: overrides.now } : {}),
  };
}
