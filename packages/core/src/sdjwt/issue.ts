import type { Hex } from 'viem';
import { controllerKeyId } from '../did/ethr.js';
import type { DegreeCredential } from '../vc/types.js';
import { degreeFrame } from './frames.js';
import { VC_SD_JWT_TYP, issuerSdJwt, type SdJwtVcPayload } from './instance.js';

export interface IssueOptions {
  issuerKey: Hex;
  issuerDid: string;
  credential: DegreeCredential;
  holderDid: string;
  /** Issuance time in seconds since epoch (defaults to now). */
  now?: number;
}

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/**
 * Secure a VCDM 2.0 credential as `application/vc+sd-jwt`: the subject's
 * disclosable claims are replaced by salted digests, `cnf.kid` binds the holder's
 * pairwise key, and the issuer signs with ES256K-R.
 */
export async function issueSdJwtVc(opts: IssueOptions): Promise<string> {
  const payload: SdJwtVcPayload = {
    ...opts.credential,
    iss: opts.issuerDid,
    iat: opts.now ?? nowSeconds(),
    cnf: { kid: controllerKeyId(opts.holderDid) },
  };
  return issuerSdJwt(opts.issuerKey).issue(payload, degreeFrame, {
    header: { typ: VC_SD_JWT_TYP, cty: 'vc', kid: controllerKeyId(opts.issuerDid) },
  });
}
