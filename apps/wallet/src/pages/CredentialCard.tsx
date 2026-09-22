import sealUrl from '@dcv/design/seal.svg';
import type { CredentialStatus } from '../state/chain';
import type { StoredCredential } from '../state/wallet';

/** One line of a machine-readable zone: A–Z, 0–9 and '<' only, padded to `width`. */
export function mrzLine(text: string, width = 44): string {
  const cleaned = text
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .trim()
    .replace(/\s+/g, '<');
  return (cleaned + '<'.repeat(width)).slice(0, width);
}

export function claimValue(cred: StoredCredential, path: string): string | undefined {
  let node: unknown = cred.claims;
  for (const key of path.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node === undefined ? undefined : String(node);
}

function longDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function StatusMark({ status }: { status: CredentialStatus | null }) {
  if (!status) return <span className="mark neutral">checking the status list</span>;
  if (status.state === 'valid') return <span className="mark ok" title={`bit ${status.bit} is clear in status list version ${status.version}`}>not revoked</span>;
  if (status.state === 'revoked') return <span className="mark bad" title={`bit ${status.bit} is set in status list version ${status.version}`}>revoked</span>;
  if (status.state === 'expired') return <span className="mark warn">expired</span>;
  return <span className="mark neutral" title={status.reason}>status unavailable</span>;
}

export function CredentialCard(props: { cred: StoredCredential; status: CredentialStatus | null; onOpen?: () => void; deal?: boolean }) {
  const { cred, status } = props;
  const type = cred.type.find((t) => t !== 'VerifiableCredential') ?? cred.type[0] ?? '';
  const degree = claimValue(cred, 'credentialSubject.degree.name') ?? 'Credential (details sealed)';
  const awarded = claimValue(cred, 'credentialSubject.degree.awardedOn');
  const body = (
    <>
      <i className="rosette" aria-hidden="true" />
      <div className="issuer-line">
        <span className="label">{cred.issuerName || cred.issuerDid}</span>
        <img className="seal" src={sealUrl} alt="" />
      </div>
      <h3 className="display display-sm degree">{degree}</h3>
      <div className="facts">
        <span>{awarded ? <>awarded <strong>{longDate(awarded)}</strong></> : type}</span>
        <StatusMark status={status} />
      </div>
      <div className="mrz-block mrz" aria-label="machine-readable zone">
        <div>{mrzLine(`${type} ${cred.issuerName}`)}</div>
        <div>{mrzLine(cred.holderDid)}</div>
      </div>
    </>
  );
  const className = `card-id1 cred-card${props.deal ? ' deal-in' : ''}`;
  return props.onOpen ? (
    <button type="button" className={className} onClick={props.onOpen} aria-label={`${degree}, issued by ${cred.issuerName}`}>
      {body}
    </button>
  ) : (
    <article className={className}>{body}</article>
  );
}
