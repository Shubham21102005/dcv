/** RFC 4648 §5 base64url without padding. Decoding tolerates padding. */
export const b64u = {
  encode(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s: string): Uint8Array {
    const t = s.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (!/^[A-Za-z0-9+/]*$/.test(t) || t.length % 4 === 1) throw new Error('invalid base64url input');
    const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
  encodeString(s: string): string {
    return b64u.encode(new TextEncoder().encode(s));
  },
  decodeToString(s: string): string {
    return new TextDecoder().decode(b64u.decode(s));
  },
  encodeJson(value: unknown): string {
    return b64u.encodeString(JSON.stringify(value));
  },
  decodeJson<T = unknown>(s: string): T {
    return JSON.parse(b64u.decodeToString(s)) as T;
  },
};
