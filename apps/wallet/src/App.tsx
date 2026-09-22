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
    if (!confirm('Wipe this wallet (IndexedDB) and reload?')) return;
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
      <header>
        <div onClick={() => navigate('/credentials')} className="brand">
          <h1>DCV Wallet</h1>
          <p className="muted">{wallet.defaultDid ? <code>{wallet.defaultDid}</code> : 'self-sovereign credentials vault'}</p>
        </div>
        <nav>
          {status === 'unlocked' && <span className="badge ok">unlocked · auto-lock {AUTO_LOCK_SECONDS}s idle</span>}
          {status === 'unlocked' && <button className="ghost" onClick={() => wallet.lock()}>Lock</button>}
          <button className="danger" onClick={resetDemo}>Reset demo</button>
        </nav>
      </header>
      <main>{page}</main>
    </>
  );
}
