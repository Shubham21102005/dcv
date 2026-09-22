import { describe, expect, it } from 'vitest';
import { bytesToHex, hexToBytes } from 'viem';
import { hkdfSha256, sha256Bytes } from '../../src/crypto/hkdf.js';

describe('HKDF-SHA256', () => {
  it('reproduces RFC 5869 Test Case 1', () => {
    const ikm = hexToBytes('0x0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    const salt = hexToBytes('0x000102030405060708090a0b0c');
    const info = hexToBytes('0xf0f1f2f3f4f5f6f7f8f9');
    const okm = hkdfSha256(ikm, salt, info, 42);
    expect(bytesToHex(okm)).toBe(
      '0x3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    );
  });

  it('string and byte overloads agree for ASCII inputs', () => {
    const ikm = new Uint8Array(32).fill(7);
    const a = hkdfSha256(ikm, 'dcv/v1', 'vault-key', 32);
    const b = hkdfSha256(ikm, new TextEncoder().encode('dcv/v1'), new TextEncoder().encode('vault-key'), 32);
    expect(bytesToHex(a)).toBe(bytesToHex(b));
    expect(a.length).toBe(32);
  });

  it('different info strings give unrelated keys', () => {
    const ikm = new Uint8Array(32).fill(1);
    expect(bytesToHex(hkdfSha256(ikm, 'dcv/v1', 'a', 32))).not.toBe(bytesToHex(hkdfSha256(ikm, 'dcv/v1', 'b', 32)));
  });

  it('sha256 of "abc" matches the FIPS vector', () => {
    expect(bytesToHex(sha256Bytes('abc'))).toBe('0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
