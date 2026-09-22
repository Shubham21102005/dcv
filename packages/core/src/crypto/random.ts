/** CSPRNG helpers (WebCrypto is global in browsers and Node >= 20). */
export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function randomUuid(): string {
  return globalThis.crypto.randomUUID();
}
