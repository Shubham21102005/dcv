import { useRef, useState } from 'react';
import { navigate, useWallet } from '../state/app';
import { backupToIpfs, restoreFromIpfs } from '../state/backup';
import { ipfsBackupDeps } from '../state/chain';

export function Backup() {
  const wallet = useWallet();
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const exportFile = async () => {
    try {
      const file = await wallet.exportFile();
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'vault.dcv.json';
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg(`Exported ${file.records.length} encrypted record(s) + wrapped seed. Ciphertext only - safe to store anywhere.`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const importFile = async (f: File) => {
    try {
      await wallet.importFile(await f.text());
      setMsg('Vault file imported. Unlock it with the passphrase used when it was exported.');
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="card narrow">
      <a href="#/credentials" className="ghost-link">← back</a>
      <h2>Backup &amp; restore</h2>
      <h3>Encrypted file</h3>
      <p className="muted">The file holds the argon2id-wrapped seed and AES-GCM records; nothing readable without the passphrase.</p>
      <p>
        <button onClick={exportFile}>Export vault.dcv.json</button>{' '}
        <button className="ghost" onClick={() => fileInput.current?.click()}>Import a vault file</button>
        <input ref={fileInput} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
      </p>
      <h3>IPFS backup</h3>
      <p className="muted">AES-256-GCM bundle pinned on the local IPFS node; its CID is encrypted and written to <code>VaultPointer</code> from a pseudonymous, seed-derived address. Nothing on chain or IPFS links to you.</p>
      <BackupIpfs />
      <h3>Restore on a new device</h3>
      <p className="muted">Only the 12 words are needed: <a href="#/restore">restore from mnemonic</a>.</p>
      {msg && <p className="ok-text">{msg}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function BackupIpfs() {
  const wallet = useWallet();
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null);
  const [out, setOut] = useState('');
  const [err, setErr] = useState('');

  const run = async (kind: 'backup' | 'restore') => {
    setBusy(kind);
    setErr('');
    setOut('');
    try {
      const deps = await ipfsBackupDeps();
      if (kind === 'backup') {
        const r = await backupToIpfs(wallet, deps);
        setOut(`Backed up ${r.records} record(s) as ${r.bytes} bytes of ciphertext → ${r.cid}. Encrypted pointer written from ${r.pointerAddress} (tx ${r.txHash.slice(0, 14)}…). Try: ipfs cat ${r.cid} --length 80`);
      } else {
        const r = await restoreFromIpfs(wallet, deps);
        setOut(`Restored ${r.records} record(s) from ${r.cid}.`);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <p>
        <button onClick={() => run('backup')} disabled={busy !== null}>{busy === 'backup' ? 'Backing up…' : 'Backup to IPFS'}</button>{' '}
        <button className="ghost" onClick={() => run('restore')} disabled={busy !== null}>{busy === 'restore' ? 'Restoring…' : 'Restore from IPFS pointer'}</button>
      </p>
      {out && <p className="ok-text small">{out}</p>}
      {err && <p className="error">{err}</p>}
    </div>
  );
}
