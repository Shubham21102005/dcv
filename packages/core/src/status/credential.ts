// BitstringStatusListCredential (VCDM 2.0) secured as `application/vc+jwt`.
import type { Address, Hex } from 'viem';
import { ES256K_R, createAddressVerifier, createEs256kSigner } from '../crypto/es256k.js';
import { decodeJws, signJws, verifyJws } from '../crypto/jws.js';
import { controllerKeyId } from '../did/ethr.js';
import { VC_JWT_TYP } from '../sdjwt/instance.js';
import { VC_V2_CONTEXT, type StatusPurpose } from '../vc/types.js';
import { Bitstring } from './bitstring.js';

export type StatusListCredential = {
  '@context': string[];
  id: string;
  type: ['VerifiableCredential', 'BitstringStatusListCredential'];
  issuer: string;
  validFrom: string;
  credentialSubject: {
    id: string;
    type: 'BitstringStatusList';
    statusPurpose: StatusPurpose;
    encodedList: string;
  };
};

export type StatusListJwtPayload = StatusListCredential & { iss: string; iat: number };

export function buildStatusListCredential(opts: {
  issuerDid: string;
  listUrl: string;
  purpose: StatusPurpose;
  encodedList: string;
  now?: Date;
}): StatusListCredential {
  const now = (opts.now ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return {
    '@context': [VC_V2_CONTEXT],
    id: opts.listUrl,
    type: ['VerifiableCredential', 'BitstringStatusListCredential'],
    issuer: opts.issuerDid,
    validFrom: now,
    credentialSubject: {
      id: `${opts.listUrl}#list`,
      type: 'BitstringStatusList',
      statusPurpose: opts.purpose,
      encodedList: opts.encodedList,
    },
  };
}

export async function signStatusListCredential(cred: StatusListCredential, issuerKey: Hex, now?: number): Promise<string> {
  const payload: StatusListJwtPayload = { ...cred, iss: cred.issuer, iat: now ?? Math.floor(Date.now() / 1000) };
  return signJws({ alg: ES256K_R, typ: VC_JWT_TYP, cty: 'vc', kid: controllerKeyId(cred.issuer) }, payload, createEs256kSigner(issuerKey));
}

export function decodeStatusListCredential(jwt: string): { header: Record<string, unknown>; payload: StatusListJwtPayload } {
  const d = decodeJws<StatusListJwtPayload>(jwt);
  return { header: d.header, payload: d.payload };
}

export async function verifyStatusListSignature(jwt: string, issuerAddress: Address): Promise<boolean> {
  return (await verifyJws(jwt, createAddressVerifier(issuerAddress))).ok;
}

/**
 * Read one bit from a signed status list. Does NOT verify the signature - the
 * caller (pipeline) does that with the issuer address it resolved itself.
 */
export async function readStatusBit(statusJwt: string, index: number, purpose: StatusPurpose): Promise<{ revoked: boolean; listSize: number }> {
  const { payload } = decodeStatusListCredential(statusJwt);
  const subject = payload.credentialSubject;
  if (!subject || subject.type !== 'BitstringStatusList') throw new Error('not a BitstringStatusListCredential');
  if (subject.statusPurpose !== purpose) throw new Error(`status purpose mismatch: list is "${subject.statusPurpose}", entry wants "${purpose}"`);
  const bits = await Bitstring.fromEncodedList(subject.encodedList);
  return { revoked: bits.get(index), listSize: bits.length };
}
