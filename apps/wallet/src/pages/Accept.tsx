import sealUrl from '@dcv/design/seal.svg';
import { useEffect, useState } from 'react';
import { navigate, useWallet } from '../state/app';
import type { OfferDetails, StoredCredential } from '../state/wallet';

export function Accept({ offerUrl }: { offerUrl: string }) {
  const wallet = useWallet();
  const [offer, setOffer] = useState<OfferDetails | null>(null);
  const [pairwiseDid, setPairwiseDid] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [done, setDone] = useState<StoredCredential | null>(null);

  useEffect(() => {
    wallet
      .fetchOffer(offerUrl)
      .then(async (o) => {
        setOffer(o);
        // the pairwise identity for this issuer is derived automatically - nothing to paste anywhere
        setPairwiseDid((await wallet.holderAccount(o.issuerDid)).did);
      })
      .catch((err) => setError((err as Error).message));
  }, [wallet, offerUrl]);

  const accept = async () => {
    if (!offer) return;
    setBusy(true);
    setError('');
    const log = (s: string) => setSteps((prev) => [...prev, s]);
    try {
      log(`Derived your pairwise identity for ${offer.issuerName}`);
      log('Proved you hold its key by signing the offer nonce');
      const cred = await wallet.claimOffer(offer);
      log('Checked the signature against the issuer address on chain');
      log('Checked the issuer is trusted for this credential type');
      log('Encrypted and stored');
      sessionStorage.setItem('dcv:just-accepted', cred.id);
      setDone(cred);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !offer) {
    return (
      <div className="page-narrow stack-lg">
        <h2 className="display display-md">This offer cannot be opened</h2>
        <p className="notice error">{error}</p>
        <p className="quiet">Ask the issuer for a new link; offers are single-use and expire.</p>
      </div>
    );
  }
  if (!offer) return <div className="page-narrow"><p className="quiet">Reading the offer…</p></div>;

  return (
    <div className="page-narrow stack-lg">
      <div className="offer-head">
        <div className="stack">
          <h2 className="display display-md">Credential offer</h2>
          <p className="quiet">Accepting it stores the signed credential in this wallet. The issuer learns only the identity below.</p>
        </div>
        <img src={sealUrl} alt="" width={84} height={84} />
      </div>
      <dl className="kv">
        <dt>From</dt>
        <dd><strong>{offer.issuerName}</strong><br /><span className="id">{offer.issuerDid}</span></dd>
        <dt>Credential</dt>
        <dd>{offer.type.replace(/([a-z])([A-Z])/g, '$1 $2')}</dd>
        <dt>For</dt>
        <dd>{offer.subjectPreview.name}, {offer.subjectPreview.degree}</dd>
        <dt>Bound to</dt>
        <dd><span className="id">{pairwiseDid}</span><br /><span className="quiet">an identity only this issuer will ever see</span></dd>
      </dl>
      {steps.length > 0 && (
        <ol className="checklist fill-in">
          {steps.map((s, i) => <li key={i} style={{ '--i': i } as React.CSSProperties}><span className="tick">✓</span><span>{s}</span></li>)}
        </ol>
      )}
      {error && <p className="notice error">{error}</p>}
      {done ? (
        <button className="button" onClick={() => navigate('/credentials')}>Open my vault</button>
      ) : (
        <div className="row">
          <button className="button" onClick={accept} disabled={busy}>{busy ? 'Accepting' : 'Accept credential'}</button>
          <button className="button subtle" onClick={() => navigate('/credentials')} disabled={busy}>Not now</button>
        </div>
      )}
    </div>
  );
}
