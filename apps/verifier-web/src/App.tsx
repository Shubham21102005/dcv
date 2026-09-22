import { useCallback, useEffect, useState } from 'react';
import { api, type RequestDetail, type RequestSummary } from './api';
import { AttackLab } from './AttackLab';
import { Report } from './Report';
import { RequestBuilder } from './RequestBuilder';

export default function App() {
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [error, setError] = useState('');
  const [verifierName, setVerifierName] = useState('Verifier');

  const refresh = useCallback(async () => {
    try {
      const { requests } = await api.list();
      setRequests(requests);
      setError('');
    } catch (err) {
      setError(`Verifier API unreachable: ${(err as Error).message}`);
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
    const load = () => api.get(selectedId).then((d) => !cancelled && setDetail(d)).catch(() => {});
    void load();
    const t = setInterval(load, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [selectedId]);

  const reset = async () => {
    if (!confirm('Clear all requests, reports and nonces on the verifier?')) return;
    await api.reset();
    setSelectedId(null);
    setDetail(null);
    await refresh();
  };

  return (
    <>
      <header>
        <div>
          <h1>{verifierName}</h1>
          <p className="muted">Verifier portal · trusts the chain and IPFS, never the issuer</p>
        </div>
        <button className="danger" onClick={reset}>Reset demo</button>
      </header>
      <main>
        {error && <p className="error">{error}</p>}
        <div className="grid">
          <RequestBuilder onCreated={(r) => { setSelectedId(r.id); void refresh(); }} />
          <section className="card">
            <h2>Requests</h2>
            {requests.length === 0 && <p className="muted">No requests yet.</p>}
            <ul className="requests">
              {requests.map((r) => (
                <li key={r.id} className={r.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(r.id)}>
                  <span className={`badge ${r.state === 'verified' ? 'ok' : r.state === 'failed' ? 'bad' : 'neutral'}`}>{r.state}</span>
                  <code>{r.id.slice(0, 8)}</code>
                  <span className="muted">{r.claims.length} claim(s) · {new Date(r.createdAt * 1000).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        {detail && detail.state === 'pending' && (
          <section className="card">
            <h2>Waiting for the holder…</h2>
            <p className="muted">Request <code>{detail.id}</code> · nonce <code>{detail.request.nonce.slice(0, 12)}…</code> · audience <code>{detail.request.aud}</code></p>
            <p><a href={detail.walletLink} target="_blank" rel="noopener noreferrer" className="primary-link">Open in wallet</a></p>
          </section>
        )}
        {detail && detail.report && (
          <>
            <Report report={detail.report} />
            <AttackLab requestId={detail.id} />
          </>
        )}
      </main>
    </>
  );
}
