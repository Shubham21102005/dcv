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
        // the pairwise DID for this issuer is derived automatically - no DID to paste anywhere
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
      log(`Derived pairwise DID for ${offer.issuerName}`);
      log('Signed proof of possession over the offer nonce');
      const cred = await wallet.claimOffer(offer);
      log('Received vc+sd-jwt · issuer signature recovers to iss · schema OK · issuer trusted on chain');
      log('Encrypted and stored (AES-256-GCM)');
      setDone(cred);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !offer) return <section className="card narrow"><h2>Offer</h2><p className="error">{error}</p></section>;
  if (!offer) return <section className="card narrow"><p className="muted">Fetching offer…</p></section>;

  return (
    <section className="card narrow">
      <h2>Credential offer</h2>
      <table>
        <tbody>
          <tr><td className="muted">From</td><td><strong>{offer.issuerName}</strong><br /><code>{offer.issuerDid}</code></td></tr>
          <tr><td className="muted">Type</td><td>{offer.type}</td></tr>
          <tr><td className="muted">For</td><td>{offer.subjectPreview.name} · {offer.subjectPreview.degree}</td></tr>
          <tr><td className="muted">Will be bound to</td><td><code>{pairwiseDid}</code><br /><span className="muted small">a DID only this issuer will ever see</span></td></tr>
        </tbody>
      </table>
      {steps.length > 0 && <ul className="steps">{steps.map((s, i) => <li key={i}>✓ {s}</li>)}</ul>}
      {error && <p className="error">{error}</p>}
      {done ? (
        <button onClick={() => navigate('/credentials')}>Open my vault</button>
      ) : (
        <button onClick={accept} disabled={busy}>{busy ? 'Claiming…' : 'Accept credential'}</button>
      )}
    </section>
  );
}
