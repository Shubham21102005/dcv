import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

const utf8 = (s: string | Uint8Array): Uint8Array => (typeof s === 'string' ? new TextEncoder().encode(s) : s);

/**
 * HKDF-SHA256 (RFC 5869). Strings are UTF-8 encoded; raw bytes pass through
 * unchanged so the RFC test vectors (non-UTF-8 salt/info) can be reproduced.
 */
export function hkdfSha256(ikm: Uint8Array, salt: string | Uint8Array, info: string | Uint8Array, length: number): Uint8Array {
  return hkdf(sha256, ikm, utf8(salt), utf8(info), length);
}

/** Domain-separation salt for every key derived from a vault seed. */
export const DCV_HKDF_SALT = 'dcv/v1';

export function sha256Bytes(data: string | Uint8Array): Uint8Array {
  return sha256(utf8(data));
}
