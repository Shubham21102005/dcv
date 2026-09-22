import { describe, expect, it } from 'vitest';
import { hexToBytes } from 'viem';
import { SECP256K1_N, isValidSecpPrivateKey, secpAddress, secpKeyFromHkdf } from '../../src/crypto/secp.js';

const seed = new Uint8Array(64).fill(42);

describe('secp256k1 key derivation', () => {
  it('derives a 32-byte scalar in (0, n)', () => {
    const key = secpKeyFromHkdf(seed, 'holder-key/default');
    const bytes = hexToBytes(key);
    expect(bytes.length).toBe(32);
    const k = BigInt(key);
    expect(k > 0n && k < SECP256K1_N).toBe(true);
  });

  it('is deterministic for the same info and differs per info', () => {
    expect(secpKeyFromHkdf(seed, 'holder-key/did:ethr:anvil:0xA')).toBe(secpKeyFromHkdf(seed, 'holder-key/did:ethr:anvil:0xA'));
    expect(secpKeyFromHkdf(seed, 'holder-key/did:ethr:anvil:0xA')).not.toBe(secpKeyFromHkdf(seed, 'holder-key/did:ethr:anvil:0xB'));
    expect(secpAddress(secpKeyFromHkdf(seed, 'a'))).not.toBe(secpAddress(secpKeyFromHkdf(seed, 'b')));
  });

  it('validates scalar range', () => {
    expect(isValidSecpPrivateKey(new Uint8Array(32))).toBe(false);
    expect(isValidSecpPrivateKey(new Uint8Array(31).fill(1))).toBe(false);
    const nBytes = hexToBytes(`0x${SECP256K1_N.toString(16).padStart(64, '0')}`);
    expect(isValidSecpPrivateKey(nBytes)).toBe(false);
    const nMinus1 = hexToBytes(`0x${(SECP256K1_N - 1n).toString(16).padStart(64, '0')}`);
    expect(isValidSecpPrivateKey(nMinus1)).toBe(true);
  });
});
