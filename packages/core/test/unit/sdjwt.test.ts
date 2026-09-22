import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { DEFAULTS } from '../../src/config.js';
import { addressToDid } from '../../src/did/ethr.js';
import { peekSdJwt } from '../../src/sdjwt/decode.js';
import { issueSdJwtVc } from '../../src/sdjwt/issue.js';
import { presentSdJwtVc } from '../../src/sdjwt/present.js';
import { verifyIssuedSdJwtVc, verifySdJwtVc } from '../../src/sdjwt/verify.js';
import { presentationFrameFor } from '../../src/sdjwt/frames.js';
import { SAMPLE_DEGREE_SUBJECT, buildDegreeCredential } from '../../src/vc/build.js';
import { CredentialV2Schema } from '../../src/vc/schema.js';

const ISSUER_KEY = DEFAULTS.ISSUER_PRIVATE_KEY; // Anvil #1
const HOLDER_KEY = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6'; // Anvil #3
const OTHER_KEY = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a'; // Anvil #4
const issuerAddress = privateKeyToAccount(ISSUER_KEY).address;
const holderAddress = privateKeyToAccount(HOLDER_KEY).address;
const issuerDid = addressToDid(issuerAddress);
const holderDid = addressToDid(holderAddress);
const NOW = 1_790_000_000;

async function issued(now = NOW) {
  const credential = buildDegreeCredential({
    issuerDid,
    issuerName: 'Anvil State University',
    holderDid,
    subject: SAMPLE_DEGREE_SUBJECT,
    status: { listUrl: 'http://localhost:4001/status/1', index: 42 },
    now: new Date(now * 1000),
  });
  return issueSdJwtVc({ issuerKey: ISSUER_KEY, issuerDid, credential, holderDid, now });
}

describe('SD-JWT VC issue / present / verify', () => {
  it('(1) issues vc+sd-jwt with digests instead of the disclosable claims', async () => {
    const sdJwt = await issued();
    const peek = await peekSdJwt(sdJwt);
    expect(peek.header['typ']).toBe('vc+sd-jwt');
    expect(peek.header['cty']).toBe('vc');
    expect(peek.header['alg']).toBe('ES256K-R');
    expect(peek.header['kid']).toBe(`${issuerDid}#controller`);
    expect((peek.payload as Record<string, unknown>)['_sd_alg']).toBe('sha-256');
    expect(peek.iss).toBe(issuerDid);
    expect(peek.cnfKid).toBe(`${holderDid}#controller`);
    const subject = peek.payload.credentialSubject as unknown as Record<string, unknown>;
    expect(subject['name']).toBeUndefined();
    expect(Array.isArray(subject['_sd'])).toBe(true);
    expect(subject['id']).toBe(holderDid);
    expect(peek.payload.credentialStatus?.statusListIndex).toBe('42');
    expect(peek.disclosures.map((d) => d.key).sort()).toEqual(['awardedOn', 'birthDate', 'grade', 'name', 'name', 'studentId']);
    expect(peek.disclosures.some((d) => d.key === 'name' && d.value === 'Alice Example')).toBe(true);
    // resolved claims are a valid VCDM 2.0 credential again
    expect(CredentialV2Schema.safeParse(peek.claims).success).toBe(true);
    expect(peek.undisclosedDigests).toHaveLength(0);
    // the wallet's own check: issuer signature + iat, no KB yet
    await expect(verifyIssuedSdJwtVc(sdJwt, { now: NOW })).resolves.toBeTruthy();
  });

  it('(2) presents only degree.name with a KB-JWT that verifies', async () => {
    const sdJwt = await issued();
    const vp = await presentSdJwtVc({ holderKey: HOLDER_KEY, sdJwt, disclose: ['credentialSubject.degree.name'], kb: { aud: 'a1', nonce: 'n1' }, now: NOW });
    const r = await verifySdJwtVc(vp, { issuerAddress, holderAddress, nonce: 'n1', aud: 'a1', kbMaxAgeSeconds: 300, now: NOW });
    expect(r.kb?.payload['nonce']).toBe('n1');
    expect(r.kb?.payload['aud']).toBe('a1');
    expect(r.kb?.header['typ']).toBe('kb+jwt');
    expect(typeof r.kb?.payload['sd_hash']).toBe('string');
    const peek = await peekSdJwt(vp);
    const subject = peek.claims['credentialSubject'] as Record<string, unknown>;
    expect((subject['degree'] as Record<string, unknown>)['name']).toBe('Bachelor of Science in Computer Science');
    expect(subject['birthDate']).toBeUndefined();
    expect(subject['name']).toBeUndefined();
    expect(peek.disclosures).toHaveLength(1);
    expect(peek.undisclosedDigests).toHaveLength(5);
    expect(peek.kbJwt).toBeDefined();
  });

  it('(3) rejects a wrong nonce and (5) a KB-JWT signed by another key', async () => {
    const sdJwt = await issued();
    const vp = await presentSdJwtVc({ holderKey: HOLDER_KEY, sdJwt, disclose: ['credentialSubject.degree.name'], kb: { aud: 'a1', nonce: 'n1' }, now: NOW });
    await expect(verifySdJwtVc(vp, { issuerAddress, holderAddress, nonce: 'n2', aud: 'a1', now: NOW })).rejects.toThrow();
    const forged = await presentSdJwtVc({ holderKey: OTHER_KEY, sdJwt, disclose: ['credentialSubject.degree.name'], kb: { aud: 'a1', nonce: 'n1' }, now: NOW });
    await expect(verifySdJwtVc(forged, { issuerAddress, holderAddress, nonce: 'n1', aud: 'a1', now: NOW })).rejects.toThrow();
  });

  it('(4) rejects a tampered disclosure', async () => {
    const sdJwt = await issued();
    const vp = await presentSdJwtVc({ holderKey: HOLDER_KEY, sdJwt, disclose: ['credentialSubject.degree.name'], kb: { aud: 'a1', nonce: 'n1' }, now: NOW });
    const parts = vp.split('~');
    const disclosure = parts[1]!;
    const flipped = disclosure.slice(0, 5) + (disclosure[5] === 'A' ? 'B' : 'A') + disclosure.slice(6);
    parts[1] = flipped;
    await expect(verifySdJwtVc(parts.join('~'), { issuerAddress, holderAddress, nonce: 'n1', aud: 'a1', now: NOW })).rejects.toThrow();
  });

  it('(6) verifies a presentation with zero disclosures', async () => {
    const sdJwt = await issued();
    const vp = await presentSdJwtVc({ holderKey: HOLDER_KEY, sdJwt, disclose: [], kb: { aud: 'a1', nonce: 'n1' }, now: NOW });
    const r = await verifySdJwtVc(vp, { issuerAddress, holderAddress, nonce: 'n1', aud: 'a1', now: NOW });
    expect(r.payload.credentialSubject.id).toBe(holderDid);
    const peek = await peekSdJwt(vp);
    expect(peek.disclosures).toHaveLength(0);
    expect(peek.undisclosedDigests).toHaveLength(6);
  });

  it('(7) enforces KB-JWT max age relative to currentDate', async () => {
    const sdJwt = await issued();
    const vp = await presentSdJwtVc({ holderKey: HOLDER_KEY, sdJwt, disclose: ['credentialSubject.degree.name'], kb: { aud: 'a1', nonce: 'n1' }, now: NOW });
    await expect(
      verifySdJwtVc(vp, { issuerAddress, holderAddress, nonce: 'n1', aud: 'a1', kbMaxAgeSeconds: 300, now: NOW + 3600 }),
    ).rejects.toThrow();
    await expect(
      verifySdJwtVc(vp, { issuerAddress, holderAddress, nonce: 'n1', aud: 'a1', kbMaxAgeSeconds: 300, now: NOW }),
    ).resolves.toBeTruthy();
  });

  it('rejects an issuer signature from the wrong address', async () => {
    const sdJwt = await issued();
    const vp = await presentSdJwtVc({ holderKey: HOLDER_KEY, sdJwt, disclose: [], kb: { aud: 'a1', nonce: 'n1' }, now: NOW });
    await expect(verifySdJwtVc(vp, { issuerAddress: holderAddress, holderAddress, nonce: 'n1', aud: 'a1', now: NOW })).rejects.toThrow();
  });

  it('builds presentation frames from dot-paths and ignores unknown ones', () => {
    expect(presentationFrameFor(['credentialSubject.degree.name', 'credentialSubject.name', 'credentialSubject.gpa'])).toEqual({
      credentialSubject: { name: true, degree: { name: true } },
    });
    expect(presentationFrameFor([])).toEqual({});
  });
});
