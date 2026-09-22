import { useRef, useState } from 'react';
import { navigate, useWallet } from '../state/app';

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
      <p className="muted">Encrypted bundle on IPFS + an encrypted pointer written from a pseudonymous address (Step 16).</p>
      <BackupIpfs />
      <h3>Restore on a new device</h3>
      <p className="muted">Only the 12 words are needed: <a href="#/restore">restore from mnemonic</a>.</p>
      {msg && <p className="ok-text">{msg}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

// Filled in by Step 16 (IPFS backup + VaultPointer).
function BackupIpfs() {
  return <p className="muted small">Coming in Step 16.</p>;
}
