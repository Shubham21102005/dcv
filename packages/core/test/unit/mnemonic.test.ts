import { describe, expect, it } from 'vitest';
import { bytesToHex } from 'viem';
import { generateMnemonic12, isValidMnemonic, normalizeMnemonic, seedFromMnemonic } from '../../src/crypto/mnemonic.js';

const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('BIP-39 mnemonic', () => {
  it('derives the known seed for the "abandon ... about" vector (empty passphrase)', async () => {
    const seed = await seedFromMnemonic(ABANDON);
    expect(seed.length).toBe(64);
    expect(bytesToHex(seed)).toBe(
      '0x5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4',
    );
  });

  it('generates 12 valid words that differ per call', () => {
    const a = generateMnemonic12();
    const b = generateMnemonic12();
    expect(a.split(' ')).toHaveLength(12);
    expect(isValidMnemonic(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('normalizes whitespace and case', async () => {
    expect(normalizeMnemonic('  Abandon   abandon\nabout ')).toBe('abandon abandon about');
    const seed = await seedFromMnemonic(ABANDON.toUpperCase().replace(/ /g, '   '));
    expect(bytesToHex(seed).startsWith('0x5eb00bbd')).toBe(true);
  });

  it('rejects invalid mnemonics', async () => {
    expect(isValidMnemonic('abandon abandon abandon')).toBe(false);
    expect(isValidMnemonic(ABANDON.replace('about', 'zebra'))).toBe(false);
    await expect(seedFromMnemonic('not a mnemonic at all')).rejects.toThrow(/invalid mnemonic/);
  });
});
