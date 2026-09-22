import { useState } from 'react';
import { wallet } from '../state/app';

export function Unlock({ onUnlocked }: { onUnlocked?: () => void }) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const unlock = async () => {
    setBusy(true);
    setError('');
    try {
      await wallet.unlock(passphrase);
      setPassphrase('');
      onUnlocked?.();
    } catch (err) {
      setError((err as { code?: string }).code === 'BAD_PASSPHRASE' ? 'That passphrase does not open this wallet.' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-narrow stack-lg">
      <div className="stack">
        <h2 className="display display-md">Wallet locked</h2>
        <p className="quiet">Identity <span className="id">{wallet.defaultDid}</span></p>
      </div>
      <div className="stack">
        <label className="field"><span>Passphrase</span><input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlock()} autoFocus autoComplete="current-password" /></label>
        {error && <p className="notice error">{error}</p>}
        <button className="button" onClick={unlock} disabled={busy}>{busy ? 'Unlocking' : 'Unlock'}</button>
      </div>
      <p className="quiet">Forgot it? <a href="#/restore">Restore the wallet from your 12 words</a>.</p>
    </div>
  );
}
