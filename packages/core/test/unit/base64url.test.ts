import { describe, expect, it } from 'vitest';
import { b64u } from '../../src/crypto/base64url.js';
import { randomBytes } from '../../src/crypto/random.js';

describe('base64url', () => {
  it('encodes without padding', () => {
    expect(b64u.encode(new Uint8Array([0, 255, 1, 2]))).toBe('AP8BAg');
  });
  it('decodes unpadded and padded input', () => {
    expect([...b64u.decode('AP8BAg')]).toEqual([0, 255, 1, 2]);
    expect([...b64u.decode('AP8BAg==')]).toEqual([0, 255, 1, 2]);
  });
  it('round-trips random bytes of every length mod 3', () => {
    for (const len of [0, 1, 2, 3, 31, 32, 33, 100]) {
      const bytes = randomBytes(len);
      const s = b64u.encode(bytes);
      expect(s).not.toMatch(/[+/=]/);
      expect([...b64u.decode(s)]).toEqual([...bytes]);
    }
  });
  it('round-trips strings and JSON', () => {
    expect(b64u.decodeToString(b64u.encodeString('héllo ~ world'))).toBe('héllo ~ world');
    expect(b64u.decodeJson(b64u.encodeJson({ a: [1, 'x'] }))).toEqual({ a: [1, 'x'] });
  });
  it('rejects invalid input', () => {
    expect(() => b64u.decode('A')).toThrow();
    expect(() => b64u.decode('AP8B*g')).toThrow();
  });
});

describe('randomBytes', () => {
  it('returns the requested length and differs between calls', () => {
    const a = randomBytes(32);
    const b = randomBytes(32);
    expect(a.length).toBe(32);
    expect(b64u.encode(a)).not.toBe(b64u.encode(b));
  });
});
