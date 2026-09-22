// JSON-file ledger for the issuer (data/issuer.json). The subject fields are kept
// server-side only (the issuer legitimately entered them); GET /credentials redacts
// them. The holder DID is stored as sha256 only.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DegreeSubjectInput } from '@dcv/core/vc/types';

export interface SignedPreview {
  header: Record<string, unknown>;
  sdDigests: string[];
  statusListIndex: number;
}

export interface LedgerRow {
  id: string;
  type: string;
  statusListIndex: number;
  revoked: boolean;
  holderDidHash: string;
  issuedAt: string;
  offerId: string;
  subject: DegreeSubjectInput;
  signedPreview: SignedPreview;
}

export interface PublishedStatusList {
  listId: number;
  version: number;
  cid: string;
  contentHash: string;
  jwt: string;
  publishedAt: string;
}

export interface LedgerData {
  v: 1;
  rows: LedgerRow[];
  /** Last published status lists by listId. */
  statusLists: Record<string, PublishedStatusList>;
}

export type RedactedRow = Omit<LedgerRow, 'subject' | 'signedPreview'>;

const EMPTY: LedgerData = { v: 1, rows: [], statusLists: {} };

export class Ledger {
  private data: LedgerData;

  constructor(private readonly file: string) {
    this.data = Ledger.load(file);
  }

  private static load(file: string): LedgerData {
    if (!existsSync(file)) return structuredClone(EMPTY);
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as LedgerData;
      if (parsed.v !== 1 || !Array.isArray(parsed.rows)) return structuredClone(EMPTY);
      parsed.statusLists ??= {};
      return parsed;
    } catch {
      return structuredClone(EMPTY);
    }
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2) + '\n');
    renameSync(tmp, this.file);
  }

  get path(): string {
    return this.file;
  }

  rows(): LedgerRow[] {
    return this.data.rows;
  }

  redactedRows(): RedactedRow[] {
    return this.data.rows.map(({ subject: _s, signedPreview: _p, ...rest }) => rest);
  }

  find(id: string): LedgerRow | undefined {
    return this.data.rows.find((r) => r.id === id);
  }

  add(row: LedgerRow): void {
    if (this.find(row.id)) throw new Error(`duplicate credential id ${row.id}`);
    this.data.rows.push(row);
    this.save();
  }

  setRevoked(id: string, revoked: boolean): LedgerRow {
    const row = this.find(id);
    if (!row) throw new Error(`unknown credential ${id}`);
    row.revoked = revoked;
    this.save();
    return row;
  }

  usedIndices(): Set<number> {
    return new Set(this.data.rows.map((r) => r.statusListIndex));
  }

  revokedIndices(): number[] {
    return this.data.rows.filter((r) => r.revoked).map((r) => r.statusListIndex);
  }

  statusList(listId: number): PublishedStatusList | undefined {
    return this.data.statusLists[String(listId)];
  }

  setStatusList(entry: PublishedStatusList): void {
    this.data.statusLists[String(entry.listId)] = entry;
    this.save();
  }

  /** Wipe everything (demo reset). */
  reset(): void {
    this.data = structuredClone(EMPTY);
    this.save();
  }
}
