// pnpm reset - clean only, never restarts: kill anything listening on the demo
// ports and delete the runtime state (ledger, pid file, deployments).
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { env, root } from './env.mjs';
import { killTree, pidsOnPort } from './proc.mjs';

const ports = [
  Number(new URL(env('RPC_URL', 'http://127.0.0.1:8545')).port || 8545),
  Number(new URL(env('IPFS_API_URL', 'http://127.0.0.1:5001')).port || 5001),
  Number(new URL(env('IPFS_GATEWAY_URL', 'http://127.0.0.1:8080')).port || 8080),
  Number(env('ISSUER_PORT', '4001')),
  Number(env('VERIFIER_PORT', '4002')),
  5173,
  5174,
];
const killed = new Set();
for (const port of ports) {
  for (const pid of pidsOnPort(port)) {
    if (pid === process.pid || killed.has(pid)) continue;
    killTree(pid);
    killed.add(pid);
    console.log(`[reset] killed pid ${pid} (port ${port})`);
  }
}
for (const f of ['data/issuer.json', 'data/issuer.json.tmp', 'data/issuer.pid', env('DEPLOYMENTS_FILE', 'deployments/anvil.json')]) {
  rmSync(resolve(root, f), { force: true });
}
console.log('[reset] runtime state cleared (ledger, pid file, deployments). IPFS repo kept. Run: pnpm dev');
