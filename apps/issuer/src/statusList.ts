// Bitstring Status List lifecycle: build from the ledger, sign as vc+jwt, add to
// IPFS, anchor keccak256 + CID on-chain. Published at boot (v1, all zero) and
// after every revoke/unrevoke; never on issuance (bits unchanged).
import { keccak256, stringToBytes, type Hex, type PublicClient, type WalletClient } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import type { Deployments } from '@dcv/core/chain/deployments';
import { publishStatusList, versionOf } from '@dcv/core/chain/statusRegistry';
import type { BlobStore } from '@dcv/core/ipfs/blobStore';
import { Bitstring } from '@dcv/core/status/bitstring';
import { buildStatusListCredential, signStatusListCredential } from '@dcv/core/status/credential';
import type { StatusPurpose } from '@dcv/core/vc/types';
import type { Ledger, PublishedStatusList } from './ledger.js';

export interface StatusListDeps {
  ledger: Ledger;
  blobStore: BlobStore;
  publicClient: PublicClient;
  issuerWallet: WalletClient & { account: PrivateKeyAccount };
  issuerKey: Hex;
  issuerDid: string;
  deployments: Deployments;
  issuerPublicUrl: string;
  listSize: number;
  now?: () => number;
}

export const REVOCATION_LIST_ID = 1;
export const REVOCATION_PURPOSE: StatusPurpose = 'revocation';

export class StatusListPublisher {
  constructor(private readonly deps: StatusListDeps) {}

  listUrl(listId: number = REVOCATION_LIST_ID): string {
    return `${this.deps.issuerPublicUrl}/status/${listId}`;
  }

  /** The currently published JWT for a list, if any (served at GET /status/:id). */
  current(listId: number = REVOCATION_LIST_ID): PublishedStatusList | undefined {
    return this.deps.ledger.statusList(listId);
  }

  async chainVersion(listId: number = REVOCATION_LIST_ID): Promise<number> {
    return versionOf(this.deps.publicClient, this.deps.deployments, this.deps.issuerWallet.account.address, listId);
  }

  /** Build the bitstring from the ledger's revoked indices. */
  bitstring(): Bitstring {
    const bits = new Bitstring(this.deps.listSize);
    for (const i of this.deps.ledger.revokedIndices()) bits.set(i, true);
    return bits;
  }

  /** Sign, add to the blob store, anchor on chain, remember in the ledger. */
  async publish(listId: number = REVOCATION_LIST_ID): Promise<PublishedStatusList> {
    const encodedList = await this.bitstring().toEncodedList();
    const cred = buildStatusListCredential({
      issuerDid: this.deps.issuerDid,
      listUrl: this.listUrl(listId),
      purpose: REVOCATION_PURPOSE,
      encodedList,
    });
    const nowSec = this.deps.now ? this.deps.now() : Math.floor(Date.now() / 1000);
    const jwt = await signStatusListCredential(cred, this.deps.issuerKey, nowSec);
    const bytes = stringToBytes(jwt);
    const cid = await this.deps.blobStore.add(bytes);
    const contentHash = keccak256(bytes);
    await publishStatusList(this.deps.issuerWallet, this.deps.publicClient, this.deps.deployments, listId, cid, contentHash, REVOCATION_PURPOSE);
    const version = await this.chainVersion(listId);
    const entry: PublishedStatusList = { listId, version, cid, contentHash, jwt, publishedAt: new Date().toISOString() };
    this.deps.ledger.setStatusList(entry);
    return entry;
  }

  /** Boot policy: publish v1 if the chain has never seen this issuer's list. */
  async ensurePublished(listId: number = REVOCATION_LIST_ID): Promise<PublishedStatusList> {
    const version = await this.chainVersion(listId);
    const known = this.current(listId);
    if (version > 0 && known && known.version === version) return known;
    return this.publish(listId);
  }

  /** Pick a random unused index in the list. */
  allocateIndex(): number {
    const used = this.deps.ledger.usedIndices();
    if (used.size >= this.deps.listSize) throw new Error('status list is full');
    const buf = new Uint32Array(1);
    for (;;) {
      globalThis.crypto.getRandomValues(buf);
      const index = buf[0]! % this.deps.listSize;
      if (!used.has(index)) return index;
    }
  }
}
