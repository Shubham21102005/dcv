import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { CLAIM_LABELS, DISCLOSABLE_CLAIMS, type DisclosableClaim } from '@dcv/core/sdjwt/frames';
import { api, type RequestSummary } from './api';

export function RequestBuilder(props: { onCreated: (r: RequestSummary) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(['credentialSubject.degree.name']));
  const [created, setCreated] = useState<RequestSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (c: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.create(DISCLOSABLE_CLAIMS.filter((c) => selected.has(c)));
      setCreated(r);
      props.onCreated(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>New presentation request</h2>
      <p className="muted">Credential type: <code>UniversityDegreeCredential</code>. Tick only what Acme actually needs.</p>
      <div className="claims">
        {DISCLOSABLE_CLAIMS.map((c) => (
          <label key={c} className={selected.has(c) ? 'claim on' : 'claim'}>
            <input type="checkbox" checked={selected.has(c)} onChange={() => toggle(c)} />
            <span>{CLAIM_LABELS[c as DisclosableClaim]}</span>
            <code>{c}</code>
          </label>
        ))}
      </div>
      <button onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create request'}</button>
      {error && <p className="error">{error}</p>}
      {created && (
        <div className="offer">
          <div>
            <h3>Request ready</h3>
            <p>Scan with the wallet or open the link:</p>
            <p>
              <a href={created.walletLink} target="_blank" rel="noopener noreferrer" className="primary-link">Open in wallet</a>{' '}
              · <button className="ghost" onClick={() => navigator.clipboard.writeText(created.walletLink)}>Copy link</button>
            </p>
            <p className="muted">Request URL: <code>{created.url}</code></p>
            <p className="muted">Expires {new Date(created.expiresAt * 1000).toLocaleTimeString()} · single-use nonce</p>
          </div>
          <QRCodeSVG value={created.walletLink} size={148} level="M" includeMargin />
        </div>
      )}
    </section>
  );
}
