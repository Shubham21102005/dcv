// The privacy invariant, enforced in code: nothing that is not ciphertext may be
// written to public storage by the wallet's backup path.
export class PlaintextRejected extends Error {
  constructor(reason: string) {
    super(`refusing to publish plaintext: ${reason}`);
    this.name = 'PlaintextRejected';
  }
}

/** Markers that only make sense in text (checked when the bytes are valid UTF-8). */
const TEXT_MARKERS = ['credentialSubject', 'did:', 'eyJ'];
/** Long markers safe to search in a binary view (a 8+ char match in random ciphertext is negligible). */
const BINARY_MARKERS = ['credentialSubject', 'did:ethr'];
const COMPACT_SD_JWT = /[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+~/;

/** Throws PlaintextRejected if `bytes` look like JSON, a JWT/SD-JWT, or a DID. */
export function assertOpaque(bytes: Uint8Array): void {
  let text: string | null = null;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = null; // not valid UTF-8 at all: certainly not JSON
  }
  if (text !== null) {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(trimmed);
        throw new PlaintextRejected('decodes as JSON');
      } catch (err) {
        if (err instanceof PlaintextRejected) throw err;
      }
    }
    for (const m of TEXT_MARKERS) if (text.includes(m)) throw new PlaintextRejected(`contains "${m}"`);
    if (COMPACT_SD_JWT.test(text)) throw new PlaintextRejected('looks like a compact SD-JWT');
  }
  // Also check a Latin-1 view: long markers can survive inside "mostly binary" data.
  let latin = '';
  for (let i = 0; i < Math.min(bytes.length, 65536); i++) latin += String.fromCharCode(bytes[i]!);
  for (const m of BINARY_MARKERS) if (latin.includes(m)) throw new PlaintextRejected(`contains "${m}"`);
}
