// CIDv1 for a single raw block: 0x01 (version) 0x55 (raw codec) + multihash(sha2-256).
// Base32-lower multibase ("b" prefix) -> the familiar `bafkrei…` string. For blobs
// up to 256 KiB added with `--cid-version=1 --raw-leaves` this is exactly what Kubo
// returns, so the in-memory blob store used by tests yields real CIDs.
import { sha256Bytes } from '../crypto/hkdf.js';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

export function base32Lower(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function cidV1Raw(bytes: Uint8Array): string {
  const digest = sha256Bytes(bytes);
  const cid = new Uint8Array(4 + digest.length);
  cid.set([0x01, 0x55, 0x12, 0x20], 0);
  cid.set(digest, 4);
  return `b${base32Lower(cid)}`;
}

export function isCidV1Raw(cid: string): boolean {
  return /^bafkrei[a-z2-7]{52}$/.test(cid);
}
