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
    if (passphrase.length < 8) return setError('Use at least 8 characters for the passphrase.');
    if (passphrase !== confirm) return setError('The two passphrases are different.');
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
      <div className="page-narrow stack-lg">
        <div className="stack">
          <h2 className="display display-md">Create your wallet</h2>
          <p className="lede">Nobody issues you a key. The wallet generates 12 words, derives every key from them, and locks the result behind your passphrase.</p>
        </div>
        <div className="stack">
          <label className="field"><span>Passphrase</span><input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoFocus autoComplete="new-password" /></label>
          <label className="field"><span>Passphrase again</span><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} autoComplete="new-password" /></label>
          {error && <p className="notice error">{error}</p>}
          {phase === 'working' ? (
            <div className="progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${progress}%` }} /><span>Deriving your keys with argon2id (32 MiB)</span></div>
          ) : (
            <button className="button" onClick={create}>Create wallet</button>
          )}
        </div>
        <p className="quiet">Already have 12 words? <a href="#/restore">Restore your wallet</a> instead.</p>
      </div>
    );
  }

  if (phase === 'mnemonic') {
    return (
      <div className="page-narrow stack-lg">
        <div className="stack">
          <h2 className="display display-md">Write these 12 words down</h2>
          <p className="lede">They are shown once. They recreate your identities, your vault key and your backup key on any device.</p>
        </div>
        <ol className="mnemonic">{mnemonic.split(' ').map((w, i) => <li key={i}>{w}</li>)}</ol>
        <label className="choice"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /><span>I have written them down somewhere safe</span><span /></label>
        <button className="button" disabled={!saved} onClick={() => setPhase('done')}>Continue</button>
      </div>
    );
  }

  return (
    <div className="page-narrow stack-lg">
      <h2 className="display display-md">Your wallet is ready</h2>
      <div className="did-card">
        <QRCodeSVG value={did} size={112} level="M" bgColor="transparent" fgColor="#122a47" />
        <div className="stack">
          <span className="label">Your identity</span>
          <span className="id">{did}</span>
          <p className="quiet">This one is for display. Each issuer receives a separate, pairwise identity, so issuers cannot recognise you across each other.</p>
        </div>
      </div>
      <button className="button" onClick={() => navigate('/credentials')}>Open my vault</button>
    </div>
  );
}
