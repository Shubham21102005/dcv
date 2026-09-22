// pnpm e2e - the scripted demo against a live `pnpm dev` stack, no browser:
//   deploy check -> onboard a wallet -> claim -> present (round 1 ok)
//   -> revoke -> present (round 2: only status red) -> un-revoke -> present (round 3 ok)
//   -> KILL THE ISSUER -> present (round 4 ok, issuer never contacted)
//   -> privacy scan straight from the ledger file (issuer is down): T > 0 terms, 0 hits.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { makePublicClient } from '@dcv/core/chain/client';
import { fromRoot, readDeploymentsFile } from '@dcv/core/chain/deploymentsNode';
import { getConfig } from '@dcv/core/config';
import { KuboBlobStore } from '@dcv/core/ipfs/blobStore';
import { signOfferProof } from '@dcv/core/offer/proof';
import { scanForPii, stringLeaves } from '@dcv/core/privacy/scan';
import { presentSdJwtVc } from '@dcv/core/sdjwt/present';
import { Keyring } from '@dcv/core/vault/keyring';
import type { VerificationReport } from '@dcv/core/verifier/report';
import { SAMPLE_DEGREE_SUBJECT } from '@dcv/core/vc/build';
import './env.mjs';
import { killTree } from './proc.mjs';

const t0 = Date.now();
const cfg = getConfig();
const ISSUER = cfg.issuerPublicUrl;
const VERIFIER = cfg.verifierPublicUrl;

function fail(msg: string): never {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}
function check(cond: unknown, msg: string): void {
  if (!cond) fail(msg);
  console.log(`  ✓ ${msg}`);
}
async function api<T>(url: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(url, { headers: { 'content-type': 'application/json' }, ...init });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}
const post = (body?: unknown) => ({ method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

// ---- 0. deploy check ---------------------------------------------------------------------------
console.log('0. deploy check');
const deployments = readDeploymentsFile(cfg.deploymentsFile);
const issuerCfg = await api<{ deployments: { trustRegistry: string } }>(`${ISSUER}/config`);
check(issuerCfg.status === 200, `issuer answers at ${ISSUER}`);
check(issuerCfg.body.deployments.trustRegistry === deployments.trustRegistry, 'issuer uses the same deployments as deployments/anvil.json');
check((await api(`${VERIFIER}/health`)).status === 200, `verifier answers at ${VERIFIER}`);

// ---- 1. onboard a wallet (in-memory keyring, fast KDF) --------------------------------------------
console.log('1. wallet onboarding');
const { keyring, mnemonic } = await Keyring.create('e2e-passphrase', { kdf: { t: 1, m: 8192 } });
check(mnemonic.split(' ').length === 12, '12-word mnemonic generated');

// ---- 2. offer -> claim --------------------------------------------------------------------------
console.log('2. issue');
const offerRes = await api<{ offerId: string; offerUrl: string }>(`${ISSUER}/credentials`, post({ type: 'UniversityDegreeCredential', subject: SAMPLE_DEGREE_SUBJECT }));
check(offerRes.status === 201, 'offer created');
const offer = (await api<{ issuerDid: string; nonce: string; claimUrl: string }>(offerRes.body.offerUrl)).body;
const pairwise = await keyring.holderAccount(offer.issuerDid);
const proof = await signOfferProof({ holderKey: pairwise.privateKey, holderDid: pairwise.did, issuerDid: offer.issuerDid, nonce: offer.nonce });
const claim = await api<{ sdJwt: string; credentialId: string; statusListIndex: number }>(offer.claimUrl, post({ proof }));
check(claim.status === 200 && claim.body.sdJwt, `claimed credential ${claim.body.credentialId} (status index ${claim.body.statusListIndex})`);

// ---- rounds -------------------------------------------------------------------------------------
const rounds: Array<{ name: string; report: VerificationReport }> = [];
async function present(name: string, claims: string[] = ['credentialSubject.degree.name']): Promise<VerificationReport> {
  const created = await api<{ id: string; url: string }>(`${VERIFIER}/requests`, post({ credentialType: 'UniversityDegreeCredential', claims }));
  check(created.status === 201, `${name}: request created`);
  const pub = (await api<{ nonce: string; aud: string; claims: string[]; submitUrl: string }>(created.body.url)).body;
  const vp = await presentSdJwtVc({ holderKey: pairwise.privateKey, sdJwt: claim.body.sdJwt, disclose: pub.claims, kb: { aud: pub.aud, nonce: pub.nonce } });
  const res = await api<{ state: string; report: VerificationReport }>(pub.submitUrl, post({ vp }));
  check(res.status === 200 && res.body.report, `${name}: presentation submitted`);
  rounds.push({ name, report: res.body.report });
  return res.body.report;
}
const red = (r: VerificationReport) => r.checks.filter((c) => !c.ok).map((c) => c.name);

console.log('3. round 1 - valid');
const r1 = await present('round 1');
check(r1.ok && red(r1).length === 0, 'round 1: 8/8 ok');
check(r1.issuerContacted === false, 'round 1: issuer not contacted');
check(r1.checks[7]?.evidence?.['source'] === 'ipfs', 'round 1: status list came from the IPFS gateway');

console.log('4. revoke -> round 2');
const rev = await api<{ version: number }>(`${ISSUER}/credentials/${claim.body.credentialId}/revoke`, post());
check(rev.status === 200, `revoked (status list v${rev.body.version})`);
const r2 = await present('round 2');
check(!r2.ok && red(r2).join() === 'status', 'round 2: only the status row is red');
check(r2.checks[7]?.code === 'REVOKED', 'round 2: code REVOKED');

console.log('5. un-revoke -> round 3');
const unrev = await api<{ version: number }>(`${ISSUER}/credentials/${claim.body.credentialId}/unrevoke`, post());
check(unrev.status === 200, `un-revoked (status list v${unrev.body.version})`);
const r3 = await present('round 3');
check(r3.ok, 'round 3: 8/8 ok again');

console.log('6. kill the issuer -> round 4');
const pidFile = fromRoot('data/issuer.pid');
check(existsSync(pidFile), 'issuer pid file present');
const issuerPid = Number(readFileSync(pidFile, 'utf8').trim());
killTree(issuerPid);
rmSync(pidFile, { force: true });
await new Promise((r) => setTimeout(r, 800));
let issuerDown = false;
try {
  await fetch(`${ISSUER}/health`, { signal: AbortSignal.timeout(1500) });
} catch {
  issuerDown = true;
}
check(issuerDown, `issuer process ${issuerPid} is down`);
const r4 = await present('round 4 (issuer offline)');
check(r4.ok, 'round 4: 8/8 ok with the issuer offline');
check(r4.issuerContacted === false && !r4.outboundUrls.some((u) => u.startsWith(ISSUER)), 'round 4: no request went to the issuer origin');

console.log('7. privacy scan (ledger file, issuer down)');
const ledger = JSON.parse(readFileSync(fromRoot('data/issuer.json'), 'utf8')) as { rows: Array<{ subject: unknown }> };
const terms = [...new Set([...ledger.rows.flatMap((row) => stringLeaves(row.subject)), pairwise.did, pairwise.address])];
check(terms.length > 0, `${terms.length} PII terms taken from the ledger + the holder DID/address`);
const publicClient = makePublicClient({ rpcUrl: deployments.rpcUrl });
const kubo = new KuboBlobStore({ apiUrl: cfg.ipfsApiUrl, gatewayUrl: cfg.ipfsGatewayUrl });
const scan = await scanForPii({ publicClient, blobStore: (await kubo.isReachable()) ? kubo : undefined, terms });
check(scan.terms > 0, `scanner ran with ${scan.terms} terms (asserted before looking at hits)`);
check(scan.hits.length === 0, `privacy scan: 0 hits over ${scan.blocks} blocks / ${scan.logs} logs / ${scan.blobs} blobs for ${scan.terms} terms`);

// ---- table ----------------------------------------------------------------------------------------
console.log('\nround                      ' + rounds[0]!.report.checks.map((c) => c.name.padEnd(16)).join(''));
for (const r of rounds) console.log(r.name.padEnd(27) + r.report.checks.map((c) => (c.ok ? '✓' : `✗ ${c.code ?? ''}`).padEnd(16)).join(''));
console.log(`\n✓ e2e passed in ${((Date.now() - t0) / 1000).toFixed(1)} s (the issuer is now down - Ctrl+C the dev terminal and run pnpm reset; pnpm dev to restart)`);
