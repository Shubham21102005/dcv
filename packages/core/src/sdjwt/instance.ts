// SD-JWT (RFC 9901) instances bound to our ES256K-R signer/verifier pair.
import { SDJwtInstance, type Hasher, type SaltGenerator } from '@sd-jwt/core';
import type { Address, Hex } from 'viem';
import { b64u } from '../crypto/base64url.js';
import { ES256K_R, createAddressVerifier, createEs256kSigner } from '../crypto/es256k.js';
import { sha256Bytes } from '../crypto/hkdf.js';
import { randomBytes } from '../crypto/random.js';
import type { DegreeCredential } from '../vc/types.js';

/** Media types (W3C VC-JOSE-COSE). */
export const VC_SD_JWT_TYP = 'vc+sd-jwt';
export const VC_JWT_TYP = 'vc+jwt';
export const KB_JWT_TYP = 'kb+jwt';

/** The signed payload: the VCDM 2.0 credential plus JWT registered claims and the holder binding. */
export type SdJwtVcPayload = DegreeCredential & {
  iss: string;
  iat: number;
  /** Holder binding: the kid of the key that must sign the KB-JWT. */
  cnf: { kid: string };
};

export const hasher: Hasher = (data, _alg) =>
  sha256Bytes(typeof data === 'string' ? data : new Uint8Array(data as ArrayBuffer));

export const saltGenerator: SaltGenerator = (length) => b64u.encode(randomBytes(length));

export const HASH_ALG = 'sha-256' as const;

export function issuerSdJwt(issuerKey: Hex): SDJwtInstance<SdJwtVcPayload> {
  return new SDJwtInstance<SdJwtVcPayload>({
    signer: createEs256kSigner(issuerKey),
    signAlg: ES256K_R,
    hasher,
    hashAlg: HASH_ALG,
    saltGenerator,
  });
}

export function holderSdJwt(holderKey: Hex): SDJwtInstance<SdJwtVcPayload> {
  return new SDJwtInstance<SdJwtVcPayload>({
    hasher,
    hashAlg: HASH_ALG,
    saltGenerator,
    kbSigner: createEs256kSigner(holderKey),
    kbSignAlg: ES256K_R,
  });
}

/** A verifying instance pinned to the expected issuer and holder addresses. */
export function verifierSdJwt(issuerAddress: Address, holderAddress: Address): SDJwtInstance<SdJwtVcPayload> {
  const issuerVerifier = createAddressVerifier(issuerAddress);
  const holderVerifier = createAddressVerifier(holderAddress);
  return new SDJwtInstance<SdJwtVcPayload>({
    hasher,
    hashAlg: HASH_ALG,
    verifier: (data, sig) => issuerVerifier(data, sig),
    kbVerifier: (data, sig, _payload) => holderVerifier(data, sig),
  });
}
