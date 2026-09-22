import { useState } from 'react';
import type { VerificationReport } from '@dcv/core/verifier/report';
import { api, type AttackKind } from './api';
import { Report } from './Report';

const ATTACKS: Array<{ kind: AttackKind; label: string; blurb: string }> = [
  { kind: 'tamper', label: 'Tamper a disclosure', blurb: 'flip one character inside a disclosed claim' },
  { kind: 'replay', label: 'Replay', blurb: 'send the same presentation a second time' },
  { kind: 'expire', label: 'Expire', blurb: 'present one hour later' },
  { kind: 'audience', label: 'Wrong audience', blurb: 'relay it to another verifier' },
];

export function AttackLab({ requestId }: { requestId: string }) {
  const [result, setResult] = useState<{ attack: AttackKind; report: VerificationReport } | null>(null);
  const [busy, setBusy] = useState<AttackKind | null>(null);
  const [error, setError] = useState('');

  const run = async (attack: AttackKind) => {
    setBusy(attack);
    setError('');
    try {
      setResult(await api.lab(requestId, attack));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card">
      <h2>Attack lab <span className="muted">(dry runs on the stored presentation)</span></h2>
      <div className="attacks">
        {ATTACKS.map((a) => (
          <button key={a.kind} className="attack" onClick={() => run(a.kind)} disabled={busy !== null}>
            <strong>{busy === a.kind ? 'Running…' : a.label}</strong>
            <span>{a.blurb}</span>
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {result && <Report report={result.report} title={`After "${ATTACKS.find((a) => a.kind === result.attack)?.label}"`} />}
    </section>
  );
}
