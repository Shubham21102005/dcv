import { spawnAnvil } from '@dcv/core/testing/spawnAnvil';

export default async function setup() {
  const anvil = await spawnAnvil({ port: 8548, pkg: 'verifier' });
  return async () => {
    await anvil.kill();
  };
}
