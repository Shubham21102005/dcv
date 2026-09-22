// pnpm stop:issuer - the "issuer is offline" demo beat. Kills only the issuer
// process (PID from data/issuer.pid); anvil, ipfs and the other apps keep running.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './env.mjs';
import { killTree } from './proc.mjs';

const pidFile = resolve(root, 'data/issuer.pid');
if (!existsSync(pidFile)) {
  console.error('[stop-issuer] data/issuer.pid not found - is the issuer running?');
  process.exit(1);
}
const pid = Number(readFileSync(pidFile, 'utf8').trim());
killTree(pid);
rmSync(pidFile, { force: true });
console.log(`[stop-issuer] issuer (pid ${pid}) stopped. Verifications must keep working without it.`);
