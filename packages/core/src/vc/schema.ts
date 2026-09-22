import { z } from 'zod';
import { DID_PREFIX, isEthrDid } from '../did/ethr.js';
import { VC_V2_CONTEXT } from './types.js';

const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)) && /\d{4}-\d{2}-\d{2}T/.test(s), {
  message: 'must be an ISO 8601 date-time',
});

const ethrDid = z.string().refine(isEthrDid, { message: `must be a ${DID_PREFIX}<address> DID` });

export const BitstringStatusListEntrySchema = z.object({
  id: z.string().min(1),
  type: z.literal('BitstringStatusListEntry'),
  statusPurpose: z.enum(['revocation', 'suspension']),
  statusListIndex: z.string().regex(/^(0|[1-9]\d*)$/, 'statusListIndex must be a non-negative integer string'),
  statusListCredential: z.url().refine((u) => /\/(0|[1-9]\d*)$/.test(new URL(u).pathname), {
    message: 'statusListCredential must end in the numeric listId',
  }),
});

/** Minimal VCDM 2.0 envelope check, independent of the subject's shape. */
export const CredentialV2Schema = z
  .object({
    '@context': z.array(z.string()).min(1).refine((c) => c[0] === VC_V2_CONTEXT, { message: `@context[0] must be ${VC_V2_CONTEXT}` }),
    id: z.string().min(1),
    type: z.array(z.string()).min(1).refine((t) => t[0] === 'VerifiableCredential', { message: 'type[0] must be VerifiableCredential' }),
    issuer: z.union([ethrDid, z.object({ id: ethrDid, name: z.string().optional() })]),
    validFrom: isoDateTime,
    validUntil: isoDateTime.optional(),
    credentialSubject: z.object({ id: ethrDid }).loose(),
    credentialStatus: BitstringStatusListEntrySchema.optional(),
  })
  .loose();

export const DegreeSubjectSchema = z.object({
  id: ethrDid,
  name: z.string().min(1),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  studentId: z.string().min(1),
  degree: z.object({
    type: z.string().min(1),
    name: z.string().min(1),
    grade: z.string().min(1),
    awardedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
});

export const DegreeCredentialSchema = CredentialV2Schema.extend({
  type: z.array(z.string()).refine((t) => t[0] === 'VerifiableCredential' && t.includes('UniversityDegreeCredential'), {
    message: 'type must be [VerifiableCredential, UniversityDegreeCredential]',
  }),
  credentialSubject: DegreeSubjectSchema,
});

/** Parse the numeric listId out of a statusListCredential URL. */
export function listIdFromStatusUrl(url: string): number {
  const m = /\/(0|[1-9]\d*)$/.exec(new URL(url).pathname);
  if (!m) throw new Error(`statusListCredential has no numeric listId: ${url}`);
  return Number.parseInt(m[1]!, 10);
}
