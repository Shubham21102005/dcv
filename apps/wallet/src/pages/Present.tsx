import { useEffect, useState } from 'react';
import { CLAIM_LABELS, DISCLOSABLE_CLAIMS, type DisclosableClaim } from '@dcv/core/sdjwt/frames';
import type { VerificationReport } from '@dcv/core/verifier/report';
import { navigate, useWallet } from '../state/app';
import type { RequestDetails, StoredCredential } from '../state/wallet';
import { claimValue } from './CredentialCard';

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

  if (error && !req) {
    return (
      <div className="page-narrow stack-lg">
        <h2 className="display display-md">This request cannot be opened</h2>
        <p className="notice error">{error}</p>
      </div>
    );
  }
  if (!req) return <div className="page-narrow"><p className="quiet">Reading the request…</p></div>;

  if (result) {
    const green = result.report?.checks.filter((c) => c.ok).length ?? 0;
    const ok = result.report?.ok === true;
    return (
      <div className="page-narrow stack-lg">
        <div className="stack">
          <span className={`stamp ${ok ? 'ok' : 'bad'}`}>{ok ? 'Accepted' : 'Rejected'}</span>
          <h2 className="display display-md">{ok ? `${req.verifierName} accepted your credential` : `${req.verifierName} rejected the presentation`}</h2>
          <p className="lede">{green} of 8 checks passed. They received only the claims you ticked; everything else stayed sealed.</p>
        </div>
        {result.report && (
          <ol className="checklist fill-in">
            {result.report.checks.map((c, i) => (
              <li key={c.name} className={c.ok ? '' : 'bad'} style={{ '--i': i } as React.CSSProperties}>
                <span className="tick">{c.ok ? '✓' : '✗'}</span>
                <span>{c.label}{c.code && <span className="code">{c.code}</span>}</span>
              </li>
            ))}
          </ol>
        )}
        <button className="button" onClick={() => navigate('/credentials')}>Back to your credentials</button>
      </div>
    );
  }

  const requestedCount = req.claims.length;
  return (
    <div className="page-narrow stack-lg">
      <div className="stack">
        <h2 className="display display-md">{req.verifierName} asks for {requestedCount} {requestedCount === 1 ? 'claim' : 'claims'}</h2>
        <p className="quiet">
          From a {req.credentialType.replace(/([a-z])([A-Z])/g, '$1 $2')}. This request expires at {new Date(req.expiresAt * 1000).toLocaleTimeString()} and is signed for <span className="id">{req.aud}</span> only.
        </p>
      </div>
      {creds.length === 0 && <p className="notice error">You have no {req.credentialType.replace(/([a-z])([A-Z])/g, '$1 $2')} in this wallet.</p>}
      {creds.length > 1 && (
        <label className="field"><span>Which credential</span>
          <select value={chosen?.id} onChange={(e) => setChosen(creds.find((c) => c.id === e.target.value) ?? null)}>
            {creds.map((c) => <option key={c.id} value={c.id}>{claimValue(c, 'credentialSubject.degree.name')} from {c.issuerName}</option>)}
          </select>
        </label>
      )}
      {chosen && (
        <>
          <div>
            <h3 className="subtitle">Choose what to share</h3>
            <p className="quiet" style={{ margin: '4px 0 10px' }}>Only the ticked lines leave this device. The rest stay as salted digests the verifier cannot reverse.</p>
            <div>
              {DISCLOSABLE_CLAIMS.map((path) => {
                const requested = req.claims.includes(path);
                const on = consent.has(path);
                return (
                  <label key={path} className={`choice${on ? '' : ' off'}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(path)} />
                    <span>{CLAIM_LABELS[path as DisclosableClaim]}{!requested && <span className="note">not requested</span>}</span>
                    <span className="value">{claimValue(chosen, path)}</span>
                  </label>
                );
              })}
            </div>
            <p className="quiet" style={{ marginTop: 10 }}>Always visible, because they are part of the signed envelope: the issuer, the credential type, its validity dates, its revocation entry and your pairwise identity for this issuer.</p>
          </div>
          {error && <p className="notice error">{error}</p>}
          <div className="row">
            <button className="button" onClick={present} disabled={busy}>{busy ? 'Sharing' : `Share ${consent.size} ${consent.size === 1 ? 'claim' : 'claims'}`}</button>
            <button className="button subtle" onClick={() => navigate('/credentials')} disabled={busy}>Decline</button>
          </div>
        </>
      )}
    </div>
  );
}
