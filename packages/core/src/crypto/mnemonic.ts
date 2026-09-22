import { generateMnemonic, mnemonicToSeed, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

/** 12 English words = 128 bits of entropy. */
export function generateMnemonic12(): string {
  return generateMnemonic(wordlist, 128);
}

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(normalizeMnemonic(mnemonic), wordlist);
}

export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().split(/\s+/).join(' ');
}

/** BIP-39 seed (64 bytes) with an empty passphrase. */
export async function seedFromMnemonic(mnemonic: string): Promise<Uint8Array> {
  const m = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(m, wordlist)) throw new Error('invalid mnemonic');
  return mnemonicToSeed(m, '');
}
