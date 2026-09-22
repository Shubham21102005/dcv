import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { navigate, wallet } from '../state/app';

export function Onboard() {
  const [phase, setPhase] = useState<'passphrase' | 'working' | 'mnemonic' | 'done'>('passphrase');
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [did, setDid] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);

  const create = async () => {
    if (passphrase.length < 8) return setError('Passphrase must be at least 8 characters');
    if (passphrase !== confirm) return setError('Passphrases do not match');
    setError('');
    setPhase('working');
    navigate('/onboard'); // keep this screen mounted after the vault exists (mnemonic reveal)
    const started = Date.now();
    const tick = setInterval(() => setProgress(Math.min(95, ((Date.now() - started) / 1200) * 100)), 50);
    try {
      const r = await wallet.create(passphrase);
      setMnemonic(r.mnemonic);
      setDid(r.did);
      setProgress(100);
      setPhase('mnemonic');
    } catch (err) {
      setError((err as Error).message);
      setPhase('passphrase');
    } finally {
      clearInterval(tick);
    }
  };

  if (phase === 'passphrase' || phase === 'working') {
    return (
      <section className="card narrow">
        <h2>Create your identity</h2>
        <p className="muted">Nobody issues you a key. Your wallet generates 12 words; everything else is derived from them and encrypted with this passphrase (argon2id → AES-256-GCM).</p>
        <label>Passphrase <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoFocus /></label>
        <label>Confirm <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} /></label>
        {error && <p className="error">{error}</p>}
        {phase === 'working' ? (
          <div className="progress"><div style={{ width: `${progress}%` }} /><span>Deriving keys (argon2id, 32 MiB)…</span></div>
        ) : (
          <button onClick={create}>Create identity</button>
        )}
        <p className="muted">Already have 12 words? <a href="#/restore">Restore instead</a>.</p>
      </section>
    );
  }

  if (phase === 'mnemonic') {
    return (
      <section className="card narrow">
        <h2>Write these 12 words down</h2>
        <p className="muted">They are shown once. They recreate your DIDs, your vault key and your backup key on any device.</p>
        <ol className="mnemonic">{mnemonic.split(' ').map((w, i) => <li key={i}><span>{i + 1}</span>{w}</li>)}</ol>
        <label className="check"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have saved them somewhere safe</label>
        <button disabled={!saved} onClick={() => setPhase('done')}>Continue</button>
      </section>
    );
  }

  return (
    <section className="card narrow">
      <h2>Your identity</h2>
      <div className="did-card">
        <QRCodeSVG value={did} size={120} level="M" />
        <div>
          <p className="muted">Default DID (display only - each issuer gets its own pairwise DID)</p>
          <code>{did}</code>
        </div>
      </div>
      <button onClick={() => navigate('/credentials')}>Open my vault</button>
    </section>
  );
}
