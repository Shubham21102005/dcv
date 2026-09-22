import type { Check, VerificationReport } from '@dcv/core/verifier/report';

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

const NAMES: Record<string, string> = {
  'credentialSubject.degree.type': 'Degree type',
  'credentialSubject.degree.name': 'Degree',
  'credentialSubject.degree.grade': 'Grade',
  'credentialSubject.degree.awardedOn': 'Awarded on',
  'credentialSubject.name': 'Full name',
  'credentialSubject.birthDate': 'Date of birth',
  'credentialSubject.studentId': 'Student ID',
};

function Row({ check, index, animate }: { check: Check; index: number; animate: boolean }) {
  return (
    <li className={check.ok ? 'ok' : 'bad'} style={animate ? ({ '--i': index } as React.CSSProperties) : undefined}>
      <span className="tick" aria-hidden="true">{check.ok ? '✓' : '✗'}</span>
      <div>
        <div className="what">
          {check.label}
          {check.code && <span className="code">{check.code}</span>}
        </div>
        <div className="detail">{check.detail}</div>
        {check.evidence && (
          <details>
            <summary>Evidence</summary>
            <pre className="raw" style={{ marginTop: 6 }}>{JSON.stringify(check.evidence, null, 2)}</pre>
          </details>
        )}
      </div>
    </li>
  );
}

export function Report({ report, title, animate = false }: { report: VerificationReport; title?: string; animate?: boolean }) {
  const green = report.checks.filter((c) => c.ok).length;
  const subject = (report.disclosed['credentialSubject'] as Record<string, unknown> | undefined) ?? {};
  const seen = flatten(subject, 'credentialSubject').filter(([k]) => k !== 'credentialSubject.id');
  const hidden = report.digestsUndisclosed.length;
  return (
    <section className="report stack-lg" aria-label={title ?? 'Verification report'}>
      <div className={`verdict${report.ok ? '' : ' bad'}`}>
        <span className={`stamp ${report.ok ? 'ok' : 'bad'}`}>{report.ok ? 'Accepted' : 'Rejected'}</span>
        <div>
          <h2 className="display word">{title ?? (report.ok ? 'Credential accepted' : 'Credential rejected')}</h2>
          <p className="count">{green} of {report.checks.length} checks passed{report.dryRun ? ' in this dry run' : ''}</p>
        </div>
      </div>
      <div className="facts">
        <span className={`mark ${report.issuerContacted ? 'bad' : 'ok'}`}>{report.issuerContacted ? 'the issuer was contacted' : '0 requests to the issuer'}</span>
        <span className="mark neutral">{report.chainReads} chain reads</span>
        <span className="mark neutral">{report.outboundUrls.length} other {report.outboundUrls.length === 1 ? 'fetch' : 'fetches'}</span>
      </div>
      <ol className={`checklist${animate ? ' fill-in' : ''}`}>
        {report.checks.map((c, i) => <Row key={c.name} check={c} index={i} animate={animate} />)}
      </ol>
      <div className="stack seen">
        <h3 className="subtitle">What this desk received</h3>
        <dl className="kv">
          <dt>Issuer</dt>
          <dd><span className="id">{report.issuerDid}</span></dd>
          <dt>Holder</dt>
          <dd><span className="id">{report.holderDid}</span><br /><span className="quiet">a pairwise identity; other verifiers see a different one</span></dd>
          <dt>Type</dt>
          <dd>{(report.disclosed['type'] as string[] | undefined)?.filter((t) => t !== 'VerifiableCredential').map((t) => t.replace(/([a-z])([A-Z])/g, '$1 $2')).join(', ')}</dd>
          {seen.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{NAMES[k] ?? k}</dt>
              <dd><strong>{v}</strong></dd>
            </div>
          ))}
          <dt>Kept sealed</dt>
          <dd>
            {hidden === 0 ? 'nothing' : Array.from({ length: hidden }, (_, i) => <span key={i} className="sealed" title="a salted digest the holder chose not to open" />)}
            {hidden > 0 && <div className="quiet" style={{ marginTop: 4 }}>{hidden} {hidden === 1 ? 'claim stays' : 'claims stay'} as salted digests this desk cannot reverse.</div>}
          </dd>
          {report.outboundUrls.length > 0 && (
            <>
              <dt>Fetched</dt>
              <dd>{report.outboundUrls.map((u) => <div key={u} className="id">{u}</div>)}</dd>
            </>
          )}
        </dl>
      </div>
    </section>
  );
}
