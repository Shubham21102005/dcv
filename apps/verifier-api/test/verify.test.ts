import { beforeAll, describe, expect, it } from 'vitest';
import type { VerificationReport } from '@dcv/core/verifier/report';
import { json, makeVerifier, requestAndPresent } from './helpers.js';

describe('verifier-api: requests and presentations', () => {
  let v: Awaited<ReturnType<typeof makeVerifier>>;
  beforeAll(async () => {
    v = await makeVerifier();
  });

  it('creates a request with nonce/aud/wallet link and serves the public view', async () => {
    const res = await v.app.request('/requests', json({ credentialType: 'UniversityDegreeCredential', claims: ['credentialSubject.degree.name'] }));
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; nonce: string; aud: string; walletLink: string; url: string; state: string };
    expect(created.aud).toBe('http://localhost:4002');
    expect(created.nonce.length).toBeGreaterThan(30);
    expect(created.walletLink.startsWith('http://localhost:5173/#/present?request=')).toBe(true);
    expect(created.url).toBe(`http://localhost:4002/requests/${created.id}/public`);
    const pub = (await (await v.app.request(`/requests/${created.id}/public`)).json()) as Record<string, unknown>;
    expect(pub).toMatchObject({ id: created.id, nonce: created.nonce, aud: created.aud, credentialType: 'UniversityDegreeCredential', claims: ['credentialSubject.degree.name'], verifierName: 'Acme Corp HR', state: 'pending' });
    expect((await (await v.app.request(`/requests/${created.id}`)).json()) as Record<string, unknown>).toMatchObject({ state: 'pending', report: null });
  });

  it('rejects unknown claims and types', async () => {
    expect((await v.app.request('/requests', json({ claims: ['credentialSubject.gpa'] }))).status).toBe(400);
    expect((await v.app.request('/requests', json({ credentialType: 'PassportCredential', claims: [] }))).status).toBe(400);
    expect((await v.app.request('/requests/nope/public')).status).toBe(404);
  });

  it('verifies a valid presentation (8/8) and refuses the same VP again with 409 NONCE_REPLAY', async () => {
    const { created, vp } = await requestAndPresent(v.app, v.issued);
    const res = await v.app.request(`/requests/${created.id}/presentation`, json({ vp }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string; report: VerificationReport };
    expect(body.state).toBe('verified');
    expect(body.report.ok).toBe(true);
    expect(body.report.checks.filter((c) => !c.ok)).toEqual([]);
    expect(body.report.issuerContacted).toBe(false);
    const subject = body.report.disclosed['credentialSubject'] as Record<string, unknown>;
    expect((subject['degree'] as Record<string, unknown>)['name']).toBe('Bachelor of Science in Computer Science');
    expect(subject['name']).toBeUndefined();

    const again = await v.app.request(`/requests/${created.id}/presentation`, json({ vp }));
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: string }).error).toBe('NONCE_REPLAY');

    const stored = (await (await v.app.request(`/requests/${created.id}`)).json()) as { state: string; report: VerificationReport };
    expect(stored.state).toBe('verified');
    expect(stored.report.ok).toBe(true);
    const list = (await (await v.app.request('/requests')).json()) as { requests: Array<{ id: string; state: string }> };
    expect(list.requests.find((r) => r.id === created.id)?.state).toBe('verified');
  });

  it('a failing presentation is stored as failed with the red row', async () => {
    const { created, vp } = await requestAndPresent(v.app, v.issued);
    const tampered = vp.split('~');
    tampered[1] = tampered[1]!.slice(0, 5) + (tampered[1]![5] === 'A' ? 'B' : 'A') + tampered[1]!.slice(6);
    const res = await v.app.request(`/requests/${created.id}/presentation`, json({ vp: tampered.join('~') }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string; report: VerificationReport };
    expect(body.state).toBe('failed');
    expect(body.report.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual(['disclosures']);
  });

  it('POST /admin/reset clears requests', async () => {
    await requestAndPresent(v.app, v.issued);
    expect((await v.app.request('/admin/reset', json(undefined))).status).toBe(200);
    const list = (await (await v.app.request('/requests')).json()) as { requests: unknown[] };
    expect(list.requests).toHaveLength(0);
  });
});
