// App-wide singletons + React hooks.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { chainIsTrustedFor } from './chain';
import { workerDeriveWrapKey } from './kdfWorker';
import { Wallet } from './wallet';

export const wallet = new Wallet({
  keyringOptions: { deriveWrapKey: workerDeriveWrapKey },
  isTrustedFor: chainIsTrustedFor,
});

export const AUTO_LOCK_SECONDS = Number.parseInt((import.meta.env.VITE_AUTO_LOCK_SECONDS as string | undefined) ?? '300', 10) || 300;

let version = 0;
const listeners = new Set<() => void>();
wallet.subscribe(() => {
  version++;
  for (const l of listeners) l();
});

/** Re-render on any wallet change; returns the wallet status. */
export function useWallet() {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return wallet;
}

/** Minimal hash router: "#/present?request=..." -> { path: '/present', params }. */
export function useRoute(): { path: string; params: URLSearchParams } {
  const parse = () => {
    const hash = window.location.hash.replace(/^#/, '') || '/';
    const [path, query = ''] = hash.split('?') as [string, string?];
    return { path, params: new URLSearchParams(query) };
  };
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string): void {
  window.location.hash = path;
}
