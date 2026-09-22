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
      setError((err as { code?: string }).code === 'BAD_PASSPHRASE' ? 'Wrong passphrase' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card narrow">
      <h2>Vault locked</h2>
      <p className="muted">Identity <code>{wallet.defaultDid}</code></p>
      <label>Passphrase <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlock()} autoFocus /></label>
      {error && <p className="error">{error}</p>}
      <button onClick={unlock} disabled={busy}>{busy ? 'Unlocking…' : 'Unlock'}</button>
      <p className="muted">Lost the passphrase? <a href="#/restore">Restore from your 12 words</a>.</p>
    </section>
  );
}
