import type { DisclosureFrame, PresentationFrame } from '@sd-jwt/core';
import type { SdJwtVcPayload } from './instance.js';

/**
 * Which claims become selectively disclosable. Everything else (@context, type,
 * issuer, validity, credentialStatus, cnf, credentialSubject.id, degree.type)
 * stays in the signed payload in clear.
 */
export const degreeFrame: DisclosureFrame<SdJwtVcPayload> = {
  credentialSubject: {
    _sd: ['name', 'birthDate', 'studentId'],
    degree: { _sd: ['name', 'grade', 'awardedOn'] },
  },
};

/** Dot-paths a verifier may request, in the order the wallet shows them. */
export const DISCLOSABLE_CLAIMS = [
  'credentialSubject.name',
  'credentialSubject.birthDate',
  'credentialSubject.studentId',
  'credentialSubject.degree.name',
  'credentialSubject.degree.grade',
  'credentialSubject.degree.awardedOn',
] as const;

export type DisclosableClaim = (typeof DISCLOSABLE_CLAIMS)[number];

/** Build a PresentationFrame from a list of dot-paths (unknown paths are ignored). */
export function presentationFrameFor(claims: readonly string[]): PresentationFrame<SdJwtVcPayload> {
  const frame: Record<string, unknown> = {};
  for (const path of claims) {
    if (!(DISCLOSABLE_CLAIMS as readonly string[]).includes(path)) continue;
    const parts = path.split('.');
    let node = frame;
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i]!;
      if (i === parts.length - 1) {
        node[key] = true;
      } else {
        node[key] = (node[key] as Record<string, unknown> | undefined) ?? {};
        node = node[key] as Record<string, unknown>;
      }
    }
  }
  return frame as PresentationFrame<SdJwtVcPayload>;
}

/** Human labels for the consent screen and the verifier's request builder. */
export const CLAIM_LABELS: Record<DisclosableClaim, string> = {
  'credentialSubject.name': 'Full name',
  'credentialSubject.birthDate': 'Date of birth',
  'credentialSubject.studentId': 'Student ID',
  'credentialSubject.degree.name': 'Degree',
  'credentialSubject.degree.grade': 'Grade',
  'credentialSubject.degree.awardedOn': 'Awarded on',
};
