// W3C Bitstring Status List v1.0 - the bitstring itself.
// encodedList = multibase 'u' + base64url-nopad( GZIP( bytes ) ), MSB-first bit order.
import { b64u } from '../crypto/base64url.js';

/** Spec minimum: 131,072 bits = 16 KiB, so a single revoked index hides among many. */
export const DEFAULT_STATUS_LIST_SIZE = 131_072;

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export class Bitstring {
  readonly bytes: Uint8Array;

  constructor(lengthBits: number = DEFAULT_STATUS_LIST_SIZE, bytes?: Uint8Array) {
    if (lengthBits <= 0 || lengthBits % 8 !== 0) throw new Error('bitstring length must be a positive multiple of 8');
    this.bytes = bytes ?? new Uint8Array(lengthBits / 8);
    if (this.bytes.length * 8 !== lengthBits) throw new Error('bitstring bytes do not match length');
  }

  get length(): number {
    return this.bytes.length * 8;
  }

  private check(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) throw new RangeError(`bit index ${index} out of range [0, ${this.length})`);
  }

  get(index: number): boolean {
    this.check(index);
    return (this.bytes[index >> 3]! & (0x80 >> (index & 7))) !== 0;
  }

  set(index: number, value: boolean): void {
    this.check(index);
    const mask = 0x80 >> (index & 7);
    if (value) this.bytes[index >> 3]! |= mask;
    else this.bytes[index >> 3]! &= ~mask & 0xff;
  }

  /** Indices currently set to 1. */
  setIndices(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.length; i++) if (this.get(i)) out.push(i);
    return out;
  }

  async toEncodedList(): Promise<string> {
    return `u${b64u.encode(await gzip(this.bytes))}`;
  }

  static async fromEncodedList(encoded: string): Promise<Bitstring> {
    if (!encoded.startsWith('u')) throw new Error('encodedList must be multibase base64url (prefix "u")');
    const bytes = await gunzip(b64u.decode(encoded.slice(1)));
    return new Bitstring(bytes.length * 8, bytes);
  }

  clone(): Bitstring {
    return new Bitstring(this.length, new Uint8Array(this.bytes));
  }
}
