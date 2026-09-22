import { describe, expect, it } from 'vitest';
import { Keyring } from '../../src/vault/keyring.js';
import { PlaintextRejected, assertOpaque } from '../../src/privacy/opaque.js';
import { BackupStore, decryptLocator, encryptLocator } from '../../src/ipfs/backupStore.js';
import { MemoryBlobStore } from '../../src/ipfs/blobStore.js';
import { encryptRecord, newRecordHeader } from '../../src/vault/record.js';
import { hexToBytes } from 'viem';

const FAST = { t: 1, m: 8192 };
const utf8 = (s: string) => new TextEncoder().encode(s);

describe('assertOpaque', () => {
  it('rejects JSON, SD-JWTs, JWTs and DIDs', () => {
    expect(() => assertOpaque(utf8('{"credentialSubject":{"name":"Alice"}}'))).toThrow(PlaintextRejected);
    expect(() => assertOpaque(utf8('[1,2,3]'))).toThrow(PlaintextRejected);
    expect(() => assertOpaque(utf8('eyJhbGciOiJFUzI1NksifQ.eyJpc3MiOiJ4In0.sig~WyJzYWx0Il0~'))).toThrow(PlaintextRejected);
    expect(() => assertOpaque(utf8('hello did:ethr:anvil:0xabc'))).toThrow(/did:/);
    const mixed = new Uint8Array([0, 255, 3, ...utf8('credentialSubject'), 9, 200]);
    expect(() => assertOpaque(mixed)).toThrow(PlaintextRejected);
  });

  it('accepts AES-GCM output and random bytes', async () => {
    const { keyring } = await Keyring.create('pw', { kdf: FAST });
    const key = await keyring.backupKey();
    const store = new BackupStore(new MemoryBlobStore());
    const rec = await encryptRecord(await keyring.vaultKey(), newRecordHeader('credential'), { credentialSubject: { name: 'Alice' } });
    const { cid, bytes } = await store.backup(key, [rec]);
    expect(cid.startsWith('bafkrei')).toBe(true);
    expect(bytes).toBeGreaterThan(28);
    // and the guard itself refuses plaintext through the same path
    await expect(store.put(utf8(JSON.stringify(rec)))).rejects.toBeInstanceOf(PlaintextRejected);
    const back = await store.restore(key, cid);
    expect(back.records).toEqual([rec]);
  });

  it('locator round-trips and is opaque', async () => {
    const { keyring } = await Keyring.create('pw', { kdf: FAST });
    const key = await keyring.backupKey();
    const locator = await encryptLocator(key, 'bafkreiabc');
    expect(hexToBytes(locator).length).toBeLessThanOrEqual(512);
    expect(await decryptLocator(key, locator)).toBe('bafkreiabc');
    const other = await (await Keyring.create('pw', { kdf: FAST })).keyring.backupKey();
    await expect(decryptLocator(other, locator)).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
  });
});
