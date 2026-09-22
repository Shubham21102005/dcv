import { useEffect, useState } from 'react';
import { CLAIM_LABELS, DISCLOSABLE_CLAIMS, type DisclosableClaim } from '@dcv/core/sdjwt/frames';
import type { VerificationReport } from '@dcv/core/verifier/report';
import { navigate, useWallet } from '../state/app';
import type { RequestDetails, StoredCredential } from '../state/wallet';
import { claimValue } from './Credentials';

export function Present({ requestUrl }: { requestUrl: string }) {
  const wallet = useWallet();
  const [req, setReq] = useState<RequestDetails | null>(null);
  const [creds, setCreds] = useState<StoredCredential[]>([]);
  const [chosen, setChosen] = useState<StoredCredential | null>(null);
  const [consent, setConsent] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ state: string; report: VerificationReport | null } | null>(null);

  useEffect(() => {
    Promise.all([wallet.fetchRequest(requestUrl), wallet.listCredentials()])
      .then(([r, list]) => {
        setReq(r);
        // consent defaults to exactly what was requested - never more
        setConsent(new Set(r.claims));
        const matching = list.filter((c) => c.type.includes(r.credentialType));
        setCreds(matching);
        setChosen(matching[0] ?? null);
      })
      .catch((err) => setError((err as Error).message));
  }, [wallet, requestUrl]);

  const toggle = (path: string) =>
    setConsent((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const present = async () => {
    if (!req || !chosen) return;
    setBusy(true);
    setError('');
    try {
      const vp = await wallet.buildPresentation(chosen, req, DISCLOSABLE_CLAIMS.filter((c) => consent.has(c)));
      const r = await wallet.submitPresentation(req, vp);
      setResult({ state: r.state, report: (r.report as VerificationReport) ?? null });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !req) return <section className="card narrow"><h2>Presentation request</h2><p className="error">{error}</p></section>;
  if (!req) return <section className="card narrow"><p className="muted">Fetching request…</p></section>;

  if (result) {
    const green = result.report?.checks.filter((c) => c.ok).length ?? 0;
    return (
      <section className="card narrow">
        <h2>{result.report?.ok ? 'Accepted by' : 'Rejected by'} {req.verifierName}</h2>
        <p><span className={`badge ${result.report?.ok ? 'ok' : 'bad'}`}>{green}/8 checks passed</span></p>
        {result.report && (
          <ul className="steps">
            {result.report.checks.map((c) => <li key={c.name} className={c.ok ? '' : 'bad'}>{c.ok ? '✓' : '✗'} {c.label}{c.code ? ` (${c.code})` : ''}</li>)}
          </ul>
        )}
        <p className="muted">The verifier only received the claims you ticked. Undisclosed claims stayed as digests.</p>
        <button onClick={() => navigate('/credentials')}>Back to my vault</button>
      </section>
    );
  }

  return (
    <section className="card narrow">
      <h2>{req.verifierName} asks for</h2>
      <p className="muted">Type <code>{req.credentialType}</code> · request expires {new Date(req.expiresAt * 1000).toLocaleTimeString()} · audience <code>{req.aud}</code></p>
      {creds.length === 0 && <p className="error">You have no {req.credentialType} in your vault.</p>}
      {creds.length > 1 && (
        <label>Credential
          <select value={chosen?.id} onChange={(e) => setChosen(creds.find((c) => c.id === e.target.value) ?? null)}>
            {creds.map((c) => <option key={c.id} value={c.id}>{claimValue(c, 'credentialSubject.degree.name')} · {c.issuerName}</option>)}
          </select>
        </label>
      )}
      {chosen && (
        <>
          <h3>Share only what they asked for</h3>
          <div className="consent">
            {DISCLOSABLE_CLAIMS.map((path) => {
              const requested = req.claims.includes(path);
              return (
                <label key={path} className={`claim ${consent.has(path) ? 'on' : ''} ${requested ? '' : 'extra'}`}>
                  <input type="checkbox" checked={consent.has(path)} onChange={() => toggle(path)} />
                  <span>{CLAIM_LABELS[path as DisclosableClaim]}{requested ? '' : <em> (not requested)</em>}</span>
                  <strong>{claimValue(chosen, path)}</strong>
                </label>
              );
            })}
          </div>
          <p className="muted small">Always sent in clear (they are part of the signed envelope): issuer, type, validity, status entry, your pairwise DID for this issuer.</p>
          {error && <p className="error">{error}</p>}
          <button onClick={present} disabled={busy}>{busy ? 'Presenting…' : `Present ${consent.size} claim(s)`}</button>
        </>
      )}
    </section>
  );
}
