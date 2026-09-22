import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { b64u } from '../../src/crypto/base64url.js';
import { ES256K_R, createAddressVerifier, createEs256kSigner } from '../../src/crypto/es256k.js';
import { decodeJws, signJws, verifyJws } from '../../src/crypto/jws.js';
import { DEFAULTS } from '../../src/config.js';

const KEY_1 = DEFAULTS.ISSUER_PRIVATE_KEY;
const acct1 = privateKeyToAccount(KEY_1).address;
const header = { alg: ES256K_R, typ: 'JWT', kid: 'did:ethr:anvil:0x1#controller' };
const payload = { iss: 'did:ethr:anvil:0x1', nonce: 'n1', iat: 1_700_000_000 };

describe('compact JWS', () => {
  it('signs, decodes and verifies', async () => {
    const jws = await signJws(header, payload, createEs256kSigner(KEY_1));
    expect(jws.split('.')).toHaveLength(3);
    const decoded = decodeJws<typeof payload>(jws);
    expect(decoded.header).toEqual(header);
    expect(decoded.header.alg).toBe('ES256K-R');
    expect(decoded.payload).toEqual(payload);
    const { ok } = await verifyJws(jws, createAddressVerifier(acct1));
    expect(ok).toBe(true);
  });

  it('fails verification when the payload segment is tampered', async () => {
    const jws = await signJws(header, payload, createEs256kSigner(KEY_1));
    const [h, , s] = jws.split('.') as [string, string, string];
    const tampered = `${h}.${b64u.encodeJson({ ...payload, nonce: 'n2' })}.${s}`;
    const { ok, decoded } = await verifyJws(tampered, createAddressVerifier(acct1));
    expect(ok).toBe(false);
    expect(decoded?.payload).toMatchObject({ nonce: 'n2' });
  });

  it('rejects malformed input', async () => {
    expect(() => decodeJws('a.b')).toThrow(/3 segments/);
    expect(() => decodeJws('a.b.')).toThrow(/empty signature/);
    expect((await verifyJws('not-a-jws', createAddressVerifier(acct1))).ok).toBe(false);
  });
});
