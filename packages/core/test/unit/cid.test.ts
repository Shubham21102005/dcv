import { describe, expect, it } from 'vitest';
import { base32Lower, cidV1Raw, isCidV1Raw } from '../../src/ipfs/cid.js';
import { MemoryBlobStore } from '../../src/ipfs/blobStore.js';

describe('CIDv1 raw', () => {
  it('base32 matches RFC 4648 vectors (lowercase, no padding)', () => {
    const enc = (s: string) => base32Lower(new TextEncoder().encode(s));
    expect(enc('')).toBe('');
    expect(enc('f')).toBe('my');
    expect(enc('fo')).toBe('mzxq');
    expect(enc('foo')).toBe('mzxw6');
    expect(enc('foobar')).toBe('mzxw6ytboi');
  });

  it('computes the well-known CID of "hello world\n" as a raw block', () => {
    // Verified against Kubo v0.43.1: ipfs add -Q --cid-version=1 --raw-leaves --only-hash (12 bytes incl. newline)
    const cid = cidV1Raw(new TextEncoder().encode('hello world\n'));
    expect(cid).toBe('bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4');
    expect(isCidV1Raw(cid)).toBe(true);
  });

  it('MemoryBlobStore round-trips and lists pins', async () => {
    const store = new MemoryBlobStore();
    const bytes = new TextEncoder().encode('status list');
    const cid = await store.add(bytes);
    expect(cid.startsWith('bafkrei')).toBe(true);
    expect([...(await store.cat(cid))]).toEqual([...bytes]);
    expect(await store.listPinned()).toEqual([cid]);
    await expect(store.cat('bafkreimissing')).rejects.toThrow(/not found/);
  });
});
