// pnpm privacy-scan [extra terms...] - grep the chain + IPFS for the real PII in
// data/issuer.json. Works with the issuer process down (reads the ledger file).
import { existsSync, readFileSync } from 'node:fs';
import { makePublicClient } from '@dcv/core/chain/client';
import { fromRoot, readDeploymentsFile } from '@dcv/core/chain/deploymentsNode';
import { getConfig } from '@dcv/core/config';
import { KuboBlobStore } from '@dcv/core/ipfs/blobStore';
import { scanForPii, stringLeaves } from '@dcv/core/privacy/scan';
import './env.mjs';

const cfg = getConfig();
const deployments = readDeploymentsFile(cfg.deploymentsFile);
const publicClient = makePublicClient({ rpcUrl: deployments.rpcUrl });

const ledgerFile = fromRoot('data/issuer.json');
const terms: string[] = [];
if (existsSync(ledgerFile)) {
  const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8')) as { rows?: Array<{ subject?: unknown }> };
  for (const row of ledger.rows ?? []) terms.push(...stringLeaves(row.subject));
}
terms.push(...process.argv.slice(2));

const kubo = new KuboBlobStore({ apiUrl: cfg.ipfsApiUrl, gatewayUrl: cfg.ipfsGatewayUrl });
const blobStore = (await kubo.isReachable()) ? kubo : undefined;
if (!blobStore) console.warn(`[privacy-scan] IPFS API ${cfg.ipfsApiUrl} not reachable - scanning the chain only`);

const t0 = Date.now();
const r = await scanForPii({ publicClient, blobStore, terms });
console.log(`privacy scan: ${r.hits.length} hits over ${r.blocks} blocks / ${r.logs} logs / ${r.blobs} blobs for ${r.terms} terms (${Date.now() - t0} ms)`);
console.log(`terms: ${[...new Set(terms)].map((t) => JSON.stringify(t)).join(', ')}`);
for (const h of r.hits) console.log(`  HIT ${h.term} (${h.encoding}) in ${h.where}`);
process.exit(r.hits.length === 0 ? 0 : 1);
