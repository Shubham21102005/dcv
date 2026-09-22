// did:ethr resolution against the local EthereumDIDRegistry (ERC-1056).
// Node/verifier-side only: ethr-did-resolver pulls ethers v6 (~1 MB), so the
// wallet never imports this module - it only needs didToAddress + recoverAddress.
import { Resolver, type DIDDocument, type DIDResolutionResult } from 'did-resolver';
import { getResolver } from 'ethr-did-resolver';
import { getAddress, type Address } from 'viem';
import { DID_NETWORK, didToAddress } from './ethr.js';

export interface ResolverConfig {
  rpcUrl: string;
  registry: Address;
  chainId?: number;
}

export function makeResolver(cfg: ResolverConfig): Resolver {
  return new Resolver(
    getResolver({
      networks: [{ name: DID_NETWORK, chainId: cfg.chainId ?? 31337, rpcUrl: cfg.rpcUrl, registry: cfg.registry }],
      // ethr-did-resolver wraps the provider in a cache by default; the demo
      // changes owners/delegates live, so read straight through to the chain.
      cache: null,
    }),
  );
}

export async function resolveDid(resolver: Resolver, did: string): Promise<DIDDocument> {
  const result: DIDResolutionResult = await resolver.resolve(did);
  if (result.didResolutionMetadata.error || !result.didDocument) {
    throw new Error(`could not resolve ${did}: ${result.didResolutionMetadata.error ?? 'no document'}`);
  }
  return result.didDocument;
}

/**
 * The address currently controlling a did:ethr identity, read from the resolved
 * DID document (`#controller` verification method, `blockchainAccountId`
 * `eip155:<chainId>:<address>`). Falls back to the identifier itself only when the
 * document has no controller method (never the case for a valid did:ethr).
 */
export async function resolveControllerAddress(resolver: Resolver, did: string): Promise<Address> {
  const doc = await resolveDid(resolver, did);
  const controller = (doc.verificationMethod ?? []).find(
    (vm) => vm.id.endsWith('#controller') && typeof vm.blockchainAccountId === 'string',
  );
  if (!controller?.blockchainAccountId) return didToAddress(did);
  const parts = controller.blockchainAccountId.split(':');
  const address = parts[parts.length - 1];
  if (!address) throw new Error(`malformed blockchainAccountId for ${did}`);
  return getAddress(address);
}
