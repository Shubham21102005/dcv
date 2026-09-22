// Verifier API entry point (:4002).
import { serve } from '@hono/node-server';
import { makePublicClient } from '@dcv/core/chain/client';
import { loadEnv, readDeploymentsFile } from '@dcv/core/chain/deploymentsNode';
import { getConfig } from '@dcv/core/config';
import { makeResolver } from '@dcv/core/did/resolver';
import { makeStatusListFetcher } from '@dcv/core/verifier/statusFetch';
import { createVerifierApp } from './app.js';

loadEnv();
const cfg = getConfig();
const deployments = readDeploymentsFile(cfg.deploymentsFile);
const publicClient = makePublicClient({ rpcUrl: deployments.rpcUrl });

const { app } = createVerifierApp({
  config: {
    verifierName: 'Acme Corp HR',
    verifierPublicUrl: cfg.verifierPublicUrl,
    walletUrl: cfg.walletUrl,
    verifierWebUrl: 'http://localhost:5174',
    issuerPublicUrl: cfg.issuerPublicUrl,
    rpcUrl: deployments.rpcUrl,
    nonceTtlSeconds: cfg.nonceTtlSeconds,
    kbMaxAgeSeconds: cfg.kbMaxAgeSeconds,
  },
  deployments,
  publicClient,
  resolver: makeResolver({ rpcUrl: deployments.rpcUrl, registry: deployments.didRegistry }),
  // IPFS gateway first; the issuer's own URL only if IPFS is down.
  fetchStatusList: makeStatusListFetcher({ publicClient, deployments, gatewayUrl: cfg.ipfsGatewayUrl }),
});

serve({ fetch: app.fetch, port: cfg.verifierPort, hostname: '127.0.0.1' }, (info) => {
  console.log(`[verifier-api] Acme Corp HR listening on http://localhost:${info.port} (aud ${cfg.verifierPublicUrl})`);
});
