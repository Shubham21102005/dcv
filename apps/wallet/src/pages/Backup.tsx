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
      setMsg(`Saved vault.dcv.json with ${file.records.length} encrypted record${file.records.length === 1 ? '' : 's'} and the wrapped seed. It is ciphertext only.`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const importFile = async (f: File) => {
    try {
      await wallet.importFile(await f.text());
      setMsg('Vault file loaded. Unlock it with the passphrase it was saved with.');
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="page-narrow stack-lg">
      <a href="#/credentials">Back to your credentials</a>
      <h2 className="display display-md">Backup and restore</h2>
      <section className="section stack">
        <h3 className="subtitle">Encrypted file</h3>
        <p className="prose ink-2">The file holds your argon2id-wrapped seed and the AES-GCM records. Without the passphrase it is noise.</p>
        <div className="row">
          <button className="button" onClick={exportFile}>Save vault file</button>
          <button className="button secondary" onClick={() => fileInput.current?.click()}>Load a vault file</button>
          <input ref={fileInput} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </div>
      </section>
      <section className="section stack">
        <h3 className="subtitle">Copy on IPFS</h3>
        <p className="prose ink-2">An AES-256-GCM bundle is pinned on the local IPFS node. Its address is encrypted and written to the VaultPointer contract from a pseudonymous account derived from your seed, so nothing on chain or IPFS points back at you.</p>
        <BackupIpfs />
      </section>
      <section className="section stack">
        <h3 className="subtitle">New device</h3>
        <p className="prose ink-2">Only the 12 words are needed: <a href="#/restore">restore the wallet from them</a>, then fetch the copy on IPFS.</p>
      </section>
      {msg && <p className="notice ok">{msg}</p>}
      {error && <p className="notice error">{error}</p>}
    </div>
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
        setOut(`Backed up ${r.records} record${r.records === 1 ? '' : 's'} as ${r.bytes} bytes of ciphertext at ${r.cid}. The encrypted pointer was written from ${r.pointerAddress}. Try it yourself: ipfs cat ${r.cid} --length 80`);
      } else {
        const r = await restoreFromIpfs(wallet, deps);
        setOut(`Restored ${r.records} record${r.records === 1 ? '' : 's'} from ${r.cid}.`);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack">
      <div className="row">
        <button className="button" onClick={() => run('backup')} disabled={busy !== null}>{busy === 'backup' ? 'Backing up' : 'Back up to IPFS'}</button>
        <button className="button secondary" onClick={() => run('restore')} disabled={busy !== null}>{busy === 'restore' ? 'Restoring' : 'Restore from IPFS'}</button>
      </div>
      {out && <p className="notice ok" style={{ overflowWrap: 'anywhere' }}>{out}</p>}
      {err && <p className="notice error">{err}</p>}
    </div>
  );
}
