import { describe, expect, it } from 'vitest';
import { DEFAULT_KDF } from '../../src/vault/kdf.js';
import { Keyring } from '../../src/vault/keyring.js';
import { VaultError } from '../../src/vault/record.js';

// Fast KDF for tests; the defaults are asserted separately.
const FAST = { t: 1, m: 8192 };

describe('Keyring', () => {
  it('creates, locks and unlocks with the right passphrase only', async () => {
    const { keyring, mnemonic, meta } = await Keyring.create('correct horse', { kdf: FAST });
    expect(mnemonic.split(' ')).toHaveLength(12);
    expect(meta.v).toBe(1);
    expect(meta.kdf).toMatchObject({ name: 'argon2id', t: 1, m: 8192, p: 1 });
    expect(meta.defaultDid.startsWith('did:ethr:anvil:0x')).toBe(true);
    const unlocked = await Keyring.unlock(meta, 'correct horse');
    expect((await unlocked.holderAccount('default')).did).toBe(meta.defaultDid);
    expect((await unlocked.holderAccount('default')).did).toBe((await keyring.holderAccount('default')).did);
    await expect(Keyring.unlock(meta, 'wrong')).rejects.toMatchObject({ code: 'BAD_PASSPHRASE' });
  });

  it('uses argon2id t=3, m=32 MiB, p=1 by default', () => {
    expect(DEFAULT_KDF).toEqual({ name: 'argon2id', t: 3, m: 32768, p: 1 });
  });

  it('salts and wraps differently for the same passphrase', async () => {
    const a = await Keyring.create('same', { kdf: FAST });
    const b = await Keyring.create('same', { kdf: FAST });
    expect(a.meta.kdf.salt).not.toBe(b.meta.kdf.salt);
    expect(a.meta.wrappedSeed).not.toBe(b.meta.wrappedSeed);
    expect(a.meta.iv).not.toBe(b.meta.iv);
  });

  it('derives pairwise holder DIDs per issuer that re-derive from the mnemonic', async () => {
    const { keyring, mnemonic } = await Keyring.create('pw', { kdf: FAST });
    const a = await keyring.holderAccount('did:ethr:anvil:0xA');
    const b = await keyring.holderAccount('did:ethr:anvil:0xB');
    const d = await keyring.holderAccount('default');
    expect(a.did).not.toBe(b.did);
    expect(a.did).not.toBe(d.did);
    expect(a.address).not.toBe((await keyring.pointerAccount()).address);
    const { keyring: restored } = await Keyring.fromMnemonic(mnemonic, 'new passphrase', { kdf: FAST });
    expect((await restored.holderAccount('did:ethr:anvil:0xA')).did).toBe(a.did);
    expect((await restored.holderAccount('did:ethr:anvil:0xA')).privateKey).toBe(a.privateKey);
    expect((await restored.pointerAccount()).address).toBe((await keyring.pointerAccount()).address);
  });

  it('lock() drops the seed: every derivation throws LOCKED', async () => {
    const { keyring } = await Keyring.create('pw', { kdf: FAST });
    await keyring.vaultKey();
    keyring.lock();
    expect(keyring.locked).toBe(true);
    await expect(keyring.vaultKey()).rejects.toMatchObject({ code: 'LOCKED' });
    await expect(keyring.holderAccount('default')).rejects.toBeInstanceOf(VaultError);
  });

  it('rejects an invalid mnemonic', async () => {
    await expect(Keyring.fromMnemonic('abandon abandon', 'pw', { kdf: FAST })).rejects.toMatchObject({ code: 'INVALID_MNEMONIC' });
  });
});
