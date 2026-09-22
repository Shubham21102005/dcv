import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { b64u } from '../../src/crypto/base64url.js';
import { createAddressVerifier, createEs256kSigner, recoverEs256kAddress } from '../../src/crypto/es256k.js';
import { DEFAULTS } from '../../src/config.js';

const KEY_1 = DEFAULTS.ISSUER_PRIVATE_KEY; // Anvil #1
const KEY_2 = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'; // Anvil #2
const acct1 = privateKeyToAccount(KEY_1).address;
const acct2 = privateKeyToAccount(KEY_2).address;

describe('ES256K-R sign / recover', () => {
  it('produces a 65-byte recoverable signature that recovers to the signer', async () => {
    const sig = await createEs256kSigner(KEY_1)('hello.world');
    expect(b64u.decode(sig).length).toBe(65);
    expect(await recoverEs256kAddress('hello.world', sig)).toBe(acct1);
    expect(await createAddressVerifier(acct1)('hello.world', sig)).toBe(true);
    expect(await createAddressVerifier(acct2)('hello.world', sig)).toBe(false);
  });

  it('rejects a flipped byte and wrong data', async () => {
    const sig = await createEs256kSigner(KEY_1)('data');
    const bytes = b64u.decode(sig);
    bytes[10] = bytes[10]! ^ 0x01;
    expect(await createAddressVerifier(acct1)('data', b64u.encode(bytes))).toBe(false);
    expect(await createAddressVerifier(acct1)('data2', sig)).toBe(false);
  });

  it('returns null for malformed signatures instead of throwing', async () => {
    expect(await recoverEs256kAddress('x', 'AAAA')).toBeNull();
    expect(await recoverEs256kAddress('x', '***')).toBeNull();
    expect(await createAddressVerifier(acct1)('x', '')).toBe(false);
  });
});
