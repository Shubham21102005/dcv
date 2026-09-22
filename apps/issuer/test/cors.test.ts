import { describe, expect, it } from 'vitest';
import { makeIssuer } from './helpers.js';

describe('issuer: CORS', () => {
  const { app } = makeIssuer();

  it('answers preflight from the wallet origin', async () => {
    const res = await app.request('/offers/x/claim', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('does not allow an unknown origin', async () => {
    const res = await app.request('/health', { headers: { Origin: 'http://evil.example' } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('serves issuer metadata', async () => {
    const res = await app.request('/metadata.json');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { name: string }).name).toBe('Anvil State University');
  });
});
