import { describe, expect, it } from 'vitest';
import { Bitstring, DEFAULT_STATUS_LIST_SIZE } from '../../src/status/bitstring.js';

// The all-zero 131,072-bit list from the W3C Bitstring Status List Recommendation.
const W3C_ALL_ZERO = 'uH4sIAAAAAAAAA-3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAIC3AYbSVKsAQAAA';

describe('Bitstring Status List encoding', () => {
  it('KAT: decodes the W3C all-zero example to 16384 zero bytes', async () => {
    const bits = await Bitstring.fromEncodedList(W3C_ALL_ZERO);
    expect(bits.length).toBe(DEFAULT_STATUS_LIST_SIZE);
    expect(bits.bytes.length).toBe(16384);
    expect(bits.bytes.every((b) => b === 0)).toBe(true);
    expect(bits.setIndices()).toEqual([]);
  });

  it('round-trips an all-zero list and uses the multibase u + gzip magic prefix', async () => {
    const encoded = await new Bitstring().toEncodedList();
    expect(encoded.startsWith('uH4sI')).toBe(true);
    const back = await Bitstring.fromEncodedList(encoded);
    expect(back.bytes.length).toBe(16384);
    expect(back.bytes.every((b) => b === 0)).toBe(true);
  });

  it('sets and clears bits MSB-first and survives encode/decode', async () => {
    const bits = new Bitstring();
    bits.set(42, true);
    expect(bits.get(42)).toBe(true);
    expect(bits.get(41)).toBe(false);
    expect(bits.get(43)).toBe(false);
    expect(bits.bytes[5]).toBe(0b00100000); // bit 42 = byte 5, bit 2 from the MSB
    bits.set(0, true);
    expect(bits.bytes[0]).toBe(0x80);
    const back = await Bitstring.fromEncodedList(await bits.toEncodedList());
    expect(back.setIndices()).toEqual([0, 42]);
    back.set(42, false);
    expect(back.setIndices()).toEqual([0]);
  });

  it('rejects out-of-range indices and bad encodings', async () => {
    const bits = new Bitstring();
    expect(() => bits.set(131072, true)).toThrow(RangeError);
    expect(() => bits.get(-1)).toThrow(RangeError);
    expect(() => bits.get(1.5)).toThrow(RangeError);
    await expect(Bitstring.fromEncodedList('zH4sI')).rejects.toThrow(/prefix "u"/);
    expect(() => new Bitstring(12)).toThrow();
  });
});
