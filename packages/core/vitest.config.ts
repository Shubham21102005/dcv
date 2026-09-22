import { defineConfig } from 'vitest/config';

// Three projects: pure unit tests, vault tests (need an IndexedDB shim),
// and integration tests that run against a self-spawned Anvil (Step 5).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          exclude: ['test/unit/vault*.test.ts', 'test/unit/keyring*.test.ts', 'test/unit/store*.test.ts'],
        },
      },
      {
        test: {
          name: 'vault',
          include: ['test/unit/vault*.test.ts', 'test/unit/keyring*.test.ts', 'test/unit/store*.test.ts'],
          setupFiles: ['fake-indexeddb/auto'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/setup/anvil.global.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
