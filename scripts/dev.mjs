// pnpm dev - one command for the whole demo stack:
//   anvil + kubo  ->  deploy + seed  ->  issuer (+ verifier-api, verifier-web, wallet as they land)
// No process kills the others: stopping the issuer on stage leaves the rest running.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { anvilBin, env, root } from './env.mjs';
import { killTree, nodeBin, run, waitForPorts } from './proc.mjs';

const rpcPort = Number(new URL(env('RPC_URL', 'http://127.0.0.1:8545')).port || 8545);
const ipfsApiPort = Number(new URL(env('IPFS_API_URL', 'http://127.0.0.1:5001')).port || 5001);
const children = [];
const stopAll = () => {
  for (const c of children) killTree(c.pid);
};
process.on('SIGINT', () => {
  stopAll();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopAll();
  process.exit(0);
});

// 1. chain + ipfs
children.push(run('anvil', anvilBin(), ['--chain-id', env('CHAIN_ID', '31337'), '--port', String(rpcPort), '--silent']));
children.push(run('ipfs', process.execPath, [resolve(root, 'scripts/ipfs.mjs')]));
console.log('[dev] waiting for anvil + ipfs …');
try {
  await waitForPorts([rpcPort, ipfsApiPort]);
} catch (err) {
  console.error(`[dev] ${err.message}`);
  stopAll();
  process.exit(1);
}

// 2. deploy + seed (fresh chain every start -> deterministic addresses)
console.log('[dev] deploying contracts …');
const deploy = spawnSync(process.execPath, [nodeBin.tsx, resolve(root, 'scripts/deploy.ts')], { stdio: 'inherit', cwd: root });
if (deploy.status !== 0) {
  console.error('[dev] deploy failed');
  stopAll();
  process.exit(1);
}

// 3. apps (each only if its package exists yet)
const apps = [
  { name: 'issuer', dir: 'apps/issuer', args: [nodeBin.tsx, 'src/server.ts'], port: Number(env('ISSUER_PORT', '4001')) },
  { name: 'verifier-api', dir: 'apps/verifier-api', args: [nodeBin.tsx, 'src/server.ts'], port: Number(env('VERIFIER_PORT', '4002')) },
  { name: 'verifier-web', dir: 'apps/verifier-web', args: [nodeBin.vite, '--strictPort'], port: 5174 },
  { name: 'wallet', dir: 'apps/wallet', args: [nodeBin.vite, '--strictPort'], port: 5173 },
];
const started = [];
for (const app of apps) {
  const cwd = resolve(root, app.dir);
  if (!existsSync(resolve(cwd, 'package.json'))) continue;
  children.push(run(app.name, process.execPath, app.args, { cwd }));
  started.push(app);
}
try {
  await waitForPorts(started.map((a) => a.port), 90_000);
} catch (err) {
  console.error(`[dev] ${err.message}`);
}
console.log('\n[dev] ready:');
for (const a of started) console.log(`[dev]   ${a.name.padEnd(13)} http://localhost:${a.port}`);
console.log(`[dev]   anvil         http://127.0.0.1:${rpcPort}   ipfs api :${ipfsApiPort}`);
console.log('[dev] Ctrl+C stops everything; `pnpm stop:issuer` stops only the issuer.\n');
