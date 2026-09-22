import { randomUuid } from '../crypto/random.js';
import {
  DEGREE_CREDENTIAL_TYPE,
  VC_EXAMPLES_V2_CONTEXT,
  VC_V2_CONTEXT,
  type DegreeCredential,
  type DegreeSubjectInput,
  type StatusPurpose,
} from './types.js';

export interface BuildDegreeCredentialOptions {
  issuerDid: string;
  issuerName: string;
  holderDid: string;
  subject: DegreeSubjectInput;
  status: { listUrl: string; index: number; purpose?: StatusPurpose };
  /** Issuance instant (defaults to now). */
  now?: Date;
  /** Validity in years from `now` (default 10). */
  validYears?: number;
}

const TEN_YEARS = 10;

/** Build an (unsigned) UniversityDegreeCredential in VCDM 2.0 form. */
export function buildDegreeCredential(opts: BuildDegreeCredentialOptions): DegreeCredential {
  const now = opts.now ?? new Date();
  const until = new Date(now);
  until.setUTCFullYear(until.getUTCFullYear() + (opts.validYears ?? TEN_YEARS));
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const purpose = opts.status.purpose ?? 'revocation';
  return {
    '@context': [VC_V2_CONTEXT, VC_EXAMPLES_V2_CONTEXT],
    id: `urn:uuid:${randomUuid()}`,
    type: ['VerifiableCredential', DEGREE_CREDENTIAL_TYPE],
    issuer: { id: opts.issuerDid, name: opts.issuerName },
    validFrom: iso(now),
    validUntil: iso(until),
    credentialSubject: {
      id: opts.holderDid,
      name: opts.subject.name,
      birthDate: opts.subject.birthDate,
      studentId: opts.subject.studentId,
      degree: { ...opts.subject.degree },
    },
    credentialStatus: {
      id: `${opts.status.listUrl}#${opts.status.index}`,
      type: 'BitstringStatusListEntry',
      statusPurpose: purpose,
      statusListIndex: String(opts.status.index),
      statusListCredential: opts.status.listUrl,
    },
  };
}

/** The demo subject used by the issuer console's pre-filled form and the tests. */
export const SAMPLE_DEGREE_SUBJECT: DegreeSubjectInput = {
  name: 'Alice Example',
  birthDate: '2003-04-12',
  studentId: 'ASU-2026-00042',
  degree: {
    type: 'BachelorDegree',
    name: 'Bachelor of Science in Computer Science',
    grade: 'First Class Honours',
    awardedOn: '2026-06-30',
  },
};
