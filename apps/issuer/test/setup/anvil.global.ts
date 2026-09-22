import { spawnAnvil } from '@dcv/core/testing/spawnAnvil';

export default async function setup() {
  const anvil = await spawnAnvil({ port: 8547, pkg: 'issuer' });
  return async () => {
    await anvil.kill();
  };
}
