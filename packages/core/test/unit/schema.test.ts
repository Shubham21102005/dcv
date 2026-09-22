import { describe, expect, it } from 'vitest';
import { SAMPLE_DEGREE_SUBJECT, buildDegreeCredential } from '../../src/vc/build.js';
import { CredentialV2Schema, DegreeCredentialSchema, listIdFromStatusUrl } from '../../src/vc/schema.js';

const ISSUER = 'did:ethr:anvil:0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const HOLDER = 'did:ethr:anvil:0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

function sample() {
  return buildDegreeCredential({
    issuerDid: ISSUER,
    issuerName: 'Anvil State University',
    holderDid: HOLDER,
    subject: SAMPLE_DEGREE_SUBJECT,
    status: { listUrl: 'http://localhost:4001/status/1', index: 42 },
    now: new Date('2026-09-22T09:00:00Z'),
  });
}

describe('VCDM 2.0 builder + schema', () => {
  it('builds a credential the schema accepts', () => {
    const cred = sample();
    expect(CredentialV2Schema.safeParse(cred).success).toBe(true);
    expect(DegreeCredentialSchema.safeParse(cred).success).toBe(true);
    expect(cred['@context'][0]).toBe('https://www.w3.org/ns/credentials/v2');
    expect(cred.type).toEqual(['VerifiableCredential', 'UniversityDegreeCredential']);
    expect(cred.id.startsWith('urn:uuid:')).toBe(true);
    expect(cred.validFrom).toBe('2026-09-22T09:00:00Z');
    expect(cred.validUntil).toBe('2036-09-22T09:00:00Z');
    expect(cred.credentialSubject.id).toBe(HOLDER);
    expect(cred.credentialStatus).toEqual({
      id: 'http://localhost:4001/status/1#42',
      type: 'BitstringStatusListEntry',
      statusPurpose: 'revocation',
      statusListIndex: '42',
      statusListCredential: 'http://localhost:4001/status/1',
    });
  });

  it('rejects a VCDM 1.1 context', () => {
    const cred = sample();
    cred['@context'][0] = 'https://www.w3.org/2018/credentials/v1';
    expect(CredentialV2Schema.safeParse(cred).success).toBe(false);
  });

  it('rejects a missing validFrom', () => {
    const cred = sample() as unknown as Record<string, unknown>;
    delete cred['validFrom'];
    expect(CredentialV2Schema.safeParse(cred).success).toBe(false);
  });

  it('rejects a numeric statusListIndex', () => {
    const cred = sample();
    (cred.credentialStatus as unknown as { statusListIndex: number }).statusListIndex = 42;
    expect(CredentialV2Schema.safeParse(cred).success).toBe(false);
  });

  it('rejects an unknown statusPurpose', () => {
    const cred = sample();
    (cred.credentialStatus as unknown as { statusPurpose: string }).statusPurpose = 'expired';
    expect(CredentialV2Schema.safeParse(cred).success).toBe(false);
  });

  it('rejects a subject id that is not a did:ethr:anvil DID', () => {
    const cred = sample();
    cred.credentialSubject.id = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
    expect(CredentialV2Schema.safeParse(cred).success).toBe(false);
    expect(DegreeCredentialSchema.safeParse(cred).success).toBe(false);
  });

  it('survives a JSON round trip unchanged', () => {
    const cred = sample();
    expect(JSON.parse(JSON.stringify(cred))).toEqual(cred);
  });

  it('extracts the listId from the status URL', () => {
    expect(listIdFromStatusUrl('http://localhost:4001/status/1')).toBe(1);
    expect(listIdFromStatusUrl('http://localhost:4001/status/17')).toBe(17);
    expect(() => listIdFromStatusUrl('http://localhost:4001/status/abc')).toThrow();
  });
});
