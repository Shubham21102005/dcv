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
    <section className="stack">
      <div>
        <h2 className="title">Ask for a degree credential</h2>
        <p className="quiet" style={{ marginTop: 4 }}>Tick only what the hiring decision needs. The holder decides what to share.</p>
      </div>
      <div>
        {DISCLOSABLE_CLAIMS.map((c) => (
          <label key={c} className={`choice${selected.has(c) ? '' : ' off'}`}>
            <input type="checkbox" checked={selected.has(c)} onChange={() => toggle(c)} />
            <span>{CLAIM_LABELS[c as DisclosableClaim]}</span>
            <span className="id">{c.replace('credentialSubject.', '')}</span>
          </label>
        ))}
      </div>
      <div className="row">
        <button className="button" onClick={create} disabled={busy}>{busy ? 'Creating' : 'Create request'}</button>
        <span className="quiet">{selected.size} of {DISCLOSABLE_CLAIMS.length} claims</span>
      </div>
      {error && <p className="notice error">{error}</p>}
      {created && (
        <div className="request-ready">
          <div className="stack">
            <h3 className="subtitle">Request ready for the holder</h3>
            <p className="ink-2">Scan the code with the wallet, or open the link on this machine.</p>
            <p className="row">
              <a href={created.walletLink} target="_blank" rel="noopener noreferrer" className="button secondary">Open in wallet</a>
              <button className="button subtle" onClick={() => navigator.clipboard.writeText(created.walletLink)}>Copy link</button>
            </p>
            <p className="quiet">Single-use nonce. Expires at {new Date(created.expiresAt * 1000).toLocaleTimeString()}.</p>
            <p className="id">{created.url}</p>
          </div>
          <div className="qr"><QRCodeSVG value={created.walletLink} size={132} level="M" bgColor="transparent" fgColor="#122a47" /></div>
        </div>
      )}
    </section>
  );
}
