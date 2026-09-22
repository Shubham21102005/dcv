// Node-only helpers (uses node:fs). Import via '@dcv/core/chain/deploymentsNode'.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDeployments, type Deployments } from './deployments.js';

/** Walk up from this file to the directory containing pnpm-workspace.yaml. */
export function workspaceRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('workspace root (pnpm-workspace.yaml) not found');
}

/** Resolve a path relative to the workspace root unless it is absolute. */
export function fromRoot(p: string): string {
  return isAbsolute(p) ? p : resolve(workspaceRoot(), p);
}

/** Load the workspace-root .env into process.env (no-op if missing). */
export function loadEnv(): void {
  const file = resolve(workspaceRoot(), '.env');
  if (!existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch (err) {
    console.warn(`could not load ${file}: ${(err as Error).message}`);
  }
}

export function readDeploymentsFile(path: string): Deployments {
  const file = fromRoot(path);
  if (!existsSync(file)) throw new Error(`deployments file not found: ${file} (run: pnpm deploy:local)`);
  return parseDeployments(JSON.parse(readFileSync(file, 'utf8')));
}

export function writeDeploymentsFile(path: string, d: Deployments): string {
  const file = fromRoot(path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(d, null, 2) + '\n');
  return file;
}
