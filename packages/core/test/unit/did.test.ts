import { describe, expect, it } from 'vitest';
import { addressToDid, controllerKeyId, didToAddress, isEthrDid, kidToDid } from '../../src/did/ethr.js';

const ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

describe('did:ethr:anvil', () => {
  it('builds a DID from an address (checksummed)', () => {
    expect(addressToDid(ADDR)).toBe(`did:ethr:anvil:${ADDR}`);
    expect(addressToDid(ADDR.toLowerCase() as `0x${string}`)).toBe(`did:ethr:anvil:${ADDR}`);
  });

  it('parses a DID back to its address', () => {
    expect(didToAddress(`did:ethr:anvil:${ADDR}`)).toBe(ADDR);
    expect(didToAddress(`did:ethr:anvil:${ADDR.toLowerCase()}`)).toBe(ADDR);
  });

  it('rejects other methods and networks', () => {
    expect(() => didToAddress('did:web:example.com')).toThrow(/not a did:ethr/);
    expect(() => didToAddress(`did:ethr:sepolia:${ADDR}`)).toThrow(/not a did:ethr/);
    expect(() => didToAddress(`did:ethr:${ADDR}`)).toThrow(/not a did:ethr/);
    expect(() => didToAddress('did:ethr:anvil:0x1234')).toThrow();
    expect(isEthrDid(`did:ethr:anvil:${ADDR}`)).toBe(true);
    expect(isEthrDid('did:key:z6Mk')).toBe(false);
  });

  it('derives and strips the #controller key id', () => {
    const did = addressToDid(ADDR);
    expect(controllerKeyId(did)).toBe(`${did}#controller`);
    expect(kidToDid(`${did}#controller`)).toBe(did);
    expect(kidToDid(did)).toBe(did);
  });
});
