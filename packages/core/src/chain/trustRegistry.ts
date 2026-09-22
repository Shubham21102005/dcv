import type { Address, Hash, PublicClient, WalletClient } from 'viem';
import { IssuerTrustRegistryAbi } from './abi/IssuerTrustRegistry.js';
import type { Deployments } from './deployments.js';

type Writer = WalletClient & { account: NonNullable<WalletClient['account']> };

export async function isTrustedFor(
  client: PublicClient,
  d: Pick<Deployments, 'trustRegistry'>,
  issuer: Address,
  credentialType: string,
): Promise<boolean> {
  return client.readContract({
    address: d.trustRegistry,
    abi: IssuerTrustRegistryAbi,
    functionName: 'isTrustedFor',
    args: [issuer, credentialType],
  });
}

export async function isTrusted(client: PublicClient, d: Pick<Deployments, 'trustRegistry'>, issuer: Address) {
  return client.readContract({ address: d.trustRegistry, abi: IssuerTrustRegistryAbi, functionName: 'isTrusted', args: [issuer] });
}

export async function getIssuer(client: PublicClient, d: Pick<Deployments, 'trustRegistry'>, issuer: Address) {
  return client.readContract({ address: d.trustRegistry, abi: IssuerTrustRegistryAbi, functionName: 'getIssuer', args: [issuer] });
}

async function write(
  wallet: Writer,
  client: PublicClient,
  address: Address,
  functionName: 'registerIssuer' | 'revokeIssuer' | 'reactivateIssuer' | 'allowCredentialType' | 'disallowCredentialType',
  args: readonly unknown[],
): Promise<Hash> {
  const hash = await wallet.writeContract({
    address,
    abi: IssuerTrustRegistryAbi,
    functionName,
    args: args as never,
    chain: wallet.chain,
    account: wallet.account,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`${functionName} reverted (tx ${hash})`);
  return hash;
}

export const trustRegistryWrites = {
  registerIssuer: (w: Writer, c: PublicClient, d: Pick<Deployments, 'trustRegistry'>, issuer: Address, name: string, metadataURI: string) =>
    write(w, c, d.trustRegistry, 'registerIssuer', [issuer, name, metadataURI]),
  revokeIssuer: (w: Writer, c: PublicClient, d: Pick<Deployments, 'trustRegistry'>, issuer: Address) =>
    write(w, c, d.trustRegistry, 'revokeIssuer', [issuer]),
  reactivateIssuer: (w: Writer, c: PublicClient, d: Pick<Deployments, 'trustRegistry'>, issuer: Address) =>
    write(w, c, d.trustRegistry, 'reactivateIssuer', [issuer]),
  allowCredentialType: (w: Writer, c: PublicClient, d: Pick<Deployments, 'trustRegistry'>, issuer: Address, credentialType: string) =>
    write(w, c, d.trustRegistry, 'allowCredentialType', [issuer, credentialType]),
  disallowCredentialType: (w: Writer, c: PublicClient, d: Pick<Deployments, 'trustRegistry'>, issuer: Address, credentialType: string) =>
    write(w, c, d.trustRegistry, 'disallowCredentialType', [issuer, credentialType]),
};
