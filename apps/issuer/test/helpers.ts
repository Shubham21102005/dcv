// Build an in-process issuer app against the self-spawned Anvil (:8547).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { keccak256, stringToBytes, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { makePublicClient, makeTestClient, makeWalletClient } from '@dcv/core/chain/client';
import { readDeploymentsFile } from '@dcv/core/chain/deploymentsNode';
import { DEFAULTS } from '@dcv/core/config';
import { addressToDid } from '@dcv/core/did/ethr';
import { MemoryBlobStore } from '@dcv/core/ipfs/blobStore';
import { signOfferProof } from '@dcv/core/offer/proof';
import { SAMPLE_DEGREE_SUBJECT } from '@dcv/core/vc/build';
import { createIssuerApp, type IssuerDeps } from '../src/app.js';
import { Ledger } from '../src/ledger.js';

export const TEST_DEPLOYMENTS = 'deployments/test-issuer.json';
export const HOLDER_KEY: Hex = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6'; // Anvil #3

export function makeIssuer(overrides: Partial<IssuerDeps> = {}) {
  const deployments = readDeploymentsFile(TEST_DEPLOYMENTS);
  const publicClient = makePublicClient({ rpcUrl: deployments.rpcUrl });
  const issuerWallet = makeWalletClient({ rpcUrl: deployments.rpcUrl, privateKey: DEFAULTS.ISSUER_PRIVATE_KEY });
  const adminWallet = makeWalletClient({ rpcUrl: deployments.rpcUrl, privateKey: DEFAULTS.ADMIN_PRIVATE_KEY });
  const dir = mkdtempSync(join(tmpdir(), 'dcv-issuer-'));
  const deps: IssuerDeps = {
    config: {
      issuerName: DEFAULTS.ISSUER_NAME,
      issuerPublicUrl: DEFAULTS.ISSUER_PUBLIC_URL,
      walletUrl: DEFAULTS.WALLET_URL,
      verifierWebUrl: 'http://localhost:5174',
      nonceTtlSeconds: 300,
      statusListSize: 131072,
    },
    deployments,
    publicClient,
    issuerWallet,
    adminWallet,
    issuerKey: DEFAULTS.ISSUER_PRIVATE_KEY,
    issuerDid: addressToDid(issuerWallet.account.address),
    ledger: new Ledger(join(dir, 'issuer.json')),
    blobStore: new MemoryBlobStore(),
    metadata: { name: DEFAULTS.ISSUER_NAME },
    ...overrides,
  };
  const built = createIssuerApp(deps);
  const testClient = makeTestClient({ rpcUrl: deployments.rpcUrl });
  return { ...built, deps, deployments, publicClient, testClient, issuerWallet, adminWallet };
}

export const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** Create an offer and claim it with a valid proof from HOLDER_KEY. */
export async function issueToHolder(app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> }, issuerDid: string) {
  const offerRes = await app.request('/credentials', json({ type: 'UniversityDegreeCredential', subject: SAMPLE_DEGREE_SUBJECT }));
  const offer = (await offerRes.json()) as { offerId: string; offerUrl: string; walletLink: string };
  const details = (await (await app.request(`/offers/${offer.offerId}`)).json()) as { nonce: string };
  const holderDid = addressToDid(privateKeyToAccount(HOLDER_KEY).address);
  const proof = await signOfferProof({ holderKey: HOLDER_KEY, holderDid, issuerDid, nonce: details.nonce });
  const claimRes = await app.request(`/offers/${offer.offerId}/claim`, json({ proof }));
  const claim = (await claimRes.json()) as { sdJwt: string; credentialId: string; statusListIndex: number };
  return { offer, details, holderDid, proof, claimRes, claim };
}

export const hashOf = (s: string) => keccak256(stringToBytes(s));
