import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { DEFAULTS } from '../../src/config.js';
import { addressToDid } from '../../src/did/ethr.js';
import { Bitstring } from '../../src/status/bitstring.js';
import {
  buildStatusListCredential,
  decodeStatusListCredential,
  readStatusBit,
  signStatusListCredential,
  verifyStatusListSignature,
} from '../../src/status/credential.js';

const ISSUER_KEY = DEFAULTS.ISSUER_PRIVATE_KEY;
const issuerAddress = privateKeyToAccount(ISSUER_KEY).address;
const issuerDid = addressToDid(issuerAddress);
const LIST_URL = 'http://localhost:4001/status/1';

async function signedList(revoked: number[]) {
  const bits = new Bitstring();
  for (const i of revoked) bits.set(i, true);
  const cred = buildStatusListCredential({
    issuerDid,
    listUrl: LIST_URL,
    purpose: 'revocation',
    encodedList: await bits.toEncodedList(),
    now: new Date('2026-09-22T09:00:00Z'),
  });
  return signStatusListCredential(cred, ISSUER_KEY, 1_790_000_000);
}

describe('BitstringStatusListCredential as vc+jwt', () => {
  it('builds, signs and decodes with the expected shape', async () => {
    const jwt = await signedList([42]);
    const { header, payload } = decodeStatusListCredential(jwt);
    expect(header['typ']).toBe('vc+jwt');
    expect(header['alg']).toBe('ES256K-R');
    expect(header['kid']).toBe(`${issuerDid}#controller`);
    expect(payload['@context']).toEqual(['https://www.w3.org/ns/credentials/v2']);
    expect(payload.id).toBe(LIST_URL);
    expect(payload.type).toEqual(['VerifiableCredential', 'BitstringStatusListCredential']);
    expect(payload.issuer).toBe(issuerDid);
    expect(payload.iss).toBe(issuerDid);
    expect(payload.validFrom).toBe('2026-09-22T09:00:00Z');
    expect(payload.credentialSubject).toMatchObject({ id: `${LIST_URL}#list`, type: 'BitstringStatusList', statusPurpose: 'revocation' });
    expect(payload.credentialSubject.encodedList.startsWith('uH4sI')).toBe(true);
    expect(await verifyStatusListSignature(jwt, issuerAddress)).toBe(true);
    expect(await verifyStatusListSignature(jwt, '0x000000000000000000000000000000000000dEaD')).toBe(false);
  });

  it('readStatusBit reports revoked only for the set index', async () => {
    const jwt = await signedList([42]);
    expect(await readStatusBit(jwt, 42, 'revocation')).toEqual({ revoked: true, listSize: 131072 });
    expect((await readStatusBit(jwt, 41, 'revocation')).revoked).toBe(false);
    expect((await readStatusBit(jwt, 43, 'revocation')).revoked).toBe(false);
    expect((await readStatusBit(jwt, 131071, 'revocation')).revoked).toBe(false);
  });

  it('throws on purpose mismatch and out-of-range index', async () => {
    const jwt = await signedList([]);
    await expect(readStatusBit(jwt, 42, 'suspension')).rejects.toThrow(/purpose mismatch/);
    await expect(readStatusBit(jwt, 131072, 'revocation')).rejects.toThrow(RangeError);
  });
});
