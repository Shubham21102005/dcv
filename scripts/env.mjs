// Shared helpers for the root scripts: workspace root, .env loading, tool paths.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

// Load the workspace-root .env (optional: every variable has a default).
const envFile = resolve(root, '.env');
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch (err) {
    console.warn(`could not load ${envFile}: ${err.message}`);
  }
}

export const env = (name, fallback) => process.env[name] ?? fallback;

const exe = process.platform === 'win32' ? '.exe' : '';

/** Resolve a Foundry binary: PATH first, then ~/.foundry/bin. */
export function foundryBin(name) {
  const local = resolve(homedir(), '.foundry', 'bin', `${name}${exe}`);
  return existsSync(local) ? local : name;
}
export const forgeBin = () => foundryBin('forge');
export const anvilBin = () => foundryBin('anvil');
export const castBin = () => foundryBin('cast');

/** Resolve the Kubo binary: PATH first, then C:\tools\kubo on Windows. */
export function ipfsBin() {
  const candidates = process.platform === 'win32' ? ['C:\\tools\\kubo\\ipfs.exe'] : ['/usr/local/bin/ipfs'];
  for (const c of candidates) if (existsSync(c)) return c;
  return 'ipfs';
}
