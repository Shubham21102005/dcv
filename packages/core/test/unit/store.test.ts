import { describe, expect, it } from 'vitest';
import { bytesToHex } from 'viem';
import { b64u } from '../../src/crypto/base64url.js';
import { SAMPLE_DEGREE_SUBJECT } from '../../src/vc/build.js';
import { exportVaultFile, parseVaultFile } from '../../src/vault/file.js';
import { Keyring } from '../../src/vault/keyring.js';
import { decryptRecord, encryptRecord, newRecordHeader } from '../../src/vault/record.js';
import { VaultStore } from '../../src/vault/store.js';

const FAST = { t: 1, m: 8192 };
const SECRET_TERMS = ['Alice', 'Alice Example', '2003-04-12', 'ASU-2026-00042', 'First Class Honours'];

function encodings(term: string): string[] {
  const utf8 = new TextEncoder().encode(term);
  return [term, bytesToHex(utf8).slice(2), b64u.encode(utf8)];
}

describe('VaultStore (IndexedDB via fake-indexeddb)', () => {
  it('stolen-device test: raw rows never contain the plaintext in any encoding', async () => {
    const store = new VaultStore('dcv-test-1');
    await store.clear();
    const { keyring, meta } = await Keyring.create('pw', FAST);
    await store.putMeta(meta);
    const key = await keyring.vaultKey();
    const rec = await encryptRecord(key, newRecordHeader('credential'), { credentialSubject: { ...SAMPLE_DEGREE_SUBJECT, id: 'did:ethr:anvil:0x1' } });
    await store.put(rec);

    const raw = await store.dumpRaw();
    expect(raw.length).toBe(2);
    const blob = raw.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n');
    for (const term of SECRET_TERMS) {
      for (const enc of encodings(term)) expect(blob.includes(enc)).toBe(false);
    }

    const listed = await store.list();
    expect(listed).toHaveLength(1);
    const back = await decryptRecord<{ credentialSubject: { name: string } }>(key, listed[0]!);
    expect(back.credentialSubject.name).toBe('Alice Example');
    expect(await store.getMeta()).toEqual(meta);
    await store.delete(rec.id);
    expect(await store.list()).toHaveLength(0);
  });

  it('export -> import -> unlock works', async () => {
    const store = new VaultStore('dcv-test-2');
    await store.clear();
    const { keyring, meta } = await Keyring.create('pw', FAST);
    const key = await keyring.vaultKey();
    await store.putMeta(meta);
    await store.put(await encryptRecord(key, newRecordHeader('credential'), { v: 1 }));
    await store.put(await encryptRecord(key, newRecordHeader('setting'), { v: 2 }));

    const json = JSON.stringify(exportVaultFile((await store.getMeta())!, await store.list()));
    const file = parseVaultFile(json);
    expect(file.records).toHaveLength(2);

    const restore = new VaultStore('dcv-test-3');
    await restore.clear();
    await restore.putMeta(file.meta);
    for (const r of file.records) await restore.put(r);
    const unlocked = await Keyring.unlock((await restore.getMeta())!, 'pw');
    const k2 = await unlocked.vaultKey();
    const values = await Promise.all((await restore.list()).map((r) => decryptRecord<{ v: number }>(k2, r)));
    expect(values.map((v) => v.v).sort()).toEqual([1, 2]);
    expect(() => parseVaultFile('{"v":2}')).toThrow(/not a vault file/);
    expect(() => parseVaultFile('nope')).toThrow(/not JSON/);
  });
});
