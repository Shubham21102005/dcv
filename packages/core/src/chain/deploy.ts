import { getAddress, getContractAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { EthereumDIDRegistryAbi, EthereumDIDRegistryBytecode } from './abi/EthereumDIDRegistry.js';
import { IssuerTrustRegistryAbi, IssuerTrustRegistryBytecode } from './abi/IssuerTrustRegistry.js';
import { StatusListRegistryAbi, StatusListRegistryBytecode } from './abi/StatusListRegistry.js';
import { VaultPointerAbi, VaultPointerBytecode } from './abi/VaultPointer.js';
import { makePublicClient, makeWalletClient } from './client.js';
import type { Deployments } from './deployments.js';
import { trustRegistryWrites } from './trustRegistry.js';
import { addressToDid } from '../did/ethr.js';

export interface DeployOptions {
  rpcUrl: string;
  adminPrivateKey: Hex;
  issuerAddress: Address;
  issuerName: string;
  issuerMetadataURI: string;
  credentialTypes?: string[];
  /** When true (default) fail unless the admin's first four txs are these deployments. */
  requireFreshChain?: boolean;
  log?: (line: string) => void;
}

export const DEFAULT_CREDENTIAL_TYPES = ['UniversityDegreeCredential'];

/**
 * Deploy the four contracts in a fixed order from the admin account and seed the
 * trust registry. On a fresh Anvil with account #0 this yields the deterministic
 * addresses documented in PLAN.md section 6.
 */
export async function deployAll(opts: DeployOptions): Promise<Deployments> {
  const log = opts.log ?? (() => {});
  const client = makePublicClient({ rpcUrl: opts.rpcUrl });
  const wallet = makeWalletClient({ rpcUrl: opts.rpcUrl, privateKey: opts.adminPrivateKey });
  const admin = wallet.account.address;
  const chainId = await client.getChainId();

  const startNonce = await client.getTransactionCount({ address: admin });
  if (opts.requireFreshChain !== false && startNonce !== 0) {
    throw new Error(
      `admin ${admin} already has nonce ${startNonce}; contract addresses would not be deterministic. ` +
        `Restart Anvil (pnpm chain) and deploy again, or pass requireFreshChain: false.`,
    );
  }

  async function deploy(name: string, abi: readonly unknown[], bytecode: Hex, args: readonly unknown[] = []): Promise<Address> {
    const nonce = await client.getTransactionCount({ address: admin });
    const expected = getContractAddress({ from: admin, nonce: BigInt(nonce) });
    const hash = await wallet.deployContract({
      abi: abi as never,
      bytecode,
      args: args as never,
      chain: wallet.chain,
      account: wallet.account,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`${name} deployment failed (tx ${hash})`);
    if (receipt.contractAddress.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(`${name} landed at ${receipt.contractAddress}, expected ${expected}`);
    }
    const address = getAddress(receipt.contractAddress);
    log(`${name.padEnd(20)} ${address} (nonce ${nonce})`);
    return address;
  }

  const didRegistry = await deploy('EthereumDIDRegistry', EthereumDIDRegistryAbi, EthereumDIDRegistryBytecode);
  const trustRegistry = await deploy('IssuerTrustRegistry', IssuerTrustRegistryAbi, IssuerTrustRegistryBytecode, [admin]);
  const statusRegistry = await deploy('StatusListRegistry', StatusListRegistryAbi, StatusListRegistryBytecode);
  const vaultPointer = await deploy('VaultPointer', VaultPointerAbi, VaultPointerBytecode);

  const d = { trustRegistry };
  await trustRegistryWrites.registerIssuer(wallet, client, d, opts.issuerAddress, opts.issuerName, opts.issuerMetadataURI);
  log(`registered issuer ${opts.issuerAddress} "${opts.issuerName}"`);
  for (const t of opts.credentialTypes ?? DEFAULT_CREDENTIAL_TYPES) {
    await trustRegistryWrites.allowCredentialType(wallet, client, d, opts.issuerAddress, t);
    log(`allowed credential type ${t}`);
  }

  const block = Number(await client.getBlockNumber());
  return {
    chainId,
    rpcUrl: opts.rpcUrl,
    didRegistry,
    trustRegistry,
    statusRegistry,
    vaultPointer,
    issuer: {
      address: opts.issuerAddress,
      did: addressToDid(opts.issuerAddress),
      name: opts.issuerName,
      metadataURI: opts.issuerMetadataURI,
    },
    block,
    deployedAt: new Date().toISOString(),
  };
}

export function issuerAddressFromKey(privateKey: Hex): Address {
  return privateKeyToAccount(privateKey).address;
}
