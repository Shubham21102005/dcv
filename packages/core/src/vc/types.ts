// W3C Verifiable Credentials Data Model 2.0 shapes used by the demo.
export const VC_V2_CONTEXT = 'https://www.w3.org/ns/credentials/v2';
export const VC_EXAMPLES_V2_CONTEXT = 'https://www.w3.org/ns/credentials/examples/v2';
export const DEGREE_CREDENTIAL_TYPE = 'UniversityDegreeCredential';

export type StatusPurpose = 'revocation' | 'suspension';

export interface BitstringStatusListEntry {
  id: string;
  type: 'BitstringStatusListEntry';
  statusPurpose: StatusPurpose;
  statusListIndex: string;
  statusListCredential: string;
}

export interface DegreeSubject {
  id: string;
  name: string;
  birthDate: string;
  studentId: string;
  degree: {
    type: string;
    name: string;
    grade: string;
    awardedOn: string;
  };
}

/** The subject fields an issuer types into the form (id is derived from the holder's DID). */
export type DegreeSubjectInput = Omit<DegreeSubject, 'id'>;

export interface CredentialV2<S = Record<string, unknown>> {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string | { id: string; name?: string };
  validFrom: string;
  validUntil?: string;
  credentialSubject: S;
  credentialStatus?: BitstringStatusListEntry;
}

export type DegreeCredential = CredentialV2<DegreeSubject>;

export function issuerIdOf(cred: Pick<CredentialV2, 'issuer'>): string {
  return typeof cred.issuer === 'string' ? cred.issuer : cred.issuer.id;
}
