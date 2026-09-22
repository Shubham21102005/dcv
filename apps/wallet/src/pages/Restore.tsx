import { useState } from 'react';
import { navigate, wallet } from '../state/app';

export function Restore() {
  const [mnemonic, setMnemonic] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [did, setDid] = useState('');

  const restore = async () => {
    setBusy(true);
    setError('');
    try {
      if (passphrase.length < 8) throw new Error('Passphrase must be at least 8 characters');
      const r = await wallet.restoreFromMnemonic(mnemonic, passphrase);
      setDid(r.did);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(code === 'INVALID_MNEMONIC' ? 'That is not a valid 12-word mnemonic' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (did) {
    return (
      <section className="card narrow">
        <h2>Identity restored</h2>
        <p><code>{did}</code></p>
        <p className="muted">Your pairwise DIDs and keys are back. Credentials come from a backup: import a vault file, or fetch your encrypted IPFS backup via its on-chain pointer.</p>
        <button onClick={() => navigate('/backup')}>Go to backup &amp; restore</button>
      </section>
    );
  }

  return (
    <section className="card narrow">
      <h2>Restore from 12 words</h2>
      <p className="muted">This replaces whatever is in this browser's vault.</p>
      <label>Mnemonic <textarea rows={3} value={mnemonic} onChange={(e) => setMnemonic(e.target.value)} placeholder="twelve words separated by spaces" /></label>
      <label>New passphrase <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <button onClick={restore} disabled={busy}>{busy ? 'Restoring…' : 'Restore identity'}</button>
    </section>
  );
}
