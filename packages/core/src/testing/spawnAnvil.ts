// Test helper: start a private Anvil on a given port, deploy + seed the contracts,
// and hand back a kill switch. Used by every package's Vitest globalSetup so no
// test ever needs a manually started chain.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { DEFAULTS } from '../config.js';
import { deployAll, issuerAddressFromKey } from '../chain/deploy.js';
import type { Deployments } from '../chain/deployments.js';
import { writeDeploymentsFile } from '../chain/deploymentsNode.js';

export interface SpawnedAnvil {
  rpcUrl: string;
  port: number;
  deployments: Deployments;
  deploymentsFile: string;
  kill: () => Promise<void>;
}

/** Locate the anvil binary: $ANVIL_BIN, then PATH, then ~/.foundry/bin. */
export function anvilBinary(): string {
  if (process.env['ANVIL_BIN']) return process.env['ANVIL_BIN'];
  const exe = process.platform === 'win32' ? 'anvil.exe' : 'anvil';
  const local = resolve(homedir(), '.foundry', 'bin', exe);
  return existsSync(local) ? local : 'anvil';
}

async function waitForRpc(rpcUrl: string, child: ChildProcess, timeoutMs = 30_000): Promise<void> {
  const started = Date.now();
  let lastErr: unknown;
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`anvil exited early with code ${child.exitCode}`);
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      });
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`anvil at ${rpcUrl} did not answer within ${timeoutMs}ms: ${String(lastErr)}`);
}

export async function spawnAnvil(opts: { port: number; pkg: string }): Promise<SpawnedAnvil> {
  const rpcUrl = `http://127.0.0.1:${opts.port}`;
  const child = spawn(anvilBinary(), ['--port', String(opts.port), '--chain-id', DEFAULTS.CHAIN_ID, '--silent'], {
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
  child.on('error', (err) => {
    throw new Error(`could not start anvil (${anvilBinary()}): ${err.message}`);
  });

  try {
    await waitForRpc(rpcUrl, child);
  } catch (err) {
    child.kill();
    throw new Error(`${(err as Error).message}\n${stderr}`);
  }

  const deployments = await deployAll({
    rpcUrl,
    adminPrivateKey: DEFAULTS.ADMIN_PRIVATE_KEY,
    issuerAddress: issuerAddressFromKey(DEFAULTS.ISSUER_PRIVATE_KEY),
    issuerName: DEFAULTS.ISSUER_NAME,
    issuerMetadataURI: `${DEFAULTS.ISSUER_PUBLIC_URL}/metadata.json`,
  });
  const deploymentsFile = writeDeploymentsFile(`deployments/test-${opts.pkg}.json`, deployments);

  return {
    rpcUrl,
    port: opts.port,
    deployments,
    deploymentsFile,
    kill: () =>
      new Promise<void>((done) => {
        if (child.exitCode !== null) return done();
        child.once('exit', () => done());
        child.kill();
        setTimeout(() => done(), 3_000).unref();
      }),
  };
}
