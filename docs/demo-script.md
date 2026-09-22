# Demo script (~9 minutes)

**Before walking on stage**
- `pnpm env:init` once (the demo `.env` sets `NONCE_TTL_SECONDS=600` and `VITE_AUTO_LOCK_SECONDS=900` so nothing expires or locks mid-demo).
- `pnpm reset` then `pnpm dev` (one terminal; ~30 s). Keep a spare terminal open.
- One browser window, three tabs: Issuer console `localhost:4001` · Wallet `localhost:5173` · Verifier `localhost:5174`. Zoom 125 %.
- Fallback: a recording of `pnpm e2e` and a 60-second screen capture of the happy path.

| Time | On screen | Say |
|---|---|---|
| 0:00 | README diagram | "Verifying a diploma today means emailing the registrar. We will issue, store, present and revoke a degree on this laptop with no server we don't own: W3C VC 2.0, SD-JWT, a Bitstring Status List, did:ethr, a local chain and local IPFS. Zero API keys." |
| 0:40 | Issuer → **Governance** tab: issuer row, event feed (`IssuerRegistered`, `CredentialTypeAllowed`, `StatusListPublished v1`) | "The root of trust is a governance contract, not a phone call. The university's DID document is just an Ethereum address, so we sign with a recoverable signature. The empty revocation list was anchored at boot." |
| 1:20 | Wallet → **Create identity** → 12 words → passphrase → DID card | "Alice generates her own identity; nobody gave her a key. Everything derives from these 12 words with HKDF; the vault key never leaves the browser." (DevTools → IndexedDB: only ciphertext.) |
| 2:30 | Issuer tab: form pre-filled → **Issue → create offer** → **Open in wallet** → Accept → card appears. Back on the issuer: **What I signed** | "The wallet derived a *pairwise* DID for this university - another issuer sees a different one. The signed payload holds salted hashes, not names. Nothing about Alice touched the chain." |
| 3:45 | Verifier: **Create request** (Degree only) → **Open in wallet** → consent screen shows only Degree ticked → **Present** → verifier: 8 green rows; expand *Not revoked*; "What the verifier saw"; badge *0 requests to the issuer* | "Acme learns the degree, not the name, birth date or grade. The nonce and audience in the key-binding JWT make this presentation useless anywhere else. Every check came from the chain and IPFS." |
| 5:15 | Verifier **Attack lab**: Tamper → Replay → Expire → Wrong audience. Meanwhile create two more requests for the next beats | "Each click: exactly one row turns red with its code. Tampering breaks the digests; replay is caught by the single-use nonce; freshness is a 5-minute window; audience binding stops relaying." |
| 6:15 | Issuer: **Revoke** → event feed `StatusListPublished v2` → wallet badge turns red → verifier: open request #2 in the wallet → Present → 7 green, `status` red (`REVOKED`, bit, v2, CID). Optional **Un-revoke** | "Revocation is one bit among 131,072 - the chain learned nothing about Alice. Hash anchored on chain, so the list is tamper-evident." |
| 7:15 | Spare terminal: `pnpm stop:issuer` → verifier: open request #3 in the wallet → Present → 8 green | "'Without contacting the issuer' is literal - the university is offline." |
| 7:50 | Wallet: **Backup & restore → Backup to IPFS** → **Reset demo** (wipes the browser) → **Restore instead** with the 12 words → **Restore from IPFS pointer** → card is back | "Self-sovereign: the seed is the vault. The pointer was written from a pseudonymous address; `ipfs cat <cid>` is garbage." |
| 8:40 | Spare terminal: `pnpm privacy-scan` → `0 hits over N blocks / M logs / K blobs for T terms`. Optionally `pnpm test:contracts` | "An executable privacy invariant: the scanner is fed the real PII from the issuer's own ledger and finds none of it in public storage. Honest limit: SD-JWT presentations are linkable by colluding verifiers - BBS+ is the successor." |

**Reset between runs**: Ctrl+C the dev terminal → `pnpm reset` → `pnpm dev` → click **Reset demo** in each tab (wallet, verifier, issuer console) or use the wipe button in the wallet.
