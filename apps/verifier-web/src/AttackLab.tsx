import { useState } from 'react';
import type { VerificationReport } from '@dcv/core/verifier/report';
import { api, type AttackKind } from './api';
import { Report } from './Report';

const ATTACKS: Array<{ kind: AttackKind; label: string; how: string }> = [
  { kind: 'tamper', label: 'Tamper a disclosure', how: 'change one character inside a disclosed claim' },
  { kind: 'replay', label: 'Replay', how: 'send the same presentation a second time' },
  { kind: 'expire', label: 'Expire', how: 'present it an hour later' },
  { kind: 'audience', label: 'Wrong audience', how: 'relay it to another verifier' },
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
    <section className="stack">
      <div>
        <h2 className="title">Try to break it</h2>
        <p className="quiet" style={{ marginTop: 4 }}>Each attack re-runs the stored presentation with one change, as a dry run. Exactly one check should fail.</p>
      </div>
      <ul className="attacks">
        {ATTACKS.map((a) => (
          <li key={a.kind}>
            <div>
              <div className="what">{a.label}</div>
              <div className="how">{a.how}</div>
            </div>
            <button className="button secondary small attack" onClick={() => run(a.kind)} disabled={busy !== null}>{busy === a.kind ? 'Running' : `Run: ${a.label}`}</button>
          </li>
        ))}
      </ul>
      {error && <p className="notice error">{error}</p>}
      {result && <Report report={result.report} title={`After "${ATTACKS.find((a) => a.kind === result.attack)?.label}"`} animate />}
    </section>
  );
}
