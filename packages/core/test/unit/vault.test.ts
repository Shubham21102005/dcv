import { describe, expect, it } from 'vitest';
import { b64u } from '../../src/crypto/base64url.js';
import { Keyring } from '../../src/vault/keyring.js';
import { decryptRecord, encryptRecord, newRecordHeader } from '../../src/vault/record.js';

const FAST = { t: 1, m: 8192 };

describe('AES-GCM vault records', () => {
  it('round-trips a value', async () => {
    const { keyring } = await Keyring.create('pw', FAST);
    const key = await keyring.vaultKey();
    const header = newRecordHeader('credential');
    const rec = await encryptRecord(key, header, { hello: 'world', n: 1 });
    expect(rec.id).toBe(header.id);
    expect(b64u.decode(rec.iv).length).toBe(12);
    expect(await decryptRecord(key, rec)).toEqual({ hello: 'world', n: 1 });
  });

  it('fails when ciphertext is swapped between rows (AAD binds the header)', async () => {
    const { keyring } = await Keyring.create('pw', FAST);
    const key = await keyring.vaultKey();
    const a = await encryptRecord(key, newRecordHeader('credential'), { v: 'a' });
    const b = await encryptRecord(key, newRecordHeader('credential'), { v: 'b' });
    const swapped = { ...a, iv: b.iv, ct: b.ct };
    await expect(decryptRecord(key, swapped)).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
  });

  it('fails when a single ciphertext byte is tampered', async () => {
    const { keyring } = await Keyring.create('pw', FAST);
    const key = await keyring.vaultKey();
    const rec = await encryptRecord(key, newRecordHeader('setting'), { v: 'x' });
    const bytes = b64u.decode(rec.ct);
    bytes[0] = bytes[0]! ^ 0xff;
    await expect(decryptRecord(key, { ...rec, ct: b64u.encode(bytes) })).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
  });

  it('cannot be decrypted with another keyring', async () => {
    const a = await Keyring.create('pw', FAST);
    const b = await Keyring.create('pw', FAST);
    const rec = await encryptRecord(await a.keyring.vaultKey(), newRecordHeader('credential'), { v: 'x' });
    await expect(decryptRecord(await b.keyring.vaultKey(), rec)).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
  });

  it('uses a fresh IV per record', async () => {
    const { keyring } = await Keyring.create('pw', FAST);
    const key = await keyring.vaultKey();
    const h = newRecordHeader('credential');
    const r1 = await encryptRecord(key, h, { v: 1 });
    const r2 = await encryptRecord(key, h, { v: 1 });
    expect(r1.iv).not.toBe(r2.iv);
    expect(r1.ct).not.toBe(r2.ct);
  });
});
