// pnpm e2e:full - the whole thing unattended: reset -> boot the stack -> pnpm e2e -> tear down.
// Exit code = the e2e result. Useful for "green twice in a row" and CI.
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root } from './env.mjs';
import { killTree, nodeBin } from './proc.mjs';

const run = (args) => spawnSync(process.execPath, args, { stdio: 'inherit', cwd: root });

run([resolve(root, 'scripts/reset.mjs')]);

const dev = spawn(process.execPath, [resolve(root, 'scripts/dev.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let ready = false;
let buf = '';
const onData = (d) => {
  buf += d.toString();
  process.stdout.write(d);
  if (buf.includes('[dev] ready')) ready = true;
};
dev.stdout.on('data', onData);
dev.stderr.on('data', onData);

const started = Date.now();
while (!ready && Date.now() - started < 120_000 && dev.exitCode === null) await new Promise((r) => setTimeout(r, 300));
let code = 1;
if (!ready) {
  console.error('[e2e:full] stack did not become ready');
} else {
  console.log('\n[e2e:full] stack ready - running pnpm e2e\n');
  code = run([nodeBin.tsx, resolve(root, 'scripts/e2e.ts')]).status ?? 1;
}
killTree(dev.pid);
run([resolve(root, 'scripts/reset.mjs')]);
console.log(`\n[e2e:full] ${code === 0 ? 'PASSED' : 'FAILED'}`);
process.exit(code);
