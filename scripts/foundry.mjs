// node scripts/foundry.mjs <forge|anvil|cast> [args...] - runs the Foundry binary
// from PATH or ~/.foundry/bin, so the root scripts work even when PATH was not
// refreshed after installing Foundry.
import { spawnSync } from 'node:child_process';
import { foundryBin } from './env.mjs';

const [tool, ...args] = process.argv.slice(2);
if (!tool) {
  console.error('usage: node scripts/foundry.mjs <forge|anvil|cast> [args...]');
  process.exit(2);
}
const r = spawnSync(foundryBin(tool), args, { stdio: 'inherit' });
if (r.error) {
  console.error(`could not run ${tool}: ${r.error.message} (install Foundry - see PLAN.md Step 0)`);
  process.exit(1);
}
process.exit(r.status ?? 1);
