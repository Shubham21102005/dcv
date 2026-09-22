import { useState } from 'react';
import type { Check, VerificationReport } from '@dcv/core/verifier/report';

function Evidence({ check }: { check: Check }) {
  const [open, setOpen] = useState(false);
  if (!check.evidence) return null;
  return (
    <div className="evidence">
      <button className="ghost small" onClick={() => setOpen((o) => !o)}>{open ? 'Hide evidence' : 'Evidence'}</button>
      {open && <pre>{JSON.stringify(check.evidence, null, 2)}</pre>}
    </div>
  );
}

function flatten(obj: unknown, prefix = ''): Array<[string, string]> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [[prefix, JSON.stringify(obj)]];
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === '_sd' || k === '_sd_alg') continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flatten(v, key));
    else out.push([key, Array.isArray(v) ? v.join(', ') : String(v)]);
  }
  return out;
}

export function Report({ report, title }: { report: VerificationReport; title?: string }) {
  const green = report.checks.filter((c) => c.ok).length;
  const subject = (report.disclosed['credentialSubject'] as Record<string, unknown> | undefined) ?? {};
  const seen = flatten(subject, 'credentialSubject').filter(([k]) => k !== 'credentialSubject.id');
  return (
    <section className={`card report ${report.ok ? 'ok' : 'bad'}`}>
      <div className="report-head">
        <h2>{title ?? 'Verification report'}</h2>
        <span className={`badge ${report.ok ? 'ok' : 'bad'}`}>{report.ok ? 'ACCEPTED' : 'REJECTED'} · {green}/8 checks</span>
      </div>
      <div className="badges">
        <span className={`badge ${report.issuerContacted ? 'bad' : 'ok'}`}>{report.issuerContacted ? 'issuer WAS contacted' : '0 requests to the issuer'}</span>
        <span className="badge neutral">chain reads: {report.chainReads}</span>
        <span className="badge neutral">other fetches: {report.outboundUrls.length}</span>
        {report.dryRun && <span className="badge warn">dry run</span>}
      </div>
      <ol className="checks">
        {report.checks.map((c) => (
          <li key={c.name} className={c.ok ? 'ok' : 'bad'}>
            <span className="mark">{c.ok ? '✓' : '✗'}</span>
            <div>
              <div className="label">
                {c.label} {c.code && <code className="code">{c.code}</code>}
              </div>
              <div className="detail">{c.detail}</div>
              <Evidence check={c} />
            </div>
          </li>
        ))}
      </ol>
      <h3>What the verifier saw</h3>
      <table>
        <tbody>
          <tr><td className="muted">Issuer</td><td><code>{report.issuerDid}</code></td></tr>
          <tr><td className="muted">Holder (pairwise DID)</td><td><code>{report.holderDid}</code></td></tr>
          <tr><td className="muted">Type</td><td>{(report.disclosed['type'] as string[] | undefined)?.join(', ')}</td></tr>
          {seen.map(([k, v]) => (
            <tr key={k}><td className="muted">{k}</td><td><strong>{v}</strong></td></tr>
          ))}
          <tr>
            <td className="muted">Not disclosed</td>
            <td>{report.digestsUndisclosed.length} claim(s) remain hidden: {report.digestsUndisclosed.map((d) => <code key={d} className="digest">{d.slice(0, 10)}…</code>)}</td>
          </tr>
          {report.outboundUrls.length > 0 && (
            <tr><td className="muted">Fetched</td><td>{report.outboundUrls.map((u) => <code key={u}>{u}</code>)}</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
