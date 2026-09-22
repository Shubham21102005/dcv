// pnpm ipfs - run a project-local Kubo node in offline mode with the CORS
// headers the browser apps need. Never touches the user's global ~/.ipfs.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { env, ipfsBin, root } from './env.mjs';

const IPFS_PATH = resolve(root, env('IPFS_PATH', './.ipfs'));
const apiPort = new URL(env('IPFS_API_URL', 'http://127.0.0.1:5001')).port || '5001';
const gatewayPort = new URL(env('IPFS_GATEWAY_URL', 'http://127.0.0.1:8080')).port || '8080';
const walletUrl = env('WALLET_URL', 'http://localhost:5173');
const verifierWebUrl = env('VERIFIER_WEB_URL', 'http://localhost:5174');
const bin = ipfsBin();
const envWithPath = { ...process.env, IPFS_PATH };

function ipfs(...args) {
  const r = spawnSync(bin, args, { env: envWithPath, encoding: 'utf8' });
  if (r.error) throw new Error(`could not run ${bin}: ${r.error.message} (install Kubo - see PLAN.md Step 0)`);
  if (r.status !== 0) throw new Error(`ipfs ${args.join(' ')} failed:\n${r.stderr}`);
  return r.stdout.trim();
}

if (!existsSync(resolve(IPFS_PATH, 'config'))) {
  console.log(`[ipfs] initialising repo at ${IPFS_PATH}`);
  ipfs('init', '--profile=server');
}

// Idempotent configuration (cheap; runs every start so edits to .env apply).
ipfs('config', 'Addresses.API', `/ip4/127.0.0.1/tcp/${apiPort}`);
ipfs('config', 'Addresses.Gateway', `/ip4/127.0.0.1/tcp/${gatewayPort}`);
ipfs('config', '--json', 'Import.CidVersion', '1');
ipfs('config', '--json', 'API.HTTPHeaders.Access-Control-Allow-Origin', JSON.stringify([walletUrl, verifierWebUrl]));
ipfs('config', '--json', 'API.HTTPHeaders.Access-Control-Allow-Methods', JSON.stringify(['PUT', 'POST', 'GET']));
// The wallet's status badge fetches :8080/ipfs/<cid> from the browser.
ipfs('config', '--json', 'Gateway.HTTPHeaders.Access-Control-Allow-Origin', JSON.stringify(['*']));
ipfs('config', '--json', 'Gateway.HTTPHeaders.Access-Control-Allow-Methods', JSON.stringify(['GET']));
ipfs('config', '--json', 'Gateway.NoFetch', 'true');

console.log(`[ipfs] ${ipfs('version')} · API :${apiPort} · gateway :${gatewayPort} · offline`);
const daemon = spawn(bin, ['daemon', '--offline'], { env: envWithPath, stdio: 'inherit', windowsHide: true });
const stop = () => {
  daemon.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
daemon.on('exit', (code) => process.exit(code ?? 0));
