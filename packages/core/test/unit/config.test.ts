import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULTS, env, envInt, getConfig } from '../../src/config.js';

// The table from PLAN.md section 11 - the single source of truth for defaults.
const PLAN_TABLE: Record<string, string> = {
  RPC_URL: 'http://127.0.0.1:8545',
  CHAIN_ID: '31337',
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
};

describe('config defaults', () => {
  afterEach(() => {
    delete process.env['RPC_URL'];
    delete process.env['CHAIN_ID'];
  });

  it('matches the PLAN.md section 11 table exactly', () => {
    expect(DEFAULTS).toEqual(PLAN_TABLE);
  });

  it('process.env overrides a default', () => {
    expect(env('RPC_URL')).toBe(PLAN_TABLE['RPC_URL']);
    process.env['RPC_URL'] = 'http://127.0.0.1:9999';
    expect(env('RPC_URL')).toBe('http://127.0.0.1:9999');
    expect(getConfig().rpcUrl).toBe('http://127.0.0.1:9999');
  });

  it('parses integers and rejects garbage', () => {
    expect(envInt('CHAIN_ID')).toBe(31337);
    expect(getConfig().statusListSize).toBe(131072);
    process.env['CHAIN_ID'] = 'abc';
    expect(() => envInt('CHAIN_ID')).toThrow(/CHAIN_ID/);
  });
});
