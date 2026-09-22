import type { Address, TestClient } from 'viem';

/** Fund an address on Anvil (cheat code; production would use a paymaster/relayer). */
export async function setBalance(test: TestClient<'anvil'>, address: Address, value: bigint): Promise<void> {
  await test.setBalance({ address, value });
}

/**
 * Run `fn` inside an evm_snapshot / evm_revert pair so chain mutations made by a
 * test never leak into the next one.
 */
export async function withSnapshot<T>(test: TestClient<'anvil'>, fn: () => Promise<T>): Promise<T> {
  const id = await test.snapshot();
  try {
    return await fn();
  } finally {
    await test.revert({ id });
  }
}

/** Advance Anvil's clock by `seconds` and mine one block. */
export async function increaseTime(test: TestClient<'anvil'>, seconds: number): Promise<void> {
  await test.increaseTime({ seconds });
  await test.mine({ blocks: 1 });
}
