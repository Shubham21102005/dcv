import { beforeAll, describe, expect, it } from 'vitest';
import type { VerificationReport } from '@dcv/core/verifier/report';
import { json, makeVerifier, requestAndPresent } from './helpers.js';

const EXPECTED_ROW = { tamper: 'disclosures', replay: 'holderBinding', expire: 'freshness', audience: 'holderBinding' } as const;
const EXPECTED_CODE = { tamper: 'DISCLOSURE_DIGEST_MISMATCH', replay: 'NONCE_REPLAY', expire: 'KB_STALE', audience: 'AUD_MISMATCH' } as const;

describe('verifier-api: attack lab (dry runs on the stored presentation)', () => {
  let v: Awaited<ReturnType<typeof makeVerifier>>;
  let requestId: string;

  beforeAll(async () => {
    v = await makeVerifier();
    const { created, vp } = await requestAndPresent(v.app, v.issued);
    const res = await v.app.request(`/requests/${created.id}/presentation`, json({ vp }));
    expect(((await res.json()) as { state: string }).state).toBe('verified');
    requestId = created.id;
  });

  for (const attack of ['tamper', 'replay', 'expire', 'audience'] as const) {
    it(`${attack}: exactly one red row (${EXPECTED_ROW[attack]} / ${EXPECTED_CODE[attack]})`, async () => {
      const res = await v.app.request('/lab', json({ requestId, attack }));
      expect(res.status).toBe(200);
      const { report } = (await res.json()) as { report: VerificationReport };
      const red = report.checks.filter((c) => !c.ok);
      expect(red.map((c) => c.name)).toEqual([EXPECTED_ROW[attack]]);
      expect(red[0]?.code).toBe(EXPECTED_CODE[attack]);
      expect(report.dryRun).toBe(true);
    });
  }

  it('the real report is untouched by dry runs and a fresh dry run of the original still passes', async () => {
    const stored = (await (await v.app.request(`/requests/${requestId}`)).json()) as { state: string; report: VerificationReport; lab: Record<string, VerificationReport> };
    expect(stored.state).toBe('verified');
    expect(stored.report.ok).toBe(true);
    expect(Object.keys(stored.lab).sort()).toEqual(['audience', 'expire', 'replay', 'tamper']);
  });

  it('validates input', async () => {
    expect((await v.app.request('/lab', json({ requestId, attack: 'nuke' }))).status).toBe(400);
    expect((await v.app.request('/lab', json({ requestId: 'nope', attack: 'tamper' }))).status).toBe(404);
    const { created } = await requestAndPresent(v.app, v.issued);
    expect((await v.app.request('/lab', json({ requestId: created.id, attack: 'tamper' }))).status).toBe(409);
  });
});
