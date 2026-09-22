// Vitest globalSetup for the integration project: one private Anvil on :8546
// for the whole run, deployed + seeded, written to deployments/test-core.json.
import { spawnAnvil } from '../../src/testing/spawnAnvil.js';

export default async function setup() {
  const anvil = await spawnAnvil({ port: 8546, pkg: 'core' });
  return async () => {
    await anvil.kill();
  };
}
