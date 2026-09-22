import { getAddress, isAddress, type Address } from 'viem';

/** DID method + network used throughout the demo: did:ethr on the local Anvil chain. */
export const DID_NETWORK = 'anvil';
export const DID_PREFIX = `did:ethr:${DID_NETWORK}:`;

const DID_RE = /^did:ethr:anvil:(0x[0-9a-fA-F]{40})$/;

export function addressToDid(address: Address): string {
  return `${DID_PREFIX}${getAddress(address)}`;
}

/** Parse a did:ethr:anvil DID back to its (checksummed) address; throws on any other DID. */
export function didToAddress(did: string): Address {
  const m = DID_RE.exec(did);
  if (!m || !isAddress(m[1]!)) throw new Error(`not a did:ethr:${DID_NETWORK} DID: ${did}`);
  return getAddress(m[1]!);
}

export function isEthrDid(did: string): boolean {
  return DID_RE.test(did);
}

/** The verification method id a fresh did:ethr document exposes for its controller key. */
export function controllerKeyId(did: string): string {
  return `${did}#controller`;
}

/** Strip a `#fragment` from a kid to get the DID. */
export function kidToDid(kid: string): string {
  return kid.split('#')[0]!;
}
