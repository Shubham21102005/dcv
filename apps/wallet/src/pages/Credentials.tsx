import { useEffect, useState } from 'react';
import { CLAIM_LABELS, DISCLOSABLE_CLAIMS, type DisclosableClaim } from '@dcv/core/sdjwt/frames';
import { credentialStatus, type CredentialStatus } from '../state/chain';
import { navigate, useWallet } from '../state/app';
import type { StoredCredential } from '../state/wallet';
import { CredentialCard, StatusMark, claimValue } from './CredentialCard';

export { claimValue } from './CredentialCard';

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

export function Credentials() {
  const { creds, statuses } = useCredentials();
  const justAccepted = sessionStorage.getItem('dcv:just-accepted');
  useEffect(() => {
    if (justAccepted) sessionStorage.removeItem('dcv:just-accepted');
  }, [justAccepted]);

  return (
    <div className="page-narrow stack-lg">
      <div className="row-between">
        <h2 className="title">Your credentials</h2>
        <a href="#/backup">Back up or restore</a>
      </div>
      {creds.length === 0 ? (
        <div className="empty prose">
          <p className="lede">Nothing here yet.</p>
          <p className="ink-2" style={{ marginTop: 8 }}>
            A credential arrives as an offer link from an issuer. In the demo, open the university console, fill in the form and choose <strong>Create offer</strong>, then <strong>Open in wallet</strong>.
          </p>
        </div>
      ) : (
        <div className="cards">
          {creds.map((c) => (
            <CredentialCard key={c.id} cred={c} status={statuses[c.id] ?? null} deal={justAccepted === c.id} onOpen={() => navigate(`/credential/${encodeURIComponent(c.id)}`)} />
          ))}
        </div>
      )}
    </div>
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
  if (!cred) return <div className="page-narrow"><p className="quiet">Opening…</p></div>;
  const validFrom = (cred.claims as { validFrom?: string }).validFrom;
  const validUntil = (cred.claims as { validUntil?: string }).validUntil;
  return (
    <div className="page-narrow stack-lg">
      <a href="#/credentials">Back to your credentials</a>
      <CredentialCard cred={cred} status={status} />
      <section className="section">
        <dl className="kv">
          <dt>Issued by</dt>
          <dd>{cred.issuerName}<br /><span className="id">{cred.issuerDid}</span></dd>
          <dt>Bound to</dt>
          <dd><span className="id">{cred.holderDid}</span><br /><span className="quiet">your pairwise identity for this issuer; no other issuer sees it</span></dd>
          <dt>Valid</dt>
          <dd>{validFrom?.slice(0, 10)} to {validUntil?.slice(0, 10)}</dd>
          {cred.credentialStatus && (
            <>
              <dt>Revocation</dt>
              <dd><StatusMark status={status} /><br /><span className="quiet">bit {cred.credentialStatus.statusListIndex} of the list at </span><span className="id">{cred.credentialStatus.statusListCredential}</span></dd>
            </>
          )}
        </dl>
      </section>
      <section className="section">
        <h2 className="subtitle">Claims you can share one by one</h2>
        <div className="claims" style={{ marginTop: 10 }}>
          {DISCLOSABLE_CLAIMS.map((path) => (
            <div key={path}>
              <span className="label">{CLAIM_LABELS[path as DisclosableClaim]}</span>
              <strong>{claimValue(cred, path) ?? '—'}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="section">
        <details>
          <summary>Signed token as received ({cred.sdJwt.length} characters)</summary>
          <pre className="raw" style={{ marginTop: 10 }}>{cred.sdJwt}</pre>
        </details>
      </section>
      <section className="section">
        <button className="button destructive" onClick={async () => { if (confirm('Remove this credential from your wallet? You would need a new offer from the issuer to get it back.')) { await wallet.removeCredential(cred.id); navigate('/credentials'); } }}>
          Remove from wallet
        </button>
      </section>
    </div>
  );
}
