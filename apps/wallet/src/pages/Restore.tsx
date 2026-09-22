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
      if (passphrase.length < 8) throw new Error('Use at least 8 characters for the passphrase.');
      const r = await wallet.restoreFromMnemonic(mnemonic, passphrase);
      setDid(r.did);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(code === 'INVALID_MNEMONIC' ? 'That is not a valid list of 12 recovery words. Check the spelling and the order.' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (did) {
    return (
      <div className="page-narrow stack-lg">
        <h2 className="display display-md">Identity restored</h2>
        <p className="id">{did}</p>
        <p className="lede">Your pairwise identities and keys are back. Your credentials come from a backup: an encrypted file, or the encrypted copy on IPFS found through its on-chain pointer.</p>
        <button className="button" onClick={() => navigate('/backup')}>Go to backup and restore</button>
      </div>
    );
  }

  return (
    <div className="page-narrow stack-lg">
      <div className="stack">
        <h2 className="display display-md">Restore from your 12 words</h2>
        <p className="quiet">This replaces whatever wallet is in this browser.</p>
      </div>
      <div className="stack">
        <label className="field"><span>Recovery words</span><textarea rows={3} value={mnemonic} onChange={(e) => setMnemonic(e.target.value)} placeholder="twelve words separated by spaces" /></label>
        <label className="field"><span>New passphrase</span><input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="new-password" /></label>
        {error && <p className="notice error">{error}</p>}
        <button className="button" onClick={restore} disabled={busy}>{busy ? 'Restoring' : 'Restore wallet'}</button>
      </div>
    </div>
  );
}
