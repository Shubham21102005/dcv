import { useCallback, useEffect, useState } from 'react';
import { api, type RequestDetail, type RequestSummary } from './api';
import { AttackLab } from './AttackLab';
import { Report } from './Report';
import { RequestBuilder } from './RequestBuilder';

function stateMark(state: RequestSummary['state']) {
  if (state === 'verified') return <span className="mark ok">accepted</span>;
  if (state === 'failed') return <span className="mark bad">rejected</span>;
  return <span className="mark neutral">waiting</span>;
}

export default function App() {
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [error, setError] = useState('');
  const [verifierName, setVerifierName] = useState('Verifier');
  const [animateId, setAnimateId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { requests } = await api.list();
      setRequests(requests);
      setError('');
    } catch (err) {
      setError(`The verifier API is not answering: ${(err as Error).message}`);
    }
  }, []);

  useEffect(() => {
    api.config().then((c) => setVerifierName(c.verifierName)).catch(() => {});
    void refresh();
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const load = () =>
      api
        .get(selectedId)
        .then((d) => {
          if (cancelled) return;
          setDetail((prev) => {
            // the report just arrived: let the rows fill in once
            if (d.report && !prev?.report) setAnimateId(d.id);
            return d;
          });
        })
        .catch(() => {});
    void load();
    const t = setInterval(load, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [selectedId]);

  const reset = async () => {
    if (!confirm('Clear every request, report and nonce on this desk?')) return;
    await api.reset();
    setSelectedId(null);
    setDetail(null);
    await refresh();
  };

  return (
    <>
      <header className="page masthead">
        <div className="wordmark">
          {verifierName}
          <small>Verification desk. Trusts the chain and IPFS, never the issuer.</small>
        </div>
        <nav aria-label="desk">
          <button className="button subtle" onClick={reset}>Clear all requests</button>
        </nav>
      </header>
      <main className="page">
        {error && <p className="notice error" style={{ marginBottom: 20 }}>{error}</p>}
        <div className="cols-2">
          <div className="stack-lg">
            <RequestBuilder onCreated={(r) => { setSelectedId(r.id); setDetail(null); void refresh(); }} />
            <section className="section">
              <h2 className="title" style={{ marginBottom: 10 }}>Requests</h2>
              {requests.length === 0 && <p className="quiet">None yet. Create one to get a link for the holder.</p>}
              {requests.length > 0 && (
                <ul className="requests">
                  {requests.map((r) => (
                    <li key={r.id} className={r.id === selectedId ? 'selected' : ''} onClick={() => { setSelectedId(r.id); setDetail(null); }}>
                      {stateMark(r.state)}
                      <span>
                        {r.claims.length} {r.claims.length === 1 ? 'claim' : 'claims'} requested <span className="quiet">at {new Date(r.createdAt * 1000).toLocaleTimeString()}</span>
                      </span>
                      <span className="id">{r.id.slice(0, 8)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <div className="stack-lg">
            {!detail && selectedId && <p className="quiet">Loading the request…</p>}
            {!selectedId && (
              <div className="stack">
                <h2 className="display display-md">Nothing to check yet</h2>
                <p className="lede">Create a request, hand the link to the holder, and the result appears here the moment they share.</p>
              </div>
            )}
            {detail && detail.state === 'pending' && (
              <div className="stack">
                <h2 className="display display-md">Waiting for the holder</h2>
                <p className="lede">The request is live. Nonce <span className="id">{detail.request.nonce.slice(0, 10)}…</span>, addressed to <span className="id">{detail.request.aud}</span>.</p>
                <p><a href={detail.walletLink} target="_blank" rel="noopener noreferrer" className="button secondary">Open in wallet</a></p>
              </div>
            )}
            {detail && detail.report && (
              <>
                <Report report={detail.report} animate={animateId === detail.id} />
                <AttackLab requestId={detail.id} />
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
