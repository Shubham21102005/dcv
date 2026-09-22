import { useEffect, useState } from 'react';
import { CLAIM_LABELS, DISCLOSABLE_CLAIMS, type DisclosableClaim } from '@dcv/core/sdjwt/frames';
import { credentialStatus, type CredentialStatus } from '../state/chain';
import { navigate, useWallet } from '../state/app';
import type { StoredCredential } from '../state/wallet';

export function StatusBadge({ status }: { status: CredentialStatus | null }) {
  if (!status) return <span className="badge neutral">checking…</span>;
  if (status.state === 'valid') return <span className="badge ok" title={`bit ${status.bit} clear in status list v${status.version}`}>valid · list v{status.version}</span>;
  if (status.state === 'revoked') return <span className="badge bad" title={`bit ${status.bit} set in status list v${status.version}`}>REVOKED · list v{status.version}</span>;
  if (status.state === 'expired') return <span className="badge warn">expired</span>;
  return <span className="badge neutral" title={status.reason}>status unknown</span>;
}

export function useCredentials() {
  const wallet = useWallet();
  const [creds, setCreds] = useState<StoredCredential[]>([]);
  const [statuses, setStatuses] = useState<Record<string, CredentialStatus | null>>({});
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (wallet.status !== 'unlocked') return;
      const list = await wallet.listCredentials();
      if (cancelled) return;
      setCreds(list);
      for (const c of list) credentialStatus(c).then((s) => !cancelled && setStatuses((prev) => ({ ...prev, [c.id]: s })));
    };
    void load();
    const t = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [wallet, wallet.status]);
  return { creds, statuses };
}

export function claimValue(cred: StoredCredential, path: string): string | undefined {
  let node: unknown = cred.claims;
  for (const key of path.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node === undefined ? undefined : String(node);
}

export function Credentials() {
  const { creds, statuses } = useCredentials();
  return (
    <section>
      <div className="row-between">
        <h2>My credentials</h2>
        <a href="#/backup" className="ghost-link">Backup &amp; restore</a>
      </div>
      {creds.length === 0 && (
        <div className="card">
          <p className="muted">Your vault is empty. Ask an issuer for a credential - in the demo, click <strong>Issue</strong> in the university console and then <strong>Open in wallet</strong>.</p>
        </div>
      )}
      <div className="cards">
        {creds.map((c) => (
          <article key={c.id} className="cred" onClick={() => navigate(`/credential/${encodeURIComponent(c.id)}`)}>
            <div className="row-between">
              <span className="type">{c.type.filter((t) => t !== 'VerifiableCredential').join(', ')}</span>
              <StatusBadge status={statuses[c.id] ?? null} />
            </div>
            <h3>{claimValue(c, 'credentialSubject.degree.name') ?? '(hidden)'}</h3>
            <p className="muted">issued by <strong>{c.issuerName || c.issuerDid}</strong></p>
            <p className="muted small">bound to pairwise DID <code>{c.holderDid.slice(0, 26)}…</code></p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CredentialDetail({ id }: { id: string }) {
  const wallet = useWallet();
  const [cred, setCred] = useState<StoredCredential | null>(null);
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  useEffect(() => {
    wallet.getCredential(id).then((c) => {
      setCred(c);
      if (c) credentialStatus(c).then(setStatus);
    });
  }, [wallet, id]);
  if (!cred) return <section className="card"><p className="muted">Loading…</p></section>;
  const validFrom = (cred.claims as { validFrom?: string }).validFrom;
  const validUntil = (cred.claims as { validUntil?: string }).validUntil;
  return (
    <section className="card">
      <a href="#/credentials" className="ghost-link">← back</a>
      <div className="row-between">
        <h2>{cred.type.filter((t) => t !== 'VerifiableCredential').join(', ')}</h2>
        <StatusBadge status={status} />
      </div>
      <table>
        <tbody>
          <tr><td className="muted">Issuer</td><td>{cred.issuerName} <code>{cred.issuerDid}</code></td></tr>
          <tr><td className="muted">Bound to</td><td><code>{cred.holderDid}</code> <span className="muted small">(pairwise DID for this issuer)</span></td></tr>
          <tr><td className="muted">Valid</td><td>{validFrom} → {validUntil}</td></tr>
          {cred.credentialStatus && <tr><td className="muted">Status entry</td><td>bit {cred.credentialStatus.statusListIndex} of <code>{cred.credentialStatus.statusListCredential}</code></td></tr>}
        </tbody>
      </table>
      <h3>Claims <span className="muted">(each chip can be disclosed on its own)</span></h3>
      <div className="chips">
        {DISCLOSABLE_CLAIMS.map((path) => (
          <div key={path} className="chip">
            <span className="muted">{CLAIM_LABELS[path as DisclosableClaim]}</span>
            <strong>{claimValue(cred, path) ?? '—'}</strong>
          </div>
        ))}
      </div>
      <details>
        <summary className="muted">Raw SD-JWT ({cred.sdJwt.length} chars)</summary>
        <pre>{cred.sdJwt}</pre>
      </details>
      <button className="danger ghost" onClick={async () => { if (confirm('Delete this credential from the vault?')) { await wallet.removeCredential(cred.id); navigate('/credentials'); } }}>Delete</button>
    </section>
  );
}
