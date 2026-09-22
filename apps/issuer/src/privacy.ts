// Privacy scan for the issuer console: the term list is the REAL PII in this
// ledger (every subject field of every row) plus every holder DID/address seen in
// claim proofs (kept in memory only - the ledger stores hashes).
import type { PublicClient } from 'viem';
import { didToAddress } from '@dcv/core/did/ethr';
import type { BlobStore } from '@dcv/core/ipfs/blobStore';
import { scanForPii, stringLeaves, type ScanResult } from '@dcv/core/privacy/scan';
import type { Ledger } from './ledger.js';

export class HolderDidMemory {
  private readonly dids = new Set<string>();
  remember(did: string): void {
    this.dids.add(did);
  }
  terms(): string[] {
    const out: string[] = [];
    for (const did of this.dids) {
      out.push(did);
      try {
        out.push(didToAddress(did));
      } catch {
        /* not an ethr DID */
      }
    }
    return out;
  }
  clear(): void {
    this.dids.clear();
  }
}

export function ledgerTerms(ledger: Ledger): string[] {
  const out: string[] = [];
  for (const row of ledger.rows()) out.push(...stringLeaves(row.subject));
  return [...new Set(out)];
}

export async function issuerPrivacyScan(opts: {
  publicClient: PublicClient;
  blobStore: BlobStore;
  ledger: Ledger;
  holderDids: HolderDidMemory;
  extraTerms?: string[];
}): Promise<ScanResult & { termList: string[] }> {
  const termList = [...new Set([...ledgerTerms(opts.ledger), ...opts.holderDids.terms(), ...(opts.extraTerms ?? [])])];
  const result = await scanForPii({ publicClient: opts.publicClient, blobStore: opts.blobStore, terms: termList });
  return { ...result, termList };
}
