// Fetch a status list by its on-chain anchor: IPFS gateway first, the signed
// fallback URL (the statusListCredential inside the credential) only if IPFS is down.
import type { Address, PublicClient } from 'viem';
import type { Deployments } from '../chain/deployments.js';
import { getStatusList, type StatusListAnchor } from '../chain/statusRegistry.js';

export interface FetchedStatusList {
  jwt: string;
  anchor: StatusListAnchor;
  source: 'ipfs' | 'fallback';
  url: string;
}

export type StatusListFetcher = (issuer: Address, listId: number, fallbackUrl: string) => Promise<FetchedStatusList>;

export function makeStatusListFetcher(opts: {
  publicClient: PublicClient;
  deployments: Pick<Deployments, 'statusRegistry'>;
  gatewayUrl: string;
  /** Set false to forbid the HTTP fallback (e.g. in tests that must never reach the issuer). */
  allowFallback?: boolean;
  fetchFn?: () => typeof fetch;
}): StatusListFetcher {
  const gateway = opts.gatewayUrl.replace(/\/$/, '');
  return async (issuer, listId, fallbackUrl) => {
    const anchor = await getStatusList(opts.publicClient, opts.deployments, issuer, listId);
    if (anchor.version === 0) throw new Error(`no status list anchored for ${issuer} list ${listId}`);
    const f = opts.fetchFn ? opts.fetchFn() : globalThis.fetch;
    const gatewayUrl = `${gateway}/ipfs/${anchor.cid}`;
    try {
      const res = await f(gatewayUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return { jwt: (await res.text()).trim(), anchor, source: 'ipfs', url: gatewayUrl };
      throw new Error(`gateway ${res.status}`);
    } catch (err) {
      if (opts.allowFallback === false) throw err;
      const res = await f(fallbackUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`status list unavailable: gateway failed (${(err as Error).message}) and fallback ${res.status}`);
      return { jwt: (await res.text()).trim(), anchor, source: 'fallback', url: fallbackUrl };
    }
  };
}
