import { bytesToHex, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { DCV_HKDF_SALT, hkdfSha256 } from './hkdf.js';

/** secp256k1 group order n. A valid private key k satisfies 0 < k < n. */
export const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

export function isValidSecpPrivateKey(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  const k = BigInt(bytesToHex(bytes));
  return k > 0n && k < SECP256K1_N;
}

/**
 * Derive a secp256k1 private key from a seed and an HKDF info string.
 * The counter is appended to `info` and incremented until the 32 derived
 * bytes are a valid scalar (probability of a retry is ~2^-128, but never
 * hand raw bytes to the curve).
 */
export function secpKeyFromHkdf(seed: Uint8Array, info: string, salt: string = DCV_HKDF_SALT): Hex {
  for (let counter = 0; counter < 256; counter++) {
    const candidate = hkdfSha256(seed, salt, `${info}/${counter}`, 32);
    if (isValidSecpPrivateKey(candidate)) return bytesToHex(candidate);
  }
  throw new Error('could not derive a valid secp256k1 key');
}

export function secpAddress(privateKey: Hex): Address {
  return privateKeyToAccount(privateKey).address;
}
