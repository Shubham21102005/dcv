// Verifier API (Acme Corp HR): publishes presentation requests, runs the 8-check
// pipeline on submissions, keeps reports, and offers a dry-run attack lab.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Resolver } from 'did-resolver';
import type { PublicClient } from 'viem';
import type { Deployments } from '@dcv/core/chain/deployments';
import { DISCLOSABLE_CLAIMS } from '@dcv/core/sdjwt/frames';
import { peekSdJwt } from '@dcv/core/sdjwt/decode';
import { DEGREE_CREDENTIAL_TYPE } from '@dcv/core/vc/types';
import { verifyPresentation, type PipelineDeps } from '@dcv/core/verifier/pipeline';
import type { VerificationReport } from '@dcv/core/verifier/report';
import { MemoryNonceStore, createPresentationRequest, type PresentationRequest } from '@dcv/core/verifier/request';
import type { StatusListFetcher } from '@dcv/core/verifier/statusFetch';

export interface VerifierConfig {
  verifierName: string;
  verifierPublicUrl: string;
  walletUrl: string;
  verifierWebUrl: string;
  issuerPublicUrl: string;
  rpcUrl: string;
  nonceTtlSeconds: number;
  kbMaxAgeSeconds: number;
}

export interface VerifierDeps {
  config: VerifierConfig;
  deployments: Deployments;
  publicClient: PublicClient;
  resolver: Resolver;
  fetchStatusList: StatusListFetcher;
  now?: () => number;
}

export type AttackKind = 'tamper' | 'replay' | 'expire' | 'audience';
export const ATTACKS: AttackKind[] = ['tamper', 'replay', 'expire', 'audience'];

interface StoredRequest {
  request: PresentationRequest;
  state: 'pending' | 'verified' | 'failed';
  vp?: string;
  report?: VerificationReport;
  submittedAt?: number;
  lab: Partial<Record<AttackKind, VerificationReport>>;
}

export function createVerifierApp(deps: VerifierDeps) {
  const { config } = deps;
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  const nonces = new MemoryNonceStore(now);
  const requests = new Map<string, StoredRequest>();

  const pipelineDeps = (over: Partial<PipelineDeps> = {}): PipelineDeps => ({
    publicClient: deps.publicClient,
    resolver: deps.resolver,
    deployments: deps.deployments,
    nonces,
    fetchStatusList: deps.fetchStatusList,
    rpcUrl: config.rpcUrl,
    issuerPublicUrl: config.issuerPublicUrl,
    kbMaxAgeSeconds: config.kbMaxAgeSeconds,
    now: now(),
    ...over,
  });

  const publicUrl = (id: string) => `${config.verifierPublicUrl}/requests/${id}/public`;
  const walletLink = (id: string) => `${config.walletUrl}/#/present?request=${encodeURIComponent(publicUrl(id))}`;
  const summary = (s: StoredRequest) => ({
    id: s.request.id,
    state: s.state,
    credentialType: s.request.credentialType,
    claims: s.request.claims,
    createdAt: s.request.createdAt,
    expiresAt: s.request.expiresAt,
    walletLink: walletLink(s.request.id),
    url: publicUrl(s.request.id),
    ok: s.report?.ok,
    submittedAt: s.submittedAt,
  });

  const app = new Hono();
  app.use('*', cors({ origin: [config.walletUrl, config.verifierWebUrl], allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type'] }));

  app.get('/health', (c) => c.json({ ok: true, verifier: config.verifierName, aud: config.verifierPublicUrl, requests: requests.size, pid: process.pid }));
  app.get('/config', (c) =>
    c.json({ verifierName: config.verifierName, aud: config.verifierPublicUrl, walletUrl: config.walletUrl, claims: DISCLOSABLE_CLAIMS, credentialTypes: [DEGREE_CREDENTIAL_TYPE], nonceTtlSeconds: config.nonceTtlSeconds }),
  );

  app.get('/requests', (c) => c.json({ requests: [...requests.values()].map(summary).sort((a, b) => b.createdAt - a.createdAt) }));

  app.post('/requests', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { credentialType?: string; claims?: unknown } | null;
    const credentialType = body?.credentialType ?? DEGREE_CREDENTIAL_TYPE;
    if (credentialType !== DEGREE_CREDENTIAL_TYPE) return c.json({ error: `unsupported credentialType ${credentialType}` }, 400);
    const claims = Array.isArray(body?.claims) ? body!.claims.filter((x): x is string => typeof x === 'string') : [];
    const unknown = claims.filter((x) => !(DISCLOSABLE_CLAIMS as readonly string[]).includes(x));
    if (unknown.length) return c.json({ error: `unknown claims: ${unknown.join(', ')}` }, 400);
    const request = createPresentationRequest({ aud: config.verifierPublicUrl, credentialType, claims, ttlSeconds: config.nonceTtlSeconds, now: now() });
    nonces.issue(request.id, request.nonce, config.nonceTtlSeconds);
    requests.set(request.id, { request, state: 'pending', lab: {} });
    return c.json({ ...summary(requests.get(request.id)!), nonce: request.nonce, aud: request.aud }, 201);
  });

  app.get('/requests/:id/public', (c) => {
    const s = requests.get(c.req.param('id'));
    if (!s) return c.json({ error: 'unknown request' }, 404);
    return c.json({
      id: s.request.id,
      nonce: s.request.nonce,
      aud: s.request.aud,
      credentialType: s.request.credentialType,
      claims: s.request.claims,
      expiresAt: s.request.expiresAt,
      verifierName: config.verifierName,
      submitUrl: `${config.verifierPublicUrl}/requests/${s.request.id}/presentation`,
      state: s.state,
    });
  });

  app.get('/requests/:id', (c) => {
    const s = requests.get(c.req.param('id'));
    if (!s) return c.json({ error: 'unknown request' }, 404);
    return c.json({ ...summary(s), request: { ...s.request }, report: s.report ?? null, lab: s.lab });
  });

  app.post('/requests/:id/presentation', async (c) => {
    const s = requests.get(c.req.param('id'));
    if (!s) return c.json({ error: 'unknown request' }, 404);
    const body = (await c.req.json().catch(() => null)) as { vp?: string } | null;
    if (!body || typeof body.vp !== 'string' || !body.vp) return c.json({ error: 'vp (SD-JWT presentation) required' }, 400);
    const report = await verifyPresentation(body.vp, s.request, pipelineDeps());
    const replay = report.checks.find((ch) => ch.name === 'holderBinding')?.code === 'NONCE_REPLAY';
    if (replay) return c.json({ error: 'NONCE_REPLAY', report }, 409);
    s.vp = body.vp;
    s.report = report;
    s.state = report.ok ? 'verified' : 'failed';
    s.submittedAt = now();
    s.lab = {};
    return c.json({ state: s.state, report });
  });

  app.post('/lab', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { requestId?: string; attack?: string } | null;
    const s = body?.requestId ? requests.get(body.requestId) : undefined;
    if (!s) return c.json({ error: 'unknown request' }, 404);
    if (!s.vp) return c.json({ error: 'no presentation submitted for this request yet' }, 409);
    const attack = body?.attack as AttackKind;
    if (!ATTACKS.includes(attack)) return c.json({ error: `attack must be one of ${ATTACKS.join(', ')}` }, 400);

    let vp = s.vp;
    let request = s.request;
    const over: Partial<PipelineDeps> = { dryRun: true };
    if (attack === 'tamper') {
      const parts = vp.split('~');
      if (parts.length < 3) return c.json({ error: 'presentation has no disclosure to tamper with' }, 409);
      const d = parts[1]!;
      parts[1] = d.slice(0, 5) + (d[5] === 'A' ? 'B' : 'A') + d.slice(6);
      vp = parts.join('~');
    } else if (attack === 'replay') {
      over.simulateConsumedNonce = true;
    } else if (attack === 'expire') {
      const peek = await peekSdJwt(s.vp);
      const iat = typeof peek.kbJwt?.payload['iat'] === 'number' ? (peek.kbJwt.payload['iat'] as number) : now();
      over.now = iat + 3600;
      // keep the request itself "alive" so only the KB age trips (one row)
      request = { ...request, expiresAt: iat + 7200 };
    } else if (attack === 'audience') {
      request = { ...request, aud: 'http://evil.example' };
    }
    const report = await verifyPresentation(vp, request, pipelineDeps(over));
    s.lab[attack] = report;
    return c.json({ attack, report });
  });

  app.post('/admin/reset', (c) => {
    requests.clear();
    nonces.clear();
    return c.json({ ok: true });
  });

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: err.message }, 500);
  });

  return { app, requests, nonces };
}
