/**
 * Every environment variable the project reads, with its default.
 * Node reads `process.env`; Vite apps read `import.meta.env` (VITE_* only).
 * No variable needs registration anywhere - these are all local defaults.
 */
export const DEFAULTS = {
  RPC_URL: 'http://127.0.0.1:8545',
  CHAIN_ID: '31337',
  // Anvil's well-known test keys (account #0 = admin, #1 = issuer). Local chain only.
  ADMIN_PRIVATE_KEY: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  ISSUER_PRIVATE_KEY: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  ISSUER_NAME: 'Anvil State University',
  ISSUER_PORT: '4001',
  ISSUER_PUBLIC_URL: 'http://localhost:4001',
  VERIFIER_PORT: '4002',
  VERIFIER_PUBLIC_URL: 'http://localhost:4002',
  WALLET_URL: 'http://localhost:5173',
  IPFS_API_URL: 'http://127.0.0.1:5001',
  IPFS_GATEWAY_URL: 'http://127.0.0.1:8080',
  IPFS_PATH: './.ipfs',
  STATUS_LIST_SIZE: '131072',
  NONCE_TTL_SECONDS: '300',
  KB_MAX_AGE_SECONDS: '300',
  DEPLOYMENTS_FILE: 'deployments/anvil.json',
  VITE_RPC_URL: 'http://127.0.0.1:8545',
  VITE_ISSUER_URL: 'http://localhost:4001',
  VITE_VERIFIER_API_URL: 'http://localhost:4002',
  VITE_IPFS_API_URL: 'http://127.0.0.1:5001',
  VITE_IPFS_GATEWAY_URL: 'http://127.0.0.1:8080',
  VITE_AUTO_LOCK_SECONDS: '300',
  PLAYWRIGHT_BASE_URL: 'http://localhost:5174',
} as const;

export type EnvName = keyof typeof DEFAULTS;

type EnvSource = Record<string, string | undefined> | undefined;

function processEnv(): EnvSource {
  const g = globalThis as { process?: { env?: EnvSource } };
  return g.process?.env;
}

function viteEnv(): EnvSource {
  const meta = import.meta as unknown as { env?: EnvSource };
  return meta.env;
}

/** Read one variable: process.env, then import.meta.env, then the default. */
export function env(name: EnvName): string {
  return processEnv()?.[name] ?? viteEnv()?.[name] ?? DEFAULTS[name];
}

export function envInt(name: EnvName): number {
  const n = Number.parseInt(env(name), 10);
  if (!Number.isFinite(n)) throw new Error(`${name} is not an integer: ${env(name)}`);
  return n;
}

/** Typed, resolved configuration (evaluated lazily so .env can be loaded first). */
export function getConfig() {
  return {
    rpcUrl: env('RPC_URL'),
    chainId: envInt('CHAIN_ID'),
    adminPrivateKey: env('ADMIN_PRIVATE_KEY') as `0x${string}`,
    issuerPrivateKey: env('ISSUER_PRIVATE_KEY') as `0x${string}`,
    issuerName: env('ISSUER_NAME'),
    issuerPort: envInt('ISSUER_PORT'),
    issuerPublicUrl: env('ISSUER_PUBLIC_URL'),
    verifierPort: envInt('VERIFIER_PORT'),
    verifierPublicUrl: env('VERIFIER_PUBLIC_URL'),
    walletUrl: env('WALLET_URL'),
    ipfsApiUrl: env('IPFS_API_URL'),
    ipfsGatewayUrl: env('IPFS_GATEWAY_URL'),
    ipfsPath: env('IPFS_PATH'),
    statusListSize: envInt('STATUS_LIST_SIZE'),
    nonceTtlSeconds: envInt('NONCE_TTL_SECONDS'),
    kbMaxAgeSeconds: envInt('KB_MAX_AGE_SECONDS'),
    deploymentsFile: env('DEPLOYMENTS_FILE'),
  };
}

export type Config = ReturnType<typeof getConfig>;
