import { useEffect, useState } from 'react';
import { AUTO_LOCK_SECONDS, navigate, useRoute, useWallet } from './state/app';
import { startIdleLock } from './state/idleLock';
import { Accept } from './pages/Accept';
import { Backup } from './pages/Backup';
import { CredentialDetail, Credentials } from './pages/Credentials';
import { Onboard } from './pages/Onboard';
import { Present } from './pages/Present';
import { Restore } from './pages/Restore';
import { Unlock } from './pages/Unlock';

function shortDid(did: string): string {
  const addr = did.slice(did.lastIndexOf(':') + 1);
  return `${did.slice(0, did.lastIndexOf(':') + 1)}${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export default function App() {
  const wallet = useWallet();
  const route = useRoute();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    wallet.init().then(() => setReady(true));
  }, [wallet]);

  // Idle auto-lock while unlocked.
  useEffect(() => {
    if (wallet.status !== 'unlocked') return;
    const handle = startIdleLock({ seconds: AUTO_LOCK_SECONDS, onIdle: () => wallet.lock() });
    return () => handle.stop();
  }, [wallet, wallet.status]);

  const resetDemo = async () => {
    if (!confirm('Erase this wallet from the browser and start over?')) return;
    await wallet.wipe();
    indexedDB.deleteDatabase('dcv');
    location.hash = '';
    location.reload();
  };

  if (!ready) return null;

  let page: React.ReactNode;
  const status = wallet.status;
  if (route.path === '/restore') page = <Restore />;
  // Stay on the onboarding screen (mnemonic reveal) until it navigates away itself.
  else if (status === 'none' || route.path === '/onboard') page = <Onboard />;
  else if (status === 'locked') page = <Unlock />;
  else if (route.path === '/accept') page = <Accept offerUrl={route.params.get('offer') ?? ''} />;
  else if (route.path === '/present') page = <Present requestUrl={route.params.get('request') ?? ''} />;
  else if (route.path === '/backup') page = <Backup />;
  else if (route.path.startsWith('/credential/')) page = <CredentialDetail id={decodeURIComponent(route.path.slice('/credential/'.length))} />;
  else page = <Credentials />;

  return (
    <>
      <header className="page masthead">
        <a className="wordmark" href="#/credentials" onClick={(e) => { e.preventDefault(); navigate('/credentials'); }}>
          Wallet
          <small>{wallet.defaultDid ? <span className="id" title={wallet.defaultDid}>{shortDid(wallet.defaultDid)}</span> : 'your credentials, your keys'}</small>
        </a>
        <nav aria-label="wallet">
          {status === 'unlocked' && <span className="mark ok" title={`locks after ${AUTO_LOCK_SECONDS} s without activity`}>unlocked</span>}
          {status === 'unlocked' && <button className="button subtle" onClick={() => wallet.lock()}>Lock</button>}
          <button className="button subtle" onClick={resetDemo}>Erase wallet</button>
        </nav>
      </header>
      <main>{page}</main>
    </>
  );
}
