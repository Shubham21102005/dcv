import { makePublicClient, makeTestClient, makeWalletClient } from '@dcv/core/chain/client';
import { readDeploymentsFile } from '@dcv/core/chain/deploymentsNode';
import { DEFAULTS } from '@dcv/core/config';
import { makeResolver } from '@dcv/core/did/resolver';
import { presentSdJwtVc } from '@dcv/core/sdjwt/present';
import { issueTestCredential, type TestIssuance } from '@dcv/core/testing/issueTestCredential';
import { createVerifierApp, type VerifierDeps } from '../src/app.js';

export const HOLDER_KEY = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6' as const; // Anvil #3

export async function makeVerifier(overrides: Partial<VerifierDeps> = {}) {
  const deployments = readDeploymentsFile('deployments/test-verifier.json');
  const publicClient = makePublicClient({ rpcUrl: deployments.rpcUrl });
  const issuerWallet = makeWalletClient({ rpcUrl: deployments.rpcUrl, privateKey: DEFAULTS.ISSUER_PRIVATE_KEY });
  const issued: TestIssuance = await issueTestCredential({
    publicClient,
    issuerWallet,
    deployments,
    issuerKey: DEFAULTS.ISSUER_PRIVATE_KEY,
    holderKey: HOLDER_KEY,
  });
  const deps: VerifierDeps = {
    config: {
      verifierName: 'Acme Corp HR',
      verifierPublicUrl: DEFAULTS.VERIFIER_PUBLIC_URL,
      walletUrl: DEFAULTS.WALLET_URL,
      verifierWebUrl: 'http://localhost:5174',
      issuerPublicUrl: DEFAULTS.ISSUER_PUBLIC_URL,
      rpcUrl: deployments.rpcUrl,
      nonceTtlSeconds: 600,
      kbMaxAgeSeconds: 300,
    },
    deployments,
    publicClient,
    resolver: makeResolver({ rpcUrl: deployments.rpcUrl, registry: deployments.didRegistry }),
    fetchStatusList: issued.fetchStatusList,
    ...overrides,
  };
  const built = createVerifierApp(deps);
  return { ...built, deps, issued, deployments, publicClient, testClient: makeTestClient({ rpcUrl: deployments.rpcUrl }) };
}

export const json = (body: unknown, method = 'POST') => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Create a request via the API and build a matching presentation from the wallet's side. */
export async function requestAndPresent(
  app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> },
  issued: TestIssuance,
  claims = ['credentialSubject.degree.name'],
) {
  const created = (await (await app.request('/requests', json({ credentialType: 'UniversityDegreeCredential', claims }))).json()) as { id: string; url: string; walletLink: string };
  const pub = (await (await app.request(`/requests/${created.id}/public`)).json()) as { nonce: string; aud: string; claims: string[] };
  const vp = await presentSdJwtVc({ holderKey: HOLDER_KEY, sdJwt: issued.sdJwt, disclose: pub.claims, kb: { aud: pub.aud, nonce: pub.nonce } });
  return { created, pub, vp };
}
