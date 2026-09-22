import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../../src/config.js';
import { MemoryBlobStore } from '../../src/ipfs/blobStore.js';
import { NoTerms, scanForPii, stringLeaves } from '../../src/privacy/scan.js';
import { issueTestCredential } from '../../src/testing/issueTestCredential.js';
import { SAMPLE_DEGREE_SUBJECT } from '../../src/vc/build.js';
import { testClients } from '../helpers.js';

const HOLDER_KEY = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';

describe('privacy scan', () => {
  const { deployments, publicClient, issuerWallet } = testClients();

  it('refuses an empty term list', async () => {
    await expect(scanForPii({ publicClient, terms: [] })).rejects.toBeInstanceOf(NoTerms);
    await expect(scanForPii({ publicClient, terms: ['ab'] })).rejects.toBeInstanceOf(NoTerms); // too short
  });

  it('finds a seeded plaintext leak (proves the scanner works)', async () => {
    const blobStore = new MemoryBlobStore();
    await blobStore.add(new TextEncoder().encode('leaked: Alice Example was here'));
    await blobStore.add(new TextEncoder().encode(`b64: ${Buffer.from('ASU-2026-00042').toString('base64url')}`));
    const r = await scanForPii({ publicClient, blobStore, terms: ['Alice Example', 'ASU-2026-00042', 'nothing-here-xyz'] });
    expect(r.terms).toBe(3);
    expect(r.hits.map((h) => `${h.term}:${h.encoding}`).sort()).toEqual(['ASU-2026-00042:base64url', 'Alice Example:raw']);
    expect(r.blobs).toBe(2);
  });

  it('a real issuance + status list leaves 0 hits over the chain and the blob store', async () => {
    const blobStore = new MemoryBlobStore();
    const issued = await issueTestCredential({ publicClient, issuerWallet, deployments, issuerKey: DEFAULTS.ISSUER_PRIVATE_KEY, holderKey: HOLDER_KEY, blobStore });
    const terms = [...stringLeaves(SAMPLE_DEGREE_SUBJECT), issued.holderDid, issued.holderAddress];
    const r = await scanForPii({ publicClient, blobStore, terms });
    expect(r.terms).toBeGreaterThan(0);
    expect(r.blocks).toBeGreaterThan(1);
    expect(r.blobs).toBeGreaterThan(0);
    expect(r.hits).toEqual([]);
    // the issuer's own (public, organisational) DID IS on chain - that is by design
    const org = await scanForPii({ publicClient, blobStore, terms: [issued.issuerAddress] });
    expect(org.hits.length).toBeGreaterThan(0);
  });
});
