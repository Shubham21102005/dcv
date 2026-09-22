import { describe, expect, it } from 'vitest';
import { makeVerifier } from './helpers.js';

describe('verifier-api: CORS', () => {
  it('answers preflight from the wallet origin and rejects strangers', async () => {
    const { app } = await makeVerifier();
    const res = await app.request('/requests/x/presentation', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const web = await app.request('/health', { headers: { Origin: 'http://localhost:5174' } });
    expect(web.headers.get('access-control-allow-origin')).toBe('http://localhost:5174');
    const evil = await app.request('/health', { headers: { Origin: 'http://evil.example' } });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});
