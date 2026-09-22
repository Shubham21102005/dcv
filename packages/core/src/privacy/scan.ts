// Executable privacy invariant: grep every Anvil transaction input, every log and
// every pinned IPFS blob for the real PII terms (raw UTF-8, hex-of-UTF-8 and
// base64url encodings). A "0 hits" result is never vacuous: the term list must be
// non-empty (NoTerms) and the scanner is itself tested with a seeded plaintext hit.
import { bytesToHex, type PublicClient } from 'viem';
import { b64u } from '../crypto/base64url.js';
import type { BlobStore } from '../ipfs/blobStore.js';

export class NoTerms extends Error {
  constructor() {
    super('privacy scan needs at least one term');
    this.name = 'NoTerms';
  }
}

export type Encoding = 'raw' | 'hex' | 'base64url';

export interface ScanHit {
  where: string;
  term: string;
  encoding: Encoding;
}

export interface ScanResult {
  blocks: number;
  txs: number;
  logs: number;
  blobs: number;
  terms: number;
  hits: ScanHit[];
  scannedAt: string;
}

interface Needle {
  term: string;
  encoding: Encoding;
  /** lowercase hex (no 0x) of the bytes to look for inside chain data */
  hexNeedle: string;
  /** the text form to look for inside blobs (latin-1 view) */
  textNeedle: string;
}

function needlesFor(term: string): Needle[] {
  const utf8 = new TextEncoder().encode(term);
  const hexOfUtf8 = bytesToHex(utf8).slice(2).toLowerCase();
  const b64 = b64u.encode(utf8);
  return [
    { term, encoding: 'raw', hexNeedle: hexOfUtf8, textNeedle: term },
    // the term's own hex string appearing as text (e.g. an address written out)
    { term, encoding: 'hex', hexNeedle: bytesToHex(new TextEncoder().encode(hexOfUtf8)).slice(2), textNeedle: hexOfUtf8 },
    { term, encoding: 'base64url', hexNeedle: bytesToHex(new TextEncoder().encode(b64)).slice(2), textNeedle: b64 },
  ];
}

function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

export async function scanForPii(opts: {
  publicClient: PublicClient;
  blobStore?: BlobStore;
  terms: string[];
  /** Extra blobs to scan by CID (e.g. the wallet backup) when listPinned is unavailable. */
  extraCids?: string[];
}): Promise<ScanResult> {
  const terms = [...new Set(opts.terms.map((t) => t.trim()).filter((t) => t.length >= 3))];
  if (terms.length === 0) throw new NoTerms();
  const needles = terms.flatMap(needlesFor);
  const hits: ScanHit[] = [];

  // ---- chain: every transaction input ------------------------------------------------
  const latest = await opts.publicClient.getBlockNumber();
  let txs = 0;
  let skippedBlocks = 0;
  for (let n = 0n; n <= latest; n++) {
    let block;
    try {
      block = await opts.publicClient.getBlock({ blockNumber: n, includeTransactions: true });
    } catch {
      skippedBlocks++; // Anvil can drop block bodies after evm_revert (tests only)
      continue;
    }
    for (const tx of block.transactions) {
      txs++;
      const input = (typeof tx === 'string' ? '' : tx.input).toLowerCase();
      for (const nd of needles) if (input.includes(nd.hexNeedle)) hits.push({ where: `tx ${typeof tx === 'string' ? tx : tx.hash} (block ${n})`, term: nd.term, encoding: nd.encoding });
    }
  }

  // ---- chain: every log --------------------------------------------------------------------
  const logs = await opts.publicClient.getLogs({ fromBlock: 0n, toBlock: 'latest' });
  for (const log of logs) {
    const hay = `${log.data}${log.topics.join('')}`.toLowerCase();
    for (const nd of needles) if (hay.includes(nd.hexNeedle)) hits.push({ where: `log ${log.transactionHash} #${log.logIndex}`, term: nd.term, encoding: nd.encoding });
  }

  // ---- ipfs: every pinned blob --------------------------------------------------------------
  let blobs = 0;
  if (opts.blobStore) {
    const cids = new Set([...(await opts.blobStore.listPinned()), ...(opts.extraCids ?? [])]);
    for (const cid of cids) {
      let bytes: Uint8Array;
      try {
        bytes = await opts.blobStore.cat(cid);
      } catch {
        continue; // not a raw block we can read (directory node etc.)
      }
      blobs++;
      const view = latin1(bytes);
      for (const nd of needles) if (view.includes(nd.textNeedle)) hits.push({ where: `ipfs ${cid}`, term: nd.term, encoding: nd.encoding });
    }
  }

  return { blocks: Number(latest) + 1 - skippedBlocks, txs, logs: logs.length, blobs, terms: terms.length, hits, scannedAt: new Date().toISOString() };
}

/** Every string leaf of an object (used to build the term list from ledger subjects). */
export function stringLeaves(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringLeaves(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value as Record<string, unknown>)) stringLeaves(v, out);
  return out;
}
