// ES256K-R: secp256k1 over sha256(data) with a recoverable 65-byte r||s||v
// signature (viem convention, v = 27/28). A fresh did:ethr document exposes only
// an address (`blockchainAccountId`), so verification is address recovery.
// Note: "ES256K-R" is a did-jwt convention, not a registered JWA algorithm; our
// wallet and verifier are the two ends of the protocol.
import { bytesToHex, recoverAddress, type Address, type Hex } from 'viem';
import { sign } from 'viem/accounts';
import { b64u } from './base64url.js';
import { sha256Bytes } from './hkdf.js';

export const ES256K_R = 'ES256K-R' as const;

export type Signer = (data: string) => Promise<string>;
export type Verifier = (data: string, signature: string) => Promise<boolean>;

/** Returns a signer producing base64url(65-byte recoverable signature) over sha256(utf8(data)). */
export function createEs256kSigner(privateKey: Hex): Signer {
  return async (data) => {
    const sig = await sign({ hash: bytesToHex(sha256Bytes(data)), privateKey, to: 'bytes' });
    return b64u.encode(sig);
  };
}

/** Recover the signing address from an ES256K-R signature over `data`, or null if malformed. */
export async function recoverEs256kAddress(data: string, signature: string): Promise<Address | null> {
  try {
    const sig = b64u.decode(signature);
    if (sig.length !== 65) return null;
    return await recoverAddress({ hash: bytesToHex(sha256Bytes(data)), signature: sig });
  } catch {
    return null;
  }
}

/** Returns a verifier that accepts only signatures recovering to `expected`. */
export function createAddressVerifier(expected: Address): Verifier {
  return async (data, signature) => {
    const recovered = await recoverEs256kAddress(data, signature);
    return recovered !== null && recovered.toLowerCase() === expected.toLowerCase();
  };
}
