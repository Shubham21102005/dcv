// Content-addressed blob storage: Kubo (IPFS) over its HTTP RPC API, with an
// in-memory implementation for tests. Both return identical CIDs (see cid.ts).
import { cidV1Raw } from './cid.js';

export interface BlobStore {
  readonly kind: 'kubo' | 'memory';
  /** Add + pin a blob, returning its CIDv1 raw-leaf CID. */
  add(bytes: Uint8Array): Promise<string>;
  /** Fetch a blob by CID (throws if missing). */
  cat(cid: string): Promise<Uint8Array>;
  /** Public read URL for a CID (gateway), if any. */
  gatewayUrl(cid: string): string | null;
  /** CIDs currently pinned (used by the privacy scan). */
  listPinned(): Promise<string[]>;
}

export class MemoryBlobStore implements BlobStore {
  readonly kind = 'memory' as const;
  private readonly blobs = new Map<string, Uint8Array>();

  async add(bytes: Uint8Array): Promise<string> {
    const cid = cidV1Raw(bytes);
    this.blobs.set(cid, new Uint8Array(bytes));
    return cid;
  }

  async cat(cid: string): Promise<Uint8Array> {
    const b = this.blobs.get(cid);
    if (!b) throw new Error(`blob not found: ${cid}`);
    return new Uint8Array(b);
  }

  gatewayUrl(): string | null {
    return null;
  }

  async listPinned(): Promise<string[]> {
    return [...this.blobs.keys()];
  }
}

export interface KuboOptions {
  apiUrl: string;
  gatewayUrl: string;
  fetch?: typeof fetch;
}

/** Minimal Kubo RPC client (POST /api/v0/...); no SDK needed. */
export class KuboBlobStore implements BlobStore {
  readonly kind = 'kubo' as const;
  private readonly apiUrl: string;
  private readonly gateway: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: KuboOptions) {
    this.apiUrl = opts.apiUrl.replace(/\/$/, '');
    this.gateway = opts.gatewayUrl.replace(/\/$/, '');
    this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async isReachable(timeoutMs = 1500): Promise<boolean> {
    try {
      const res = await this.fetchFn(`${this.apiUrl}/api/v0/id`, { method: 'POST', signal: AbortSignal.timeout(timeoutMs) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async add(bytes: Uint8Array): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([bytes as BlobPart]), 'blob');
    const res = await this.fetchFn(`${this.apiUrl}/api/v0/add?cid-version=1&raw-leaves=true&pin=true&hash=sha2-256`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) throw new Error(`ipfs add failed: ${res.status} ${await res.text()}`);
    const text = (await res.text()).trim();
    const last = text.split('\n').pop() ?? '';
    const parsed = JSON.parse(last) as { Hash?: string };
    if (!parsed.Hash) throw new Error(`ipfs add returned no Hash: ${text}`);
    const expected = cidV1Raw(bytes);
    if (bytes.length <= 256 * 1024 && parsed.Hash !== expected) {
      throw new Error(`ipfs add returned ${parsed.Hash}, expected ${expected}`);
    }
    return parsed.Hash;
  }

  async cat(cid: string): Promise<Uint8Array> {
    const res = await this.fetchFn(`${this.apiUrl}/api/v0/cat?arg=${encodeURIComponent(cid)}`, { method: 'POST' });
    if (!res.ok) throw new Error(`ipfs cat ${cid} failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  gatewayUrl(cid: string): string {
    return `${this.gateway}/ipfs/${cid}`;
  }

  async listPinned(): Promise<string[]> {
    const res = await this.fetchFn(`${this.apiUrl}/api/v0/pin/ls?type=recursive`, { method: 'POST' });
    if (!res.ok) throw new Error(`ipfs pin ls failed: ${res.status}`);
    const json = (await res.json()) as { Keys?: Record<string, unknown> };
    return Object.keys(json.Keys ?? {});
  }
}

/** Fetch a blob through the public gateway (what browsers and the verifier use). */
export async function fetchFromGateway(gatewayUrl: string, cid: string, fetchFn: typeof fetch = fetch): Promise<Uint8Array> {
  const res = await fetchFn(`${gatewayUrl.replace(/\/$/, '')}/ipfs/${cid}`);
  if (!res.ok) throw new Error(`gateway ${cid}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
