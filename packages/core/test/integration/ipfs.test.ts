// Needs a running Kubo (pnpm ipfs). Skips with a clear message otherwise: the
// self-spawned Anvil harness never starts IPFS.
import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../../src/config.js';
import { KuboBlobStore } from '../../src/ipfs/blobStore.js';
import { cidV1Raw } from '../../src/ipfs/cid.js';
import { BackupStore } from '../../src/ipfs/backupStore.js';
import { PlaintextRejected } from '../../src/privacy/opaque.js';

const kubo = new KuboBlobStore({ apiUrl: DEFAULTS.IPFS_API_URL, gatewayUrl: DEFAULTS.IPFS_GATEWAY_URL });
const up = await kubo.isReachable();

describe.skipIf(!up)('Kubo IPFS (live)', () => {
  it('add -> cat round-trips, CID is v1 raw and matches our computation', async () => {
    const bytes = new TextEncoder().encode(`dcv ipfs test ${Date.now()}`);
    const cid = await kubo.add(bytes);
    expect(cid.startsWith('bafkrei')).toBe(true);
    expect(cid).toBe(cidV1Raw(bytes));
    expect([...(await kubo.cat(cid))]).toEqual([...bytes]);
    expect(await kubo.listPinned()).toContain(cid);
  });

  it('gateway serves the blob with CORS *', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
    const cid = await kubo.add(bytes);
    const res = await fetch(kubo.gatewayUrl(cid));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...bytes]);
  });

  it('BackupStore refuses plaintext even against the real node', async () => {
    await expect(new BackupStore(kubo).put(new TextEncoder().encode('{"credentialSubject":1}'))).rejects.toBeInstanceOf(PlaintextRejected);
  });
});

if (!up) console.warn('ipfs.test.ts: Kubo API not reachable at :5001 - run `pnpm ipfs` to exercise the live IPFS tests');
