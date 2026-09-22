// Thin client for the verifier API (VITE_VERIFIER_API_URL).
import type { VerificationReport } from '@dcv/core/verifier/report';

export const API_URL: string = (import.meta.env.VITE_VERIFIER_API_URL as string | undefined) ?? 'http://localhost:4002';

export interface RequestSummary {
  id: string;
  state: 'pending' | 'verified' | 'failed';
  credentialType: string;
  claims: string[];
  createdAt: number;
  expiresAt: number;
  walletLink: string;
  url: string;
  ok?: boolean;
  submittedAt?: number;
}

export interface RequestDetail extends RequestSummary {
  request: { nonce: string; aud: string };
  report: VerificationReport | null;
  lab: Partial<Record<AttackKind, VerificationReport>>;
}

export type AttackKind = 'tamper' | 'replay' | 'expire' | 'audience';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${path}`);
  return body;
}

export const api = {
  config: () => call<{ verifierName: string; aud: string; claims: string[]; nonceTtlSeconds: number }>('/config'),
  list: () => call<{ requests: RequestSummary[] }>('/requests'),
  create: (claims: string[]) => call<RequestSummary>('/requests', { method: 'POST', body: JSON.stringify({ credentialType: 'UniversityDegreeCredential', claims }) }),
  get: (id: string) => call<RequestDetail>(`/requests/${id}`),
  lab: (requestId: string, attack: AttackKind) => call<{ attack: AttackKind; report: VerificationReport }>('/lab', { method: 'POST', body: JSON.stringify({ requestId, attack }) }),
  reset: () => call<{ ok: true }>('/admin/reset', { method: 'POST' }),
};
