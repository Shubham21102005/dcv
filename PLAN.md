# Decentralized Credentials Vault System (DCV) — Final Project Plan

> Local-only demo · Windows 11 native (Git Bash only for the Foundry installer) · everything free · ~22 working days solo (4 weeks; Step 16 is the first cut) · a TEST GATE after every step.
> Written 2026-09-22. Every package version below was checked against the npm registry / GitHub releases today. Pin exactly what is written (`pnpm add pkg@x.y.z`); newer *patch* versions are fine.
> Shell convention: every command block marked PowerShell is **Windows PowerShell 5.1** syntax (no `&&`; sequences are written `a; if ($?) { b }`). PowerShell 7 (`winget install --id Microsoft.PowerShell`) is optional and also accepts the 5.1 forms.

---

## 1. Project overview

**What it is.** A self-sovereign-identity (SSI) demo for W3C Verifiable Credentials. A university (**issuer**) signs a degree credential once; the student (**holder**) keeps it in a browser vault that only she can open and shows an employer (**verifier**) exactly the claims it asked for; the employer checks signature, issuer trust, holder binding, freshness and revocation **without ever contacting the university** — using only a local blockchain (trust anchors) and a local IPFS node (status lists, encrypted backups). A governance role (**admin**) decides which issuers are trusted for which credential types.

**The problem.** Today a diploma is verified by emailing the registrar (slow, centralised, leaks who is applying where), or by trusting a PDF (forgeable), and the holder must hand over the whole document even when one field is needed. VCs flip ownership: the issuer signs once, the holder owns the artefact, any verifier checks it offline from public trust anchors, and the holder reveals only what is requested.

**Actors.**

| Actor | Demo persona | Key material | Process |
|---|---|---|---|
| Admin / governance | "Trust-registry operator" | Anvil account #0 (contract owner) | `scripts/deploy.ts` + Governance tab of the issuer console |
| Issuer | "Anvil State University" | Anvil account #1 → `did:ethr:anvil:0x7099…79C8` | `apps/issuer` (Hono API + console on :4001) |
| Holder | "Alice, student" | 12-word mnemonic generated in the browser → seed → HKDF key tree → one **pairwise** `did:ethr:anvil:0x…` per issuer (never needs ETH, never sends a tx) | `apps/wallet` (Vite/React on :5173) |
| Verifier | "Acme Corp HR" | none (read-only chain access; its identity is its origin `http://localhost:4002`) | `apps/verifier-api` (Hono :4002) + `apps/verifier-web` (Vite/React :5174) |

**How it works (one paragraph).** `pnpm dev` starts Anvil (chain 31337), a Kubo IPFS daemon in offline mode, deploys four small contracts to deterministic addresses (`EthereumDIDRegistry` for `did:ethr`, `IssuerTrustRegistry`, `StatusListRegistry`, `VaultPointer`), seeds the university as a trusted issuer of `UniversityDegreeCredential`, and starts the four apps. On boot the issuer publishes version 1 of its (all-zero) status list to IPFS and anchors it on-chain. The issuer builds a **W3C VCDM 2.0** credential JSON and secures it as an **SD-JWT (RFC 9901)** with media type `application/vc+sd-jwt` (W3C VC-JOSE-COSE), signed **ES256K-R** so that its `did:ethr` document (which only contains an Ethereum address) verifies it by `ecrecover`. The credential carries `cnf` bound to the holder's pairwise DID and a `credentialStatus` of type `BitstringStatusListEntry`; the signed status list lives on IPFS and its `keccak256` + CID are anchored on-chain. The wallet derives everything from one BIP-39 seed (HKDF-SHA256: vault key, pairwise holder keys, backup key, pseudonymous pointer key); the seed is wrapped at rest by an **argon2id**-derived key and every vault record is **AES-256-GCM** with an AAD-bound header. When Acme publishes a request (nonce + audience + wanted claims) the wallet reveals only those disclosures and appends a **Key-Binding JWT**. Acme's verifier resolves both DIDs from the local chain, recovers the issuer signature, checks the trust registry, checks disclosure digests and `sd_hash`, checks the KB-JWT (key, nonce, audience, age), checks validity dates, then reads the status-list anchor from the chain, fetches the list from the IPFS gateway, verifies hash + signature and tests the bit — and renders an 8-row green/red report card. Revocation is a bit flip + re-publish + re-anchor; the next verification fails on exactly the status row. Killing the issuer process changes nothing for the verifier.

---

## 2. Feature list

### Issuer
| # | Feature |
|---|---|
| I1 | Issuer identity page: `did:ethr:anvil:<addr>`, resolved DID document (from chain), trust status per credential type |
| I2 | Create a credential **offer** from a form (template `UniversityDegreeCredential`; a second template `EmployeeIdCredential` is stretch S10); offer = QR + "Open in wallet" link |
| I3 | Claim endpoint with **proof of possession**: wallet posts a JWS over the offer nonce signed by its pairwise key; issuer binds `cnf` to that DID, issues the `vc+sd-jwt`, offer becomes single-use |
| I4 | Allocate a random unused `statusListIndex` in a 131,072-bit Bitstring Status List; JSON-file ledger `data/issuer.json`. A ledger row stores `{ id, type, statusListIndex, revoked, holderDidHash: sha256(holderDid), subject: { name, birthDate, studentId, degree.* } (the fields the issuer legitimately entered), signedPreview: { header, sdDigests, statusListIndex } }`. The DID itself is never stored. `GET /credentials` **redacts `subject`** (returns id, type, index, revoked, holderDidHash); the subject fields exist server-side only so the privacy scan (A3) has real PII terms to search for |
| I5 | Publish status list: sign `BitstringStatusListCredential` (`vc+jwt`), `ipfs add` (CIDv1, raw leaves), anchor `keccak256(jwt)` + CID on-chain; serve `GET /status/:listId` as fallback. **Publish policy**: on boot the issuer calls `versionOf(issuer, 1)` and publishes **v1** (all-zero list) if it is 0; index allocation at issuance does **not** republish (bits unchanged); revoke/unrevoke republish (v2, v3, …) |
| I6 | Revoke / un-revoke by credential id (flip bit → re-sign → re-publish → re-anchor) |
| I7 | "What I am signing" card: header `typ/alg/kid`, `_sd` digests instead of names — rendered from `GET /credentials/:id/preview` (the `signedPreview` stored in the ledger row) |

### Holder (wallet)
| # | Feature |
|---|---|
| H1 | Onboard: generate 12-word mnemonic (show once) → passphrase → argon2id-wrapped seed → default DID + QR |
| H2 | Lock/unlock (argon2id in a Web Worker with progress), **idle-based** auto-lock (timer reset on any pointer/key event; `VITE_AUTO_LOCK_SECONDS`, default 300, 900 in the demo `.env`), key material only in memory while unlocked |
| H3 | Accept offer: open link/QR → derive **pairwise DID for that issuer automatically** → proof of possession → receive SD-JWT → verify issuer signature, schema and on-chain trust **before** storing → AES-GCM store |
| H4 | Credential cards with live status badge (Valid / Revoked / Expired computed in the browser from chain (`StatusListRegistry.get`) + IPFS gateway `GET /ipfs/<cid>`; the gateway's CORS header is set explicitly by `scripts/ipfs.mjs`); detail view with "disclosable" chips |
| H5 | Present: open verifier request link → consent screen defaults to "only what was requested" → KB-JWT → submit → see verifier report |
| H6 | Export/import encrypted vault file (`vault.dcv.json`) |
| H7 | Backup to IPFS + `VaultPointer` (pseudonymous derived address) and **Wipe & restore** from mnemonic alone (Step 16; first thing to cut if behind schedule) |
| H8 | "Reset demo" button (wallet-local: `indexedDB.deleteDatabase('dcv')` + reload) |

### Verifier
| # | Feature |
|---|---|
| V1 | Request builder: credential type + required claims → nonce, audience, expiry → QR + "Open in wallet" link |
| V2 | 8-check pipeline that **never short-circuits**; report card with plain-English labels, error codes, and evidence expanders (DID doc snippet, tx hash/anchor version, bit index, CID) |
| V3 | "What the verifier saw" panel: disclosed claims only; undisclosed claims shown as digests |
| V4 | Single-use nonces; **"No request left this machine for the issuer"** indicator. Definition: `outboundUrls` = every non-RPC HTTP fetch made during verification (the pipeline wraps `globalThis.fetch` with a recorder that flags any URL whose origin equals `ISSUER_PUBLIC_URL`); chain JSON-RPC calls to `RPC_URL` (viem and ethers inside `ethr-did-resolver`) are excluded by definition and shown separately as "chain reads: N" |
| V5 | **Attack lab**: Tamper / Replay / Expire / Wrong audience buttons re-run the stored presentation in **dry-run** mode with one mutation → exactly one red row each (dry-run semantics in Step 13) |
| V6 | Works with the issuer process killed (chain + IPFS only) |
| V7 | "Reset demo" button (verifier-local: `POST /admin/reset` clears requests, reports and nonces) |

### Admin / governance
| # | Feature |
|---|---|
| A1 | Governance tab (issuer console, uses account #0): register / revoke / **reactivate** issuer, allow / **disallow** credential type |
| A2 | Live on-chain event feed (`IssuerRegistered`, `CredentialTypeAllowed`, `CredentialTypeDisallowed`, `IssuerRevoked`, `IssuerReactivated`, `StatusListPublished`, `PointerSet`) polled every 2 s |
| A3 | **Privacy scan** button: reads `data/issuer.json` server-side, builds the term list from every `subject` field of every ledger row plus every holder DID/address seen in claim proofs, then greps every Anvil block input, every log and every IPFS pin for those terms (raw, hex, base64url) → "0 hits over N blocks / M logs / K blobs" (the term count is shown and must be > 0) |
| A4 | `pnpm dev` (deterministic redeploy), `pnpm reset` (clean-only, never restarts), and one **per-app** "Reset demo" button (wallet H8, verifier V7, issuer console: `POST /admin/reset` truncates `data/issuer.json` and republishes status list v1). Browser origins differ (:4001/:5173/:5174), so there is deliberately no cross-tab broadcast |

### Cross-cutting
- **Crypto**: ES256K-R JWS (viem `sign`/`recoverAddress` + noble sha256), SD-JWT via `@sd-jwt/core`, BIP-39 (`@scure/bip39`), HKDF-SHA256 (`@noble/hashes/hkdf.js`), argon2id (`hash-wasm`), AES-256-GCM (WebCrypto), base64url helpers, CSPRNG.
- **Storage**: IndexedDB (`idb-keyval`, via `@dcv/core`'s `VaultStore`) in the wallet; JSON file in the issuer; Kubo IPFS for status lists + encrypted backups; `assertOpaque()` guard on every backup `put`; chain for anchors/pointers only.
- **On-chain**: 4 contracts (§6), Foundry tests incl. fuzz; viem clients; ERC-1056 `did:ethr` resolution.
- **Tests**: `forge test`; Vitest 5 (unit with KAT vectors, integration against a **self-spawned** Anvil per package, `evm_snapshot`/`evm_revert` isolation for mutating tests); in-process Hono tests; `scripts/e2e.ts` (4 verification rounds incl. issuer killed); Playwright (3 specs); privacy scan.

### Stretch goals (only after Gate 18)
| # | Stretch |
|---|---|
| S1 | `_sd` decoy digests + "why is this hidden?" UX (½ day) |
| S2 | Camera QR scanning with `@yudiel/react-qr-scanner@2.6.0` (½ day; link/paste transport is the base) |
| S3 | MetaMask holder via wagmi 3.7 as a *second unlock factor* wrapping the seed — never as the root secret (1–2 days) |
| S4 | OpenID4VP-shaped request/response (`presentation_definition`) (2 days) |
| S5 | Suspension purpose (second status list) + `credentialSchema` enforcement (1 day) |
| S6 | Batch issuance of *k* unlinkable copies (different salts/indices) (1 day) |
| S7 | Issuer key rotation via ERC-1056 `changeOwner`/delegates with block-height-aware verification (3 days) |
| S8 | BBS+ Data Integrity proof (`@digitalbazaar/bbs-2023-cryptosuite`) for unlinkable presentations (1–2 weeks) |
| S9 | Shamir 2-of-3 recovery kit (`shamir-secret-sharing`) (½ day) |
| S10 | Second credential template `EmployeeIdCredential` (`employeeFrame: credentialSubject: { _sd: ['name','employeeId','department'] }`, `buildEmployeeIdCredential`, schema + sd-jwt test, `allowCredentialType` in `deploy.ts`) (½ day) |

---

## 3. Tech stack

| Layer | Choice (pinned) | Why |
|---|---|---|
| Chain | Foundry **v1.8.3** (`forge`, `anvil`, `cast`), native Windows binaries | Fast Solidity tests; Anvil = free local EVM, 10 funded accounts, deterministic contract addresses, `evm_snapshot`/`evm_revert` |
| Solidity | `0.8.30` via `foundry.toml`; OpenZeppelin Contracts **v5.6.1** (`Ownable`), vendored as a plain committed directory under `lib/` (no submodule) | Vendored ERC-1056 needs `^0.8.24`; a clean clone must build with no submodule step |
| Chain client | **viem 2.56.8** | Typed ABI, local accounts, `sign`/`recoverAddress` (ES256K-R), `createTestClient({ mode: 'anvil' })` for `setBalance`/`snapshot`/`revert` (typed; `PublicClient.request` does not know the `anvil_*` methods) |
| DID | `did-resolver` **^5.0.1** + `ethr-did-resolver` **14.1.4** (registry contract from `ethr-did-registry` 2.0.0, taken from the npm tarball) | `did:ethr` on custom network `anvil`; `did-resolver` must be **^5** because `ethr-did-resolver@14.1.4` declares `did-resolver ^5.0.1` (a `^6` pin installs two copies and breaks `new Resolver(...)` typings) |
| Credential format | W3C VCDM 2.0 JSON secured as SD-JWT (`vc+sd-jwt`) via **`@sd-jwt/core` 0.21.0** (single dep `@owf/identity-common`) | RFC 9901 selective disclosure + KB-JWT; `options.header` overrides `typ`; exports `decodeSdJwt`, `getClaims`, `splitSdJwt` for the per-check pipeline; `verify()` takes `currentDate`/`skewSeconds`/`skipJwtClaimValidation` |
| Hashing / KDF | **`@noble/hashes` 2.4.0** (`sha2.js`, `sha3.js`, `hkdf.js`), **`hash-wasm` 4.12.0** (argon2id, WASM) | Audited; WASM argon2id is 5–10× faster than pure JS in the browser |
| Mnemonic | **`@scure/bip39` 2.4.0** | Audited BIP-39, KAT-testable |
| Symmetric crypto | WebCrypto `AES-GCM` (`globalThis.crypto.subtle`) | Browser + Node ≥ 20, no deps |
| Schema | **`zod` 4.6.5** | Runtime VCDM 2.0 shape checks |
| Status list | Own ~120-line Bitstring Status List (`CompressionStream('gzip')`, multibase `u`) | Spec is small; a lib would hide the demo point |
| IPFS | Kubo **v0.43.1** (`ipfs daemon --offline`, project-local `./.ipfs`, zip sha512 vendored in `scripts/ipfs.mjs`) + `kubo-rpc-client` **7.1.0** (`add(..., { cidVersion: 1, rawLeaves: true, pin: true })`) | Free, local, content-addressed; Kubo is the last Shipyard release but works fully offline; Helia (in-browser) is the fallback path |
| APIs | **Hono 4.13.8** + `@hono/node-server` 2.1.1, `hono/cors` on both APIs | Tiny, TS-first, in-process `app.request()` tests |
| Front-ends | **Vite 8.3.0**, **React 19.3.0** (as scaffolded by `create-vite` 9.2.1), `qrcode.react` 4.2.0, `idb-keyval` 6.3.0; issuer console = vanilla HTML/JS served by Hono; `vite.config.ts` sets `envDir` to the workspace root | Wallet and verifier are the only React apps; the console is a form + tables |
| Language / tooling | Node **24 LTS** (`@types/node@^24` resolves to 24.x), **pnpm 12** (`npm install -g pnpm@12`; `"packageManager": "pnpm@12.5.1"` in root `package.json`), TypeScript **~6.0.3** (`latest` is 7.0.2 native — 6.0.x is the safe bridge), `tsx` 4.23 | One `pnpm -r test` (workspace-concurrency 1) |
| Orchestration | `concurrently` 10.0.5, `wait-on` 9.1.0, all multi-step tasks as `.mjs`/`.ts` scripts | No shell quoting in `package.json`; same command in PowerShell and bash |
| Tests | `forge test`; **Vitest 5.0.1** (`test.projects`, `fake-indexeddb` 6.x for vault tests, one `vitest.config.ts` + own Anvil port per package); `@playwright/test` **1.63.0** (3 specs, Week 4) | One gate per step |

**Format decision (why this and not the alternatives).** SD-JWT securing a VCDM 2.0 payload is what W3C VC-JOSE-COSE and the EU wallet ecosystem standardised, the TS library is ~one dependency, and the KB-JWT gives holder binding + replay protection for free. `did-jwt-vc` only emits VCDM 1.1; `@sd-jwt/sd-jwt-vc` is the *IETF* SD-JWT VC data model (`dc+sd-jwt`, `vct`) and its `verify()` tries to HTTP-fetch status lists unless disabled — not what the brief asked; Veramo is a whole agent framework; a hand-rolled EIP-712 struct with a `bytes32[]` of salted hashes is the simplest to write but is "VC-shaped JSON" with no interoperable disclosure, status or holder-binding vocabulary. Honest trade-off: SD-JWT presentations are linkable across colluding verifiers (same signature/digests); BBS+ (S8) fixes that and is a talking point. `ES256K-R` is a `did-jwt` convention, not a registered JWA alg — say so; our wallet and verifier are the two ends.

### Cost table

| Item | Cost class | Notes |
|---|---|---|
| Foundry/Anvil, Solidity, OpenZeppelin | Fully free (OSS) | no RPC provider, no faucet |
| Node, pnpm, Vite, React, Hono, Vitest, Playwright, viem, noble, scure, hash-wasm, sd-jwt, did-resolver | Fully free (OSS) | |
| Kubo (local IPFS) | Fully free (OSS) | no pinning service |
| Public testnet RPC (Alchemy/Infura), Pinata/web3.storage, WalletConnect project id | Not used | would be free-tier with registration; explicitly out of scope |
| Domain/TLS/hosting | Not used | localhost only |

Everything lands in **fully free**; no sign-up anywhere.

---

## 4. Demo-scoped architecture

```
                                  ONE COMMAND:  pnpm dev   (scripts/dev.mjs)
 ┌─────────────────────────────────────────────────────────────────────────────────────────┐
 │ concurrently: anvil :8545 ─┐  ipfs daemon --offline (RPC :5001, gateway :8080) ─┐        │
 │ wait-on tcp:8545 tcp:5001 → tsx scripts/deploy.ts → issuer :4001 | verifier-api :4002    │
 │  (no --kill-others)                                 wallet :5173 | verifier-web :5174    │
 └─────────────────────────────────────────────────────────────────────────────────────────┘

  Browser (one window, 3 tabs, zoom 125 %)
 ┌────────────────────────┐   ┌──────────────────────────┐   ┌────────────────────────────┐
 │ ISSUER CONSOLE :4001   │   │ WALLET :5173 (React SPA) │   │ VERIFIER :5174 (React SPA) │
 │ tabs: Issuer|Governance│   │ seed → HKDF → vault key, │   │ request builder, 8-row     │
 │ vanilla HTML/JS        │   │ pairwise did:ethr keys,  │   │ report card, "what we saw",│
 │ + Hono API (acct #1,   │   │ backup+pointer keys      │   │ attack lab                 │
 │   governance acct #0)  │   │ IndexedDB: ciphertext    │   │ + Hono API :4002 (CORS)    │
 └───┬──────────┬─────────┘   └───┬────────────┬─────────┘   └──────┬──────────┬──────────┘
     │ offer QR/link ───────────►│            │ request link ◄─────┘          │
     │ ◄── claim {proof} ────────┤            └── {vp} ──────────────────────►│
     │ ── {sdJwt} ──────────────►│                                            │
 publish status   issue        backup (ciphertext only)             resolve DIDs, isTrustedFor,
 list (boot v1;   (sign)        ▼                                    get(anchor), GET /ipfs/<cid>
 revoke → v2)│  ┌──────────────────────────────────────────────────────────────┐ │
     ▼       │  │ Kubo IPFS (offline)  status-list VCs (public), vault backups  │◄┘
             │  │                      (AES-GCM blobs, assertOpaque-guarded)     │
             │  └──────────────────────────────────────────────────────────────┘
             ▼                                                                      read-only
 ┌───────────────────────────────────────────────────────────────────────────────────────┐
 │ Anvil chainId 31337 (deterministic addresses, account #0 nonces 0..3)                 │
 │  0x5FbD… EthereumDIDRegistry   0xe7f1… IssuerTrustRegistry (Ownable)                  │
 │  0x9fE4… StatusListRegistry    0xCf7E… VaultPointer                                   │
 └───────────────────────────────────────────────────────────────────────────────────────┘
```

**What is simplified vs production, and why**

| Area | Demo | Production | Why simplified |
|---|---|---|---|
| Chain | Anvil, chainId 31337, deterministic accounts, redeploy on every start | Public L2 or permissioned chain; registry in `ethr-did-resolver` deployments | Hard constraint: local, free |
| Governance | One `Ownable` contract, owner = account #0 | Multisig/DAO, OpenID Federation / EBSI trust chains | Governance is a talking point |
| Issuer key | Anvil key in `.env` | HSM/KMS, ERC-1056 delegates, rotation (S7) | Scope |
| Holder key | Seed in browser memory while unlocked; argon2id-wrapped at rest | Secure enclave / passkey PRF; non-extractable keys | Scope; design is already the right shape |
| Transport | Offer/request URLs opened in the wallet tab + QR image | OpenID4VCI / OpenID4VP, DIDComm | Protocol layer doubles scope (S4) |
| Selective disclosure | SD-JWT (linkable across verifiers) | SD-JWT + BBS+ for unlinkable use-cases | Library maturity (S8) |
| Status list hosting | Local Kubo + issuer HTTP fallback, hash anchored | Multi-gateway pinning, still anchored | Local |
| Vault backup | Kubo + `VaultPointer` from an Anvil-funded derived address (`createTestClient().setBalance`) | Paymaster/relayer or an encrypted personal data store | Local chain |
| Issuer persistence | JSON file | Postgres + audit log | No DB setup on Windows |
| Nonce store | In-memory `Map` | Redis/DB with TTL | Sufficient for replay demo |
| Ports/TLS | `http://localhost` + explicit CORS allowlists | HTTPS, DIDs with `service` endpoints | Local |

**Threat model (one slide, drives the design)**

| # | Adversary / event | Answer (section) |
|---|---|---|
| T1 | Malicious verifier wants more than asked / reuses the presentation / correlates | Selective disclosure (§5.2); KB-JWT nonce+aud+iat (§5.5); pairwise DIDs (§5.3) |
| T2 | Compromised issuer / issuer tracking verifications | On-chain trust registry per type (§6.2); status list read from IPFS + chain, never from the issuer (§5.6) |
| T3 | Stolen laptop | argon2id-wrapped seed, AES-GCM records, idle auto-lock (§5.4) |
| T4 | Replay | Single-use nonce, `aud`, `iat` window, `sd_hash` (§5.5) |
| T5 | Cross-verifier correlation | Only requested claims; pairwise DIDs; random status index; residual linkability documented (§12) |
| T6 | PII on chain / IPFS | Invariant enforced by `assertOpaque()` + privacy scan (§5.7) |
| T7 | Lost keys | Mnemonic re-derives everything; encrypted backup + pseudonymous pointer (§5.8) |
| T8 | Tampered storage/node | GCM tags + AAD, CID check, anchored hash, signatures (§5.6) |

---

## 5. Data model & crypto design

### 5.1 Credential JSON (VCDM 2.0, before securing)

```json
{
  "@context": ["https://www.w3.org/ns/credentials/v2", "https://www.w3.org/ns/credentials/examples/v2"],
  "id": "urn:uuid:5a1c4d0e-7b3a-4b2e-9f7a-2b1e4c8d9a10",
  "type": ["VerifiableCredential", "UniversityDegreeCredential"],
  "issuer": { "id": "did:ethr:anvil:0x70997970C51812dc3A010C7d01b50e0d17dc79C8", "name": "Anvil State University" },
  "validFrom": "2026-09-22T09:00:00Z",
  "validUntil": "2036-09-22T09:00:00Z",
  "credentialSubject": {
    "id": "did:ethr:anvil:0x<alice-pairwise-address-for-this-issuer>",
    "name": "Alice Example",
    "birthDate": "2003-04-12",
    "studentId": "ASU-2026-00042",
    "degree": { "type": "BachelorDegree", "name": "Bachelor of Science in Computer Science", "grade": "First Class Honours", "awardedOn": "2026-06-30" }
  },
  "credentialStatus": {
    "id": "http://localhost:4001/status/1#42",
    "type": "BitstringStatusListEntry",
    "statusPurpose": "revocation",
    "statusListIndex": "42",
    "statusListCredential": "http://localhost:4001/status/1"
  }
}
```

`packages/core/src/vc/schema.ts` — zod `CredentialV2Schema`: `@context[0] === 'https://www.w3.org/ns/credentials/v2'`, `type[0] === 'VerifiableCredential'`, `issuer` DID string or `{id}`, `validFrom` ISO 8601, `credentialSubject.id` a `did:ethr:anvil:` DID, optional `credentialStatus` matching `BitstringStatusListEntrySchema` (`statusPurpose ∈ {revocation, suspension}`, `statusListIndex` string of a non-negative integer, `statusListCredential` URL whose last path segment is the numeric `listId`). The disclosable subject fields are exactly `name`, `birthDate`, `studentId`, `degree.name`, `degree.grade`, `degree.awardedOn` (there is no `gpa` field anywhere).

### 5.2 Securing: `application/vc+sd-jwt` (VC-JOSE-COSE + RFC 9901)

Serialized: `<header>.<payload>.<sig>~<disclosure 1>~…~<disclosure n>~[<KB-JWT>]`

Issuer JWS header: `{ "alg": "ES256K-R", "typ": "vc+sd-jwt", "cty": "vc", "kid": "did:ethr:anvil:0x7099…79C8#controller" }`

Payload = credential + `iss` (issuer DID), `iat`, `cnf: { "kid": "did:ethr:anvil:0x<pairwise>#controller" }`, `_sd_alg: "sha-256"`, with `credentialSubject._sd` / `credentialSubject.degree._sd` digests replacing the disclosable claims.

```ts
// packages/core/src/sdjwt/frames.ts
export const degreeFrame: DisclosureFrame<DegreePayload> = {
  credentialSubject: { _sd: ['name', 'birthDate', 'studentId'], degree: { _sd: ['name', 'grade', 'awardedOn'] } },
};
// never disclosable: @context, type, issuer, validFrom/Until, credentialStatus, cnf, credentialSubject.id, degree.type
```

**Signing scheme — ES256K-R.** secp256k1 over `sha256(signingInput)`, 65-byte `r‖s‖v` (v = 27/28, viem convention), base64url. A fresh `did:ethr` document exposes only `blockchainAccountId` (no public key), so verification is `recoverAddress(hash, sig) == address`.

```ts
// packages/core/src/crypto/es256k.ts
import { sign } from 'viem/accounts';
import { recoverAddress, toHex, type Address, type Hex } from 'viem';
import { sha256 } from '@noble/hashes/sha2.js';
import { b64u } from './base64url.js';
export const ES256K_R = 'ES256K-R' as const;
export function createEs256kSigner(privateKey: Hex): (data: string) => Promise<string> {
  return async (data) => b64u.encode(await sign({ hash: toHex(sha256(new TextEncoder().encode(data))), privateKey, to: 'bytes' }));
}
export function createAddressVerifier(expected: Address): (data: string, sig: string) => Promise<boolean> {
  return async (data, sig) => {
    const recovered = await recoverAddress({ hash: toHex(sha256(new TextEncoder().encode(data))), signature: toHex(b64u.decode(sig)) });
    return recovered.toLowerCase() === expected.toLowerCase();
  };
}
```

```ts
// packages/core/src/sdjwt/instance.ts  (verified against @sd-jwt/core 0.21.0 typings)
import { SDJwtInstance, type DisclosureFrame, type PresentationFrame } from '@sd-jwt/core';
import { sha256 } from '@noble/hashes/sha2.js';
const hasher = (data: string | ArrayBuffer, _alg: string) =>
  sha256(typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data));   // Hasher => Uint8Array
const saltGenerator = (len: number) => b64u.encode(randomBytes(len));
export const issuerSdJwt = (issuerKey: Hex) => new SDJwtInstance({ signer: createEs256kSigner(issuerKey), signAlg: ES256K_R, hasher, hashAlg: 'sha-256', saltGenerator });
export const holderSdJwt = (holderKey: Hex) => new SDJwtInstance({ hasher, hashAlg: 'sha-256', saltGenerator, kbSigner: createEs256kSigner(holderKey), kbSignAlg: ES256K_R });
export const verifierSdJwt = (issuerAddr: Address, holderAddr: Address) => new SDJwtInstance({
  hasher, hashAlg: 'sha-256',
  verifier: createAddressVerifier(issuerAddr),
  kbVerifier: (data, sig, _payload) => createAddressVerifier(holderAddr)(data, sig),   // KbVerifier = (data, sig, payload)
});
// issue / present / verify
const sdJwt = await issuerSdJwt(k).issue(payload, degreeFrame, { header: { typ: 'vc+sd-jwt', cty: 'vc', kid } });
const vp = await holderSdJwt(h).present(sdJwt, { credentialSubject: { degree: { name: true } } } as PresentationFrame<DegreePayload>,
  { kb: { payload: { iat: now, aud: req.aud, nonce: req.nonce } } });               // KBOptions.payload omits sd_hash; library computes it
const r = await verifierSdJwt(i, a).verify(vp, { keyBindingNonce: req.nonce, expectedKeyBindingAudience: req.aud, keyBindingMaxAgeSeconds: 300,
  requiredClaimKeys: ['credentialSubject'], currentDate: now });                     // pass currentDate whenever a test overrides `now`
```
The library `verify()` is used in unit tests as a cross-check; the verifier *pipeline* (§5.5, Step 13) uses `splitSdJwt` / `decodeSdJwt` / `getClaims` + our own per-check functions so every row is evaluated independently. `verify()` validates `exp`/`nbf`/`iat` by default (`skipJwtClaimValidation`, `currentDate`, `skewSeconds` exist); any test that overrides the pipeline's `now` must pass the same value as `currentDate` to the library cross-check, otherwise the two disagree on stale KB-JWTs.

### 5.3 DID method: `did:ethr` on network `anvil`, pairwise per issuer

- Identifier `did:ethr:anvil:0x<checksummed address>`; resolver config:
```ts
// packages/core/src/did/resolver.ts
import { Resolver } from 'did-resolver';               // ^5.0.1 — same major as ethr-did-resolver's dependency
import { getResolver } from 'ethr-did-resolver';
export const makeResolver = (cfg: { rpcUrl: string; registry: Address }) =>
  new Resolver(getResolver({ networks: [{ name: 'anvil', chainId: 31337, rpcUrl: cfg.rpcUrl, registry: cfg.registry }] }));
```
- A fresh address resolves (zero transactions) to `verificationMethod[0] = { id: <did>#controller, type: 'EcdsaSecp256k1RecoveryMethod2020', blockchainAccountId: 'eip155:31337:0x…' }`. `did/ethr.ts`: `addressToDid`, `didToAddress`, `resolveControllerAddress(resolver, did)` (reads `blockchainAccountId` from the resolved document — current controller; block-height-aware history is S7).
- **Pairwise holder DIDs**: the wallet derives `holder-key/<issuerDid>` (§5.4) the moment it opens an offer, so each issuer sees a different address and issuers cannot join records by DID. The KB-JWT is signed with the key whose address equals `cnf.kid`'s DID. The wallet's default DID (`holder-key/default`) is only for display. Zero extra infrastructure: pairwise `did:ethr` needs no chain state.
- Holder never sends a transaction (except the optional `VaultPointer` write from a *different*, pseudonymous derived key).

### 5.4 Vault: seed-rooted key tree, argon2id wrap, AES-256-GCM records

```
mnemonic (12 words, 128-bit; @scure/bip39 generateMnemonic(english, 128))
  └─ mnemonicToSeed(mnemonic, "")  → seed (64 B)  [in memory only while unlocked]
     ├─ HKDF-SHA256(ikm=seed, salt="dcv/v1", info="vault-key", 32)              → AES-256-GCM vault key (CryptoKey, non-extractable)
     ├─ HKDF-SHA256(seed, "dcv/v1", "holder-key/" + issuerDid + "/" + i, 32)     → secp256k1 key (pairwise); i=0,1,… until 0 < k < n
     ├─ HKDF-SHA256(seed, "dcv/v1", "holder-key/default/" + i, 32)              → default DID key
     ├─ HKDF-SHA256(seed, "dcv/v1", "pointer-key/" + i, 32)                     → secp256k1 key whose address writes VaultPointer
     └─ HKDF-SHA256(seed, "dcv/v1", "backup-key", 32)                           → AES-256-GCM backup key
passphrase ──argon2id(hash-wasm: t=3, m=32 MiB (32768 KiB), p=1, salt 16 B, 32 B out)──> wrapKey
wrappedSeed = AES-256-GCM(wrapKey, iv 12 B, seed, aad="dcv/seed/v1")
IndexedDB key "meta": { v:1, kdf:{ name:'argon2id', t:3, m:32768, p:1, salt }, iv, wrappedSeed, createdAt }
record: header = { v:1, id:<uuid>, type:'credential'|'setting', createdAt }
        { id, header, iv (12 B fresh random), ct = AES-256-GCM(vaultKey, iv, utf8(json(value)), aad=utf8(json(header))) }
```
Why seed-rooted and not `HKDF(personal_sign(...))`: a signature any dapp can request equals the vault key; not all wallets sign deterministically; and it ties the vault to a public address (correlation). The seed gives recovery for free (§5.8). Why argon2id via `hash-wasm`: WASM argon2id at 32 MiB/t=3 takes ~0.3–0.8 s in a Web Worker on a laptop; pure-JS would be 3–6 s and is not on a timed demo's critical path. KDF params are stored in `meta` so unlock always uses what was used at creation. AAD = header binds ciphertext to its own row id/type (swapping `ct` between rows fails). GCM 96-bit random IVs are safe at vault volumes (thousands of messages, not 2^32). secp256k1 keys are checked `0 < k < n` (n = `0xFFFF…FFFEBAAEDCE6AF48A03BBFD25E8CD0364141`) with an HKDF counter retry — never raw bytes.

```ts
// packages/core/src/vault/  (API)
export class Keyring {
  static create(passphrase: string, kdf?: KdfParams): Promise<{ keyring: Keyring; mnemonic: string; meta: VaultMeta }>;
  static fromMnemonic(mnemonic: string, passphrase: string): Promise<{ keyring: Keyring; meta: VaultMeta }>;
  static unlock(meta: VaultMeta, passphrase: string): Promise<Keyring>;             // throws VaultError('BAD_PASSPHRASE')
  lock(): void;                                                                     // zero-fills seed, drops CryptoKeys
  vaultKey(): Promise<CryptoKey>; backupKey(): Promise<CryptoKey>;
  holderAccount(context: string): Promise<{ did: string; address: Address; privateKey: Hex }>;  // context = issuerDid | 'default'
  pointerAccount(): Promise<{ address: Address; privateKey: Hex }>;
}
export async function deriveWrapKey(passphrase: string, kdf: KdfParams): Promise<CryptoKey>;   // argon2id → AES-GCM key
export async function encryptRecord(key: CryptoKey, header: RecordHeader, value: unknown): Promise<VaultRecord>;
export async function decryptRecord<T>(key: CryptoKey, rec: VaultRecord): Promise<T>;          // throws on tag/AAD failure
export interface VaultFile { v: 1; meta: VaultMeta; records: VaultRecord[] }                     // export/import format
// packages/core/src/vault/store.ts — IndexedDB persistence over idb-keyval (dbName 'dcv'); the wallet's vaultStore.ts wraps it
export class VaultStore { constructor(dbName?: string); putMeta(m: VaultMeta); getMeta(); put(rec: VaultRecord); get(id); list(); clear() }
```
The wallet runs `deriveWrapKey` in `src/workers/kdf.worker.ts` (hash-wasm works in workers) with a progress bar.

### 5.5 Holder binding / challenge, proof of possession, verification pipeline

1. **Issuance PoP**: offer `{ id, issuerDid, type, nonce, expiresAt }`; wallet derives the pairwise key and POSTs `proof` = compact JWS header `{ alg:'ES256K-R', typ:'openid4vci-proof+jwt', kid:'<pairwiseDid>#controller' }`, payload `{ aud: issuerDid, nonce, iat }`. Issuer checks `recoverAddress == didToAddress(kid)` and nonce, then issues with `cnf.kid = kid`, `credentialSubject.id = pairwiseDid`.
2. **Presentation request**: `PresentationRequest { id, nonce: b64u(32 random B), aud: 'http://localhost:4002', credentialType, claims: string[] (dot paths), expiresAt }`.
3. Wallet KB-JWT payload `{ iat, aud, nonce }` (+ `sd_hash` added by `@sd-jwt/core`, header `typ: 'kb+jwt'`), signed with the pairwise key.
4. Verifier pipeline (all 8 checks always evaluated; each attack trips exactly one):

| # | `name` | Label in UI | Fails with code |
|---|---|---|---|
| 1 | `format` | Well-formed W3C VC secured as `vc+sd-jwt` | `FORMAT_INVALID` (typ/cty/alg/zod) |
| 2 | `issuerSignature` | Signed by the issuer's DID key (chain-resolved) | `ISSUER_SIG_INVALID` |
| 3 | `issuerTrusted` | Issuer trusted for this type (on-chain registry) | `ISSUER_UNTRUSTED` |
| 4 | `disclosures` | Disclosed claims match the signed digests | `DISCLOSURE_DIGEST_MISMATCH`, `SD_HASH_MISMATCH` |
| 5 | `holderBinding` | Presented by the credential's holder (key, nonce, audience) | `KB_SIG_INVALID`, `NONCE_MISMATCH`, `NONCE_REPLAY`, `AUD_MISMATCH` |
| 6 | `freshness` | Fresh: KB `iat` within 300 s, request not expired | `KB_STALE`, `REQUEST_EXPIRED` |
| 7 | `validity` | Within `validFrom`/`validUntil` | `NOT_YET_VALID`, `EXPIRED` |
| 8 | `status` | Not revoked (status list hash-anchored on-chain) | `REVOKED`, `STATUS_HASH_MISMATCH`, `STATUS_SIG_INVALID`, `STATUS_UNAVAILABLE` |

Binding chain: issuer signed `cnf.kid` → KB signature recovers to that DID's controller address → `credentialSubject.id == cnf.kid`'s DID. Nonces are consumed (deleted) on first **real** run. **Dry-run semantics** (attack lab): with `dryRun: true` the pipeline evaluates the nonce against a read-only snapshot (`nonces.peek(id)`), never consumes, and treats the request's own nonce as still valid even if a real run already consumed it; only `simulateConsumedNonce: true` makes `holderBinding` report `NONCE_REPLAY`. This is what lets Tamper / Expire / Wrong-audience each turn exactly one row red after the real submission.

### 5.6 Revocation: Bitstring Status List v1.0 + on-chain anchor

- One list per purpose (`listId = 1`, `revocation`), 131,072 bits (spec minimum, 16 KiB raw); random unused index per credential.
- Status list credential, signed as `vc+jwt` (`alg ES256K-R`, no `_sd`):
```json
{ "@context": ["https://www.w3.org/ns/credentials/v2"], "id": "http://localhost:4001/status/1",
  "type": ["VerifiableCredential", "BitstringStatusListCredential"], "issuer": "did:ethr:anvil:0x7099…79C8",
  "validFrom": "2026-09-22T09:00:00Z",
  "credentialSubject": { "id": "http://localhost:4001/status/1#list", "type": "BitstringStatusList", "statusPurpose": "revocation",
    "encodedList": "uH4sIAAAAAAAAA-3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAIC3AYbSVKsAQAAA" } }
```
(`encodedList` = multibase `u` + base64url-nopad(GZIP(bitstring)); the value is the W3C Recommendation's all-zero example and is the Step 10 known-answer test vector for **decoding**; our encoder is tested by round-trip, not byte equality, because gzip header bytes 4–9 are implementation-defined.)
- Publish: `jwt = signJws(...)` → `cid = kubo.add(utf8(jwt), { cidVersion: 1, rawLeaves: true, pin: true })` (a ≤ 256 KiB single block → `bafkrei…`, stable across Kubo versions) → `StatusListRegistry.publish(1, cid, keccak256(utf8(jwt)), 'revocation')` from account #1. **When**: v1 at issuer boot (if `versionOf(issuer,1) === 0`), then once per revoke/unrevoke; issuance never republishes.
- Verify: `issuerAddr` comes from the **verified** `iss`, `listId` from the **signed** `credentialStatus.statusListCredential` (last path segment) — never from an unsigned URL. `get(issuerAddr, listId)` → fetch `${IPFS_GATEWAY}/ipfs/${cid}` (fallback: the `statusListCredential` URL, only if IPFS is down) → `keccak256 == contentHash` → JWS signature by `issuerAddr` → list `issuer == iss` and `id == statusListCredential` → `statusPurpose` matches → `bit[statusListIndex]`.

### 5.7 Privacy invariant (enforced, not conventional)

- `packages/core/src/privacy/opaque.ts`: `assertOpaque(bytes)` throws `PlaintextRejected` if the bytes decode as UTF-8 JSON, or contain `credentialSubject`, `~`, `eyJ` or `did:`. `BackupStore.put()` calls it before every IPFS add. (Status lists are public by design and use a separate `publishStatusList` path.)
- `packages/core/src/privacy/scan.ts`: `scanForPii({ publicClient, kubo, terms }) → { blocks, logs, blobs, terms: number, hits: Array<{ where, term, encoding }> }` — walks every block (`tx.input`), every log (`getLogs({fromBlock: 0n})`), every pinned blob; matches raw UTF-8, hex-of-UTF-8 and base64url encodings. **Terms** are built server-side by the issuer (`apps/issuer/src/privacy.ts`): every string leaf under `subject` of every row in `data/issuer.json` (name, birthDate, studentId, degree.name/grade/awardedOn) plus every holder DID and address seen in claim proofs (kept in memory only, never in the ledger). `scanForPii` throws `NoTerms` if the list is empty, so a "0 hits" result is never vacuous. Exposed as `pnpm privacy-scan` and as the console's "Privacy scan" button.

### 5.8 Backup & restore (Step 16)

Backup: `bundle = AES-GCM(backupKey, iv, json(records), aad="dcv/backup/v1")` → `assertOpaque` → `kubo.add(bundle, { cidVersion: 1, rawLeaves: true, pin: true })` → CID; `locator = AES-GCM(backupKey, iv2, utf8(cid), aad="dcv/pointer/v1")` → `VaultPointer.setPointer(locator)` from `pointerAccount()` after the wallet funds it with `createTestClient({ mode: 'anvil', chain: anvilChain, transport: http(rpcUrl) }).setBalance({ address, value: parseEther('1') })` (production: paymaster). Restore on a wiped browser: mnemonic + new passphrase → `Keyring.fromMnemonic` → `pointerAccount()` → `getPointer(addr)` → decrypt → `kubo.cat(cid)` → decrypt → import records. All pairwise keys re-derive, so every `cnf` binding still works — no re-issuance.

---

## 6. Smart contracts (`packages/contracts/src/`)

Deployed by `scripts/deploy.ts` from account #0 in this exact order on a fresh Anvil → deterministic addresses:

| Nonce | Contract | Address |
|---|---|---|
| 0 | `EthereumDIDRegistry` | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| 1 | `IssuerTrustRegistry` | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| 2 | `StatusListRegistry` | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |
| 3 | `VaultPointer` | `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9` |

### 6.1 `EthereumDIDRegistry.sol` (vendored ERC-1056 from `ethr-did-registry@2.0.0`, `pragma solidity ^0.8.24`)
- **Purpose**: anchor for `did:ethr`; deployed unchanged so `ethr-did-resolver` resolves against it.
- **Storage**: `mapping(address=>address) owners; mapping(address=>mapping(bytes32=>mapping(address=>uint256))) delegates; mapping(address=>uint256) changed; mapping(address=>uint256) nonce`.
- **Functions used**: `identityOwner(address) view returns (address)`, `changeOwner(address identity, address newOwner)`, `addDelegate(address identity, bytes32 delegateType, address delegate, uint256 validity)`, `setAttribute(address identity, bytes32 name, bytes value, uint256 validity)`.
- **Events**: `DIDOwnerChanged`, `DIDDelegateChanged`, `DIDAttributeChanged`. **Access**: `onlyOwner(identity, actor)` modifier.
- Source: `contracts/EthereumDIDRegistry.sol` inside the npm tarball of `ethr-did-registry@2.0.0` (`npm pack ethr-did-registry@2.0.0`) — a pinned, reproducible source, not the `master` branch.

### 6.2 `IssuerTrustRegistry.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
contract IssuerTrustRegistry is Ownable {
    struct IssuerInfo { string name; string metadataURI; bool active; uint64 registeredAt; }
    mapping(address => IssuerInfo) private _issuers;
    mapping(address => mapping(bytes32 => bool)) private _allowedTypes;   // issuer => keccak256(type) => allowed
    event IssuerRegistered(address indexed issuer, string name, string metadataURI);
    event IssuerRevoked(address indexed issuer);
    event IssuerReactivated(address indexed issuer);
    event CredentialTypeAllowed(address indexed issuer, bytes32 indexed typeHash, string credentialType);
    event CredentialTypeDisallowed(address indexed issuer, bytes32 indexed typeHash);
    error NotRegistered(address issuer); error AlreadyRegistered(address issuer); error AlreadyActive(address issuer); error ZeroAddress();
    constructor(address initialOwner) Ownable(initialOwner) {}
    function registerIssuer(address issuer, string calldata name, string calldata metadataURI) external onlyOwner;
    function revokeIssuer(address issuer) external onlyOwner;                 // active=false; types kept
    function reactivateIssuer(address issuer) external onlyOwner;             // registered && !active → active=true; emits IssuerReactivated
    function allowCredentialType(address issuer, string calldata credentialType) external onlyOwner;
    function disallowCredentialType(address issuer, string calldata credentialType) external onlyOwner;
    function isTrusted(address issuer) external view returns (bool);
    function isTrustedFor(address issuer, string calldata credentialType) external view returns (bool); // active && allowed
    function getIssuer(address issuer) external view returns (IssuerInfo memory);
}
```
Access: all mutators `onlyOwner` (account #0). Only organisational data on-chain. `reactivateIssuer` exists so the governance demo (and tests) can undo a revoke without redeploying.

### 6.3 `StatusListRegistry.sol`
```solidity
pragma solidity ^0.8.24;
contract StatusListRegistry {
    struct StatusList { string cid; bytes32 contentHash; string purpose; uint64 version; uint64 updatedAt; }
    mapping(address => mapping(uint256 => StatusList)) private _lists;      // issuer => listId => list
    event StatusListPublished(address indexed issuer, uint256 indexed listId, uint64 version, string cid, bytes32 contentHash, string purpose);
    error EmptyCid(); error EmptyHash();
    function publish(uint256 listId, string calldata cid, bytes32 contentHash, string calldata purpose) external; // msg.sender-scoped; version++
    function get(address issuer, uint256 listId) external view returns (StatusList memory);
    function versionOf(address issuer, uint256 listId) external view returns (uint64);
}
```
Access: none needed — an issuer can only publish under `msg.sender`; trust comes from `IssuerTrustRegistry` (so a revoked issuer can still revoke its own credentials). Anchor (32 B + CID) rather than 16 KiB bitstring keeps the production shape.

### 6.4 `VaultPointer.sol`
```solidity
pragma solidity ^0.8.24;
contract VaultPointer {
    mapping(address => bytes) private _pointers; mapping(address => uint64) public updatedAt;
    event PointerSet(address indexed owner, uint64 updatedAt); event PointerCleared(address indexed owner);
    error TooLarge(uint256 length);
    function setPointer(bytes calldata encryptedLocator) external;    // require length <= 512; _pointers[msg.sender] = …
    function clearPointer() external;
    function getPointer(address owner) external view returns (bytes memory, uint64);
}
```
Access: implicit (`msg.sender` slot). The sender is a seed-derived pseudonymous address unlinkable to any DID; the value is AES-GCM ciphertext.

### 6.5 Deploy + seed (`scripts/deploy.ts`, viem, tsx; root script `pnpm deploy:local` — `deploy` is a pnpm built-in and must not be used as a script name)
`deployContract` ×4 in the order above → `registerIssuer(acct1, "Anvil State University", "http://localhost:4001/metadata.json")` (a plain URL string; no IPFS dependency at deploy time — `apps/issuer` serves `data/issuer-metadata.json` at that path. Step 16 may optionally replace it with `ipfs://<cid>` when `IPFS_API_URL` is reachable, but Gate 5 asserts the HTTP form) → `allowCredentialType(acct1, "UniversityDegreeCredential")` → asserts the four addresses equal the table (fails loudly if Anvil was not fresh) → writes `DEPLOYMENTS_FILE` (default `deployments/anvil.json`):
`{ chainId: 31337, rpcUrl, didRegistry, trustRegistry, statusRegistry, vaultPointer, issuer: { address, did, name, metadataURI }, block, deployedAt }`. Apps import this file (Vite serves it from the workspace root); no addresses in `.env`. `deploy.ts` is also called programmatically by the test helper `spawnAnvil()` (Step 5) with a different port and `DEPLOYMENTS_FILE`.

---

## 7. Repo layout

```
dcv/
├─ package.json                    # pnpm workspaces root; "packageManager": "pnpm@12.5.1"; scripts (all defined in §8):
│                                  #   dev, chain, ipfs, deploy:local, build:contracts, reset, stop:issuer, env:init,
│                                  #   test (pnpm -r --workspace-concurrency=1 --if-present test), test:contracts, e2e, pw, privacy-scan, typecheck
├─ pnpm-workspace.yaml             # packages: ['packages/*', 'apps/*', 'e2e']
├─ tsconfig.base.json              # module NodeNext, target ES2022, strict
├─ .env.example / .env             # §11 (optional; every var has a default)
├─ .gitignore                      # node_modules .ipfs out cache deployments data/issuer.json data/issuer.pid .env test-results tools/
├─ README.md
├─ docs/demo-script.md             # §10 verbatim, printed for the rehearsal
├─ deployments/anvil.json          # written by scripts/deploy.ts (test-core.json / test-issuer.json / test-verifier.json by the test helper)
├─ data/issuer-metadata.json       # {name, website}; served by the issuer at /metadata.json
├─ data/issuer.json                # issuer ledger (gitignored)
├─ data/issuer.pid                 # written by the issuer on start (gitignored)
├─ tools/                          # gitignored local cache of kubo_v0.43.1_windows-amd64.zip (§12)
├─ scripts/
│  ├─ env.mjs                      # loads .env from the workspace root, exports defaults from §11 (used by every script)
│  ├─ env-init.mjs                 # copies .env.example → .env if missing   (pnpm env:init)
│  ├─ dev.mjs                      # concurrently(anvil, ipfs) → waitOn → deploy → concurrently(apps); grows from Step 12; never --kill-others
│  ├─ ipfs.mjs                     # IPFS_PATH=./.ipfs; init if needed; CidVersion 1; API + Gateway CORS; ipfs daemon --offline
│  ├─ deploy.ts                    # §6.5
│  ├─ build-contracts.mjs          # forge build + copy ABIs to packages/core/src/chain/abi/*.json
│  ├─ reset.mjs                    # clean-only: kill listeners on 8545/5001/8080/4001/4002/5173/5174, delete data/issuer.json, data/issuer.pid, deployments/anvil.json; never restarts
│  ├─ stop-issuer.mjs              # reads data/issuer.pid; taskkill /PID /F on win32, process.kill elsewhere   (pnpm stop:issuer)
│  ├─ e2e.ts                       # scripted 4-round flow (Step 17)
│  └─ privacy-scan.ts              # §5.7 CLI
├─ packages/
│  ├─ contracts/                   # Foundry
│  │  ├─ foundry.toml  remappings.txt  lib/openzeppelin-contracts/   (committed plain directory, nested .git removed)
│  │  ├─ src/{EthereumDIDRegistry,IssuerTrustRegistry,StatusListRegistry,VaultPointer}.sol
│  │  └─ test/{EthereumDIDRegistry,IssuerTrustRegistry,StatusListRegistry,VaultPointer}.t.sol
│  └─ core/                        # @dcv/core — TS, ESM, runs in Node + browser
│     ├─ package.json  vitest.config.ts (projects: unit, vault, integration; integration globalSetup → spawnAnvil({ port: 8546, pkg: 'core' }))
│     ├─ src/config.ts             # typed defaults for every §11 variable (Node + Vite import.meta.env aware)
│     ├─ src/crypto/{base64url,random,es256k,jws,hkdf,secp,mnemonic}.ts
│     ├─ src/did/{ethr,resolver}.ts
│     ├─ src/chain/{client,deployments,abi/*.json,trustRegistry,statusRegistry,vaultPointer,anvil}.ts   # anvil.ts: setBalance, withSnapshot
│     ├─ src/vc/{types,schema,build}.ts
│     ├─ src/sdjwt/{instance,frames,issue,present,decode}.ts
│     ├─ src/status/{bitstring,credential,check}.ts
│     ├─ src/vault/{kdf,keyring,record,file,store}.ts
│     ├─ src/ipfs/{kubo,backupStore}.ts
│     ├─ src/privacy/{opaque,scan}.ts
│     ├─ src/verifier/{request,checks,pipeline,report,fetchRecorder}.ts
│     ├─ src/offer/{proof}.ts
│     ├─ src/testing/{spawnAnvil,issueTestCredential}.ts   # exported helpers used by every package's tests
│     └─ test/
│        ├─ unit/{base64url,config,hkdf,mnemonic,secp,es256k,jws,did,schema,sdjwt,proof,bitstring,statusCredential,vault,keyring,store,opaque,request}.test.ts
│        ├─ integration/{chain,did,trust,statusPublish,ipfs,verifierPipeline,privacyScan}.test.ts
│        └─ setup/anvil.global.ts  # calls spawnAnvil({ port: 8546, pkg: 'core' }); teardown kills it
├─ apps/
│  ├─ issuer/                      # @dcv/issuer — Hono :4001 + static console
│  │  ├─ package.json  vitest.config.ts (globalSetup → spawnAnvil({ port: 8547, pkg: 'issuer' }))
│  │  ├─ src/{server,ledger,issue,offers,statusList,governance,events,privacy}.ts
│  │  ├─ public/{index.html,console.js,console.css}
│  │  └─ test/{issue,revoke,governance,cors}.test.ts
│  ├─ verifier-api/                # @dcv/verifier-api — Hono :4002
│  │  ├─ package.json  vitest.config.ts (globalSetup → spawnAnvil({ port: 8548, pkg: 'verifier' }))
│  │  ├─ src/{server,requests,lab,admin}.ts
│  │  └─ test/{verify,lab,cors}.test.ts
│  ├─ verifier-web/                # @dcv/verifier-web — Vite :5174 (scaffolded by create-vite, package.json name edited)
│  │  ├─ vite.config.ts            # envDir: workspace root; server.port 5174
│  │  └─ src/{main.tsx,App.tsx,RequestBuilder.tsx,Report.tsx,AttackLab.tsx,Evidence.tsx,ResetButton.tsx}
│  └─ wallet/                      # @dcv/wallet — Vite :5173 (scaffolded by create-vite, package.json name edited)
│     ├─ vite.config.ts            # envDir: workspace root; server.port 5173
│     ├─ src/{main.tsx,App.tsx}  src/state/{vaultStore,keyring,idleLock}.ts  src/workers/kdf.worker.ts
│     ├─ src/pages/{Onboard,Unlock,Credentials,CredentialDetail,Accept,Present,Backup,Restore}.tsx
│     └─ test/vaultStore.test.ts
└─ e2e/                            # Playwright (Week 4)
   ├─ playwright.config.ts
   └─ tests/{flow.spec.ts,attacks.spec.ts,restore.spec.ts}
```

---

## 8. Step-by-step build plan with a TEST GATE after every step

Conventions: PowerShell = **Windows Terminal → Windows PowerShell 5.1** (native; every block below is 5.1-safe: no `&&`, sequences as `a; if ($?) { b }`; `curl.exe` not `curl`). `foundryup` runs in **Git Bash** (its installer does not support PowerShell; the binaries it installs are native `.exe` and work from PowerShell afterwards). Bash blocks = WSL2 Ubuntu / Linux / macOS. Do not start step N+1 until gate N is green.

**Schedule (working days)** — Week 1: Steps 0–5 (0.5 + 0.5 + 1 + 1 + 1 + 1 = 5 d). Week 2: Steps 6–11 (1 + 1 + 0.5 + 1.5 + 0.5 + 1.5 = 6 d). Week 3: Steps 12–14 (2 + 1.5 + 1.5 = 5 d). Week 4: Steps 15–18 (2.5 + 1.5 + 1 + 1 = 6 d). Total ≈ 22 days; Step 16 (1.5 d) is the first cut if Week 4 slips, Playwright in Step 18 the second.

### Step 0 — Install and verify the toolchain (0.5 d)
**Goal**: Git, Node 24 LTS, pnpm 12, Foundry v1.8.x, Kubo v0.43.1 on PATH.
**Files**: none.
**Commands (PowerShell)**:
```powershell
winget install --id Git.Git -e --source winget
winget install --id OpenJS.NodeJS.LTS -e --source winget      # Node 24.x LTS
# optional: winget install --id Microsoft.PowerShell -e --source winget   (PowerShell 7; not required — every block here is 5.1 syntax)
# open a NEW PowerShell window so PATH refreshes
node -v; npm -v
npm install -g pnpm@12; pnpm -v                               # pnpm 12.x (pnpm@latest is 12.5.1 today; never "pnpm 10")
git config --global core.autocrlf false; git config --global core.longpaths true
# Foundry — run in Git Bash (Start > Git Bash). The installer (foundryup-init 2.0.0) only copies foundryup to ~/.foundry/bin
# and PRINTS an export line; it no longer edits ~/.bashrc, so export PATH yourself:
#   curl -L https://getfoundry.sh/install | bash
#   export PATH="$HOME/.foundry/bin:$PATH" && foundryup
# then make the .exe binaries visible to PowerShell (new window afterwards):
[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path","User") + ";$env:USERPROFILE\.foundry\bin", "User")
```
Fallback without Git Bash (official native zip):
```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.foundry\bin" | Out-Null
Invoke-WebRequest https://github.com/foundry-rs/foundry/releases/download/v1.8.3/foundry_v1.8.3_win32_amd64.zip -OutFile "$env:TEMP\foundry.zip"
Expand-Archive "$env:TEMP\foundry.zip" -DestinationPath "$env:USERPROFILE\.foundry\bin" -Force
Get-ChildItem "$env:USERPROFILE\.foundry\bin"        # must list forge.exe, anvil.exe, cast.exe at the top level; if they landed in a subfolder, move them up
```
Kubo:
```powershell
New-Item -ItemType Directory -Force tools | Out-Null
Invoke-WebRequest https://github.com/ipfs/kubo/releases/download/v0.43.1/kubo_v0.43.1_windows-amd64.zip -OutFile tools\kubo_v0.43.1_windows-amd64.zip
Get-FileHash tools\kubo_v0.43.1_windows-amd64.zip -Algorithm SHA512      # record this value in scripts/ipfs.mjs (Step 16) and keep the zip in tools/
Expand-Archive tools\kubo_v0.43.1_windows-amd64.zip -DestinationPath C:\tools -Force        # yields C:\tools\kubo\ipfs.exe
[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path","User") + ";C:\tools\kubo", "User")
```
(Do **not** run `ipfs init` globally; `scripts/ipfs.mjs` initialises a project-local repo in `./.ipfs` and sets CORS.)
**Commands (bash / WSL2)**:
```bash
sudo apt-get update && sudo apt-get install -y git curl build-essential
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt-get install -y nodejs
npm install -g pnpm@12
curl -L https://getfoundry.sh/install | bash
export PATH="$HOME/.foundry/bin:$PATH" && foundryup        # add the export line to ~/.bashrc yourself
mkdir -p tools && curl -L https://github.com/ipfs/kubo/releases/download/v0.43.1/kubo_v0.43.1_linux-amd64.tar.gz -o tools/kubo.tar.gz
sha512sum tools/kubo.tar.gz && tar xzf tools/kubo.tar.gz && (cd kubo && sudo bash install.sh)
```
**TEST GATE 0** (new PowerShell window):
```powershell
git --version; node -v; pnpm -v; forge --version; anvil --version; cast --version; ipfs --version
Get-ChildItem "$env:USERPROFILE\.foundry\bin"
anvil --chain-id 31337     # in a second window: cast chain-id --rpc-url http://127.0.0.1:8545  → 31337 ; then Ctrl+C anvil
```
Passes when: `node -v` = `v24.x`, `pnpm -v` = `12.x`, `forge/anvil/cast --version` = `1.8.x`, the `.foundry\bin` listing shows the three `.exe` files, `ipfs --version` = `ipfs version 0.43.1`, `cast chain-id` prints `31337`. Copy Anvil account #0's private key from its startup banner (it is `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`; account #1 is `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`) — always trust the banner over any document.

### Step 1 — Monorepo scaffold + first unit test (0.5 d)
**Goal**: pnpm workspace, TypeScript, Vitest 5 projects, base64url helper.
**Files**: `package.json` (`"packageManager": "pnpm@12.5.1"`), `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `packages/core/package.json` (`"name":"@dcv/core","type":"module"`, scripts `test`, `test:unit`, `test:integration`, `typecheck`), `packages/core/vitest.config.ts` (`test.projects: [{name:'unit', include:['test/unit/**']}, {name:'vault', include:['test/unit/vault*.test.ts','test/unit/keyring*.test.ts','test/unit/store*.test.ts'], setupFiles:['fake-indexeddb/auto']}, {name:'integration', include:['test/integration/**'], globalSetup:'test/setup/anvil.global.ts'}]`), `packages/core/src/crypto/{base64url,random}.ts`, `packages/core/test/unit/base64url.test.ts`.
**Commands** (identical in bash):
```powershell
mkdir dcv; cd dcv; git init; pnpm init
pnpm add -Dw typescript@~6.0.3 vitest@5.0.1 tsx@^4.23.0 @types/node@^24 dotenv@^18 concurrently@10.0.5 wait-on@9.1.0
New-Item -ItemType Directory -Force packages\core\src\crypto, packages\core\test\unit, packages\core\test\integration, packages\core\test\setup | Out-Null
```
`b64u.encode(bytes): string` / `b64u.decode(s): Uint8Array` (RFC 4648 §5, no padding, tolerant of padding on decode); `randomBytes(n)` via `crypto.getRandomValues`. Root scripts: `"test": "pnpm -r --workspace-concurrency=1 --if-present test"` (serial so per-package Anvils never race), `"typecheck": "pnpm -r --if-present typecheck"`.
**TEST GATE 1**: `pnpm test` → `base64url.test.ts` green: `[0,255,1,2]` ↔ `AP8BAg`; `AP8BAg==` decodes too; `randomBytes(32)` twice differ. `pnpm typecheck` clean. `pnpm -v` inside the repo reports 12.5.x (packageManager honoured).

### Step 2 — Foundry project + vendored ERC-1056 registry (1 d)
**Goal**: compile and test `EthereumDIDRegistry.sol`; dependencies vendored so a plain `git clone` builds.
**Files**: `packages/contracts/{foundry.toml,remappings.txt}`, `lib/openzeppelin-contracts/` (committed), `src/EthereumDIDRegistry.sol`, `test/EthereumDIDRegistry.t.sol`.
**Commands (PowerShell)**:
```powershell
forge init packages\contracts --no-git            # add --force if the folder exists; if a flag is rejected: forge init --help
cd packages\contracts
Remove-Item src\Counter.sol, test\Counter.t.sol, script\Counter.s.sol
forge install OpenZeppelin/openzeppelin-contracts@v5.6.1 --no-git
Remove-Item -Recurse -Force lib\openzeppelin-contracts\.git -ErrorAction SilentlyContinue   # make it a plain directory: no submodule, no embedded repo
# vendored ERC-1056 registry, pinned to the npm release (not the master branch):
npm pack ethr-did-registry@2.0.0 --pack-destination $env:TEMP
tar -xzf "$env:TEMP\ethr-did-registry-2.0.0.tgz" -C $env:TEMP
Copy-Item "$env:TEMP\package\contracts\EthereumDIDRegistry.sol" src\EthereumDIDRegistry.sol
cd ..\..; git add packages\contracts; git status --short packages\contracts\lib | Select-Object -First 5   # files, not a single "lib/openzeppelin-contracts" gitlink line
```
(bash: same commands with `/` paths, `rm -rf`, `tar -xzf … -C /tmp`, `cp`.) Decision: OpenZeppelin is **committed outright** under `lib/` (~3 MB) — no submodules anywhere, so Gate 18's clean clone needs no `--recurse-submodules` and no postinstall. `foundry.toml`: `solc = "0.8.30"`, `optimizer = true`, `evm_version = "cancun"`. `remappings.txt`: `@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/`.
Tests: `test_identityOwnerDefaultsToSelf`, `test_changeOwnerEmitsEvent` (`vm.expectEmit`), `test_addDelegateValidity` (`vm.warp` past validity → `validDelegate` false).
**TEST GATE 2**: `forge build` succeeds; `forge test --match-contract EthereumDIDRegistryTest -vv` → `3 passed`; `git ls-files packages/contracts/lib | Measure-Object` counts > 100 files (proves `lib/` is committed as files, not a gitlink).

### Step 3 — `IssuerTrustRegistry.sol` (1 d)
**Files**: `src/IssuerTrustRegistry.sol`, `test/IssuerTrustRegistry.t.sol`.
Tests: `test_registerIssuer_setsActiveAndEmits`, `test_registerIssuer_revertsIfAlreadyRegistered`, `test_registerIssuer_revertsZeroAddress`, `test_allowCredentialType_thenIsTrustedFor`, `test_isTrustedFor_falseForUnknownType`, `test_revokeIssuer_makesIsTrustedForFalse`, `test_reactivateIssuer_restoresTrust_andRevertsIfActive` (revoke → reactivate → `isTrustedFor` true again, emits `IssuerReactivated`; reactivating an active issuer reverts `AlreadyActive`), `test_onlyOwner_revertsForStranger` (`Ownable.OwnableUnauthorizedAccount`), `testFuzz_unknownAddressNeverTrusted(address a)`.
**TEST GATE 3**: `forge test --match-contract IssuerTrustRegistryTest -vv` → `9 passed`; `forge coverage --match-contract IssuerTrustRegistryTest` → 100 % lines for `IssuerTrustRegistry.sol`.

### Step 4 — `StatusListRegistry.sol` + `VaultPointer.sol` (1 d)
**Files**: `src/StatusListRegistry.sol`, `src/VaultPointer.sol`, `test/StatusListRegistry.t.sol`, `test/VaultPointer.t.sol`.
Tests: `test_publish_storesAndEmits`, `test_publish_incrementsVersion`, `test_publish_revertsEmptyCid`, `test_publish_revertsEmptyHash`, `test_get_isolatedPerIssuer` (two `vm.prank`ed issuers), `test_versionOf_zeroBeforeFirstPublish`, `testFuzz_publish_anyListId(uint256 listId)`; `test_setPointer_thenGetPointer`, `test_getPointer_emptyForOtherAddress`, `test_setPointer_revertsTooLarge` (513 B), `test_clearPointer_emitsAndEmpties`.
**TEST GATE 4**: `forge test` (all suites) → ≥ 23 passed, fuzz tests at 256 runs, no failures. Root script `"test:contracts": "forge test --root packages/contracts"` added and `pnpm test:contracts` gives the same result.

### Step 5 — Chain runner, deploy script, viem client, config, self-spawned Anvil for tests (1 d)
**Goal**: `pnpm chain` + `pnpm deploy:local` produce `deployments/anvil.json` at the deterministic addresses; core reads contracts; integration tests need no manual terminal and cannot collide across packages.
**Files**: `scripts/env.mjs`, `scripts/env-init.mjs`, `scripts/build-contracts.mjs`, `scripts/deploy.ts`, `packages/core/src/config.ts`, `packages/core/src/chain/{client,deployments,trustRegistry,statusRegistry,vaultPointer,anvil}.ts`, `packages/core/src/chain/abi/*.json` (generated), `packages/core/src/testing/spawnAnvil.ts`, `packages/core/test/setup/anvil.global.ts`, `packages/core/test/unit/config.test.ts`, `packages/core/test/integration/{chain,trust}.test.ts`, `.env.example`, `data/issuer-metadata.json`.
**Commands**:
```powershell
pnpm add -w viem@2.56.8
pnpm --filter @dcv/core add viem@2.56.8
node scripts/build-contracts.mjs                  # forge build --root packages/contracts + copy out/<C>.sol/<C>.json → core abi/
```
`config.ts`: one exported object with every §11 variable and its default, reading `process.env` in Node and `import.meta.env.VITE_*` in Vite. `client.ts`: `anvilChain = { id: 31337, name: 'anvil', nativeCurrency: {…}, rpcUrls: { default: { http: [rpcUrl] } } }`, `makePublicClient({ rpcUrl })`, `makeWalletClient({ rpcUrl, privateKey })`, `makeTestClient({ rpcUrl })` = `createTestClient({ mode: 'anvil', chain: anvilChain, transport: http(rpcUrl) })`. `anvil.ts`: `setBalance(testClient, address, wei)` → `testClient.setBalance({ address, value })` (typed; no raw `anvil_*` request), `withSnapshot(testClient, fn)` → `const id = await testClient.snapshot(); try { await fn() } finally { await testClient.revert({ id }) }` — **every integration test that mutates chain state runs inside `withSnapshot`** (or in `beforeEach/afterEach`). `trustRegistry.ts`: `isTrustedFor(client, deployments, issuer, type)` plus typed write helpers. `spawnAnvil({ port, pkg })`: `spawn('anvil', ['--port', port, '--chain-id', '31337'])`, wait for RPC, run `deploy.ts` programmatically with `RPC_URL=http://127.0.0.1:<port>` and `DEPLOYMENTS_FILE=deployments/test-<pkg>.json`, return `{ kill, deployments }`; `anvil.global.ts` calls it with `{ port: 8546, pkg: 'core' }` and kills on teardown (issuer 8547, verifier 8548 in Steps 12/14). Root scripts: `"chain": "anvil --chain-id 31337 --port 8545"`, `"deploy:local": "tsx scripts/deploy.ts"` (**not** `deploy` — a pnpm built-in), `"build:contracts": "node scripts/build-contracts.mjs"`, `"env:init": "node scripts/env-init.mjs"` (**not** `setup` — a pnpm built-in).
**TEST GATE 5**: with `pnpm chain` in another terminal, `pnpm deploy:local` prints the four addresses from the §6 table, `issuer.metadataURI === 'http://localhost:4001/metadata.json'`, and writes `deployments/anvil.json`; `cast call 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 "isTrustedFor(address,string)(bool)" 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 UniversityDegreeCredential --rpc-url http://127.0.0.1:8545` → `true`. Then **without** any terminal: `pnpm --filter @dcv/core test:integration` passes `chain.test.ts` (chainId 31337, four addresses match, `deployments/test-core.json` exists) and `trust.test.ts` (`isTrustedFor(acct1,'UniversityDegreeCredential') === true`, stranger → false, `'PassportCredential'` false; inside `withSnapshot`: `allowCredentialType(acct1,'EmployeeIdCredential')` → true, and after the snapshot reverts → false again, proving isolation). `config.test.ts`: every default in the §11 table equals `config.ts`. `pnpm env:init` creates `.env` from `.env.example` and is a no-op when it exists.

### Step 6 — DID module (`did:ethr:anvil`) (1 d)
**Files**: `src/did/{ethr,resolver}.ts`, `test/unit/did.test.ts`, `test/integration/did.test.ts`.
**Commands**: `pnpm --filter @dcv/core add did-resolver@^5.0.1 ethr-did-resolver@14.1.4` — then `pnpm why did-resolver` must show exactly one version.
**TEST GATE 6**: unit: `addressToDid('0xAbC…') === 'did:ethr:anvil:0xAbC…'`, `didToAddress` inverse, rejects `did:web:…` and wrong network. Integration (self-spawned Anvil): `resolver.resolve(addressToDid(acct1))` → `verificationMethod[0].type === 'EcdsaSecp256k1RecoveryMethod2020'`, `blockchainAccountId === 'eip155:31337:0x7099…79C8'`; inside `withSnapshot`, on a **throwaway identity (Anvil account #5)**: after `changeOwner(acct5 → acct6)` via viem `writeContract`, `resolveControllerAddress(did(acct5))` returns acct6 (proves resolution reads the chain) — acct1 (the issuer) is never mutated, so later suites are unaffected.

### Step 7 — Crypto primitives with KAT vectors (1 d)
**Files**: `src/crypto/{es256k,jws,hkdf,secp,mnemonic}.ts`, `test/unit/{hkdf,mnemonic,secp,es256k,jws}.test.ts`.
**Commands**: `pnpm --filter @dcv/core add @noble/hashes@2.4.0 @scure/bip39@2.4.0`
`jws.ts`: `signJws(header, payload, signer): Promise<string>`, `decodeJws(jws): { header, payload, signingInput, signature }`, `verifyJws(jws, verifier): Promise<boolean>`. `hkdf.ts`: `hkdfSha256(ikm: Uint8Array, salt: string | Uint8Array, info: string | Uint8Array, len)` (strings are UTF-8 encoded; raw bytes pass through so the RFC vector's non-UTF-8 salt/info work). `secp.ts`: `secpKeyFromHkdf(seed, info): Hex` (counter retry until `0 < k < n`). `mnemonic.ts`: `generateMnemonic12()`, `seedFromMnemonic(m)`.
**TEST GATE 7**: `hkdf.test.ts` reproduces RFC 5869 Test Case 1 (IKM `0x0b`×22, salt bytes `000102…0c`, info bytes `f0…f9`, L=42 → OKM starts `3cb25f25faacd57a90434f64d0362f2a`) and the string overload equals the byte overload for ASCII inputs; `mnemonic.test.ts`: `"abandon"×11 + "about"` → seed starts `5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1`; `secp.test.ts`: derived key is 32 bytes, `0 < k < n`, deterministic for same info, differs per info; `es256k.test.ts`: sign with key #1 → verifier(acct1) true, verifier(acct2) false, one flipped byte false, signature length 65; `jws.test.ts`: `verifyJws` true, `alg === 'ES256K-R'`, tampered payload segment false.

### Step 8 — VCDM 2.0 credential builder + schema (0.5 d)
**Files**: `src/vc/{types,schema,build}.ts`, `test/unit/schema.test.ts`. `buildDegreeCredential({ issuerDid, issuerName, holderDid, subject, status: { listUrl, index } })` adds `@context`, `id: urn:uuid`, `validFrom = now`, `validUntil = +10y`. (Only the degree template is built; `EmployeeIdCredential` is stretch S10.)
**Commands**: `pnpm --filter @dcv/core add zod@4.6.5`
**TEST GATE 8**: schema accepts the built credential; rejects (a) `@context[0]` = 2018 v1 URL, (b) missing `validFrom`, (c) `statusListIndex: 42` (number), (d) `statusPurpose: 'expired'`, (e) `credentialSubject.id` not `did:ethr:anvil:`; `JSON.parse(JSON.stringify(cred))` deep-equals.

### Step 9 — SD-JWT issue / present / verify + issuance proof (1.5 d)
**Files**: `src/sdjwt/{instance,frames,issue,present,decode}.ts`, `src/offer/proof.ts`, `test/unit/{sdjwt,proof}.test.ts`.
**Commands**: `pnpm --filter @dcv/core add @sd-jwt/core@0.21.0`
`issue.ts`: `issueSdJwtVc({ issuerKey, issuerDid, credential, holderDid, now? }) → string`; `present.ts`: `presentSdJwtVc({ holderKey, sdJwt, disclose: PresentationFrame, kb: { aud, nonce }, now? }) → string`; `decode.ts`: `peekSdJwt(vp) → { header, payload, disclosures, kbJwt?, iss, cnfKid }` (unverified, via `splitSdJwt`/`decodeSdJwt`); `proof.ts`: `signOfferProof({ holderKey, holderDid, issuerDid, nonce })`, `verifyOfferProof(jws, expected)`. Test note: whenever a test passes `now` to issue/present, the library cross-check receives `currentDate: now` (and `skewSeconds: 0`) — otherwise `verify()`'s default `iat`/`exp` validation uses wall-clock time.
**TEST GATE 9** (in-memory, keys #1 issuer / #3 holder): (1) issued header `typ 'vc+sd-jwt'`, `cty 'vc'`, payload `_sd_alg 'sha-256'`, `credentialSubject.name` absent from payload but present in a disclosure, `credentialStatus` in clear; (2) present only `degree.name` with nonce `n1`/aud `a1` → library `verify()` ok, `payload.credentialSubject.degree.name` defined, `birthDate` undefined, KB-JWT present; (3) `keyBindingNonce: 'n2'` rejects; (4) one character changed in a disclosure rejects; (5) KB signed by key #4 rejects; (6) zero disclosures still verifies; (7) KB `iat` 1 h old with `currentDate` matching → library rejects (`keyBindingMaxAgeSeconds`), with `currentDate = iat` → accepts; (8) `verifyOfferProof` accepts the right nonce/kid, rejects a wrong nonce and a kid whose address differs from the recovered one.

### Step 10 — Bitstring Status List (0.5 d)
**Files**: `src/status/{bitstring,credential,check}.ts`, `test/unit/{bitstring,statusCredential}.test.ts`. `Bitstring` (`length = 131072`, `get(i)`, `set(i, bool)`, `toEncodedList()`, `static fromEncodedList(s)`) with `CompressionStream`/`DecompressionStream('gzip')`; `buildStatusListCredential({ issuerDid, listUrl, purpose, encodedList })`, `signStatusListCredential(cred, issuerKey) → jwt (typ 'vc+jwt')`, `readStatusBit(statusJwt, index, purpose) → { revoked }`.
**TEST GATE 10** (deterministic, no either/or): KAT — `Bitstring.fromEncodedList('uH4sIAAAAAAAAA-3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAIC3AYbSVKsAQAAA')` yields exactly 16384 zero bytes; round-trip — `fromEncodedList(toEncodedList(allZero))` yields 16384 zero bytes and `toEncodedList()` starts with `uH4sI` (multibase `u` + gzip magic); `set(42,true)` → `get(42)` true, `get(41)` false, survives encode/decode; `set(131072)` throws; `readStatusBit` → `revoked:true` only for 42 and throws on purpose mismatch. (No byte-equality with the W3C vector: gzip header bytes 4–9 are implementation-defined.)

### Step 11 — Vault: keyring, argon2id wrap, AES-GCM records, IndexedDB store (1.5 d)
**Files**: `src/vault/{kdf,keyring,record,file,store}.ts`, `test/unit/{vault,keyring,store}.test.ts` (test KDF params `t=1, m=8192` for speed; defaults asserted separately).
**Commands**: `pnpm --filter @dcv/core add hash-wasm@4.12.0 idb-keyval@6.3.0` ; `pnpm --filter @dcv/core add -D fake-indexeddb@^6`
`store.ts`: `VaultStore` over `idb-keyval` (`createStore('dcv','vault')`) with `putMeta/getMeta/put/get/list/clear`; it stores only `VaultMeta` and `VaultRecord` rows (ciphertext), never plaintext.
**TEST GATE 11**: `Keyring.create('correct horse')` → `unlock(meta,'correct horse')` works; `unlock(meta,'wrong')` throws `VaultError('BAD_PASSPHRASE')`; default params `{t:3, m:32768, p:1}`; two keyrings with the same passphrase have different salts and `wrappedSeed`; `encryptRecord` → `decryptRecord` round-trips; swapping `ct` between two records throws (AAD); tampering one byte throws; `holderAccount('did:ethr:anvil:0xA').did !== holderAccount('did:ethr:anvil:0xB').did` and both re-derive identically from `fromMnemonic`; `lock()` then `vaultKey()` throws `VaultError('LOCKED')`; `store.test.ts` (fake-indexeddb): after `VaultStore.put(encryptRecord(..., { name: 'Alice Example', … }))`, dumping every raw IndexedDB value (`JSON.stringify` + hex + base64url of every row) contains no substring `Alice` (stolen-device test), and `list()` → `decryptRecord` returns the credential; `VaultFile` export → import → unlock works.

### Step 12 — Issuer service (Hono API + vanilla console) + first `pnpm dev` (2 d)
**Files**: `apps/issuer/package.json` (scripts `dev: tsx watch src/server.ts`, `test`, `typecheck`), `apps/issuer/vitest.config.ts` (`globalSetup` → `spawnAnvil({ port: 8547, pkg: 'issuer' })`), `apps/issuer/src/{server,ledger,issue,offers,statusList,governance,events,privacy}.ts`, `apps/issuer/public/{index.html,console.js,console.css}`, `apps/issuer/test/{issue,revoke,governance,cors}.test.ts`, `scripts/dev.mjs` (first version), `scripts/reset.mjs`, `scripts/stop-issuer.mjs`.
**Commands**: `pnpm --filter @dcv/issuer add hono@4.13.8 @hono/node-server@2.1.1 viem@2.56.8 "@dcv/core@workspace:*"`
Server behaviour: `app.use('*', cors({ origin: [WALLET_URL, 'http://localhost:5174'], allowMethods: ['GET','POST','DELETE','OPTIONS'] }))` from `hono/cors`; on start write `process.pid` to `data/issuer.pid`; on boot call `StatusListRegistry.versionOf(issuer, 1)` and publish v1 (all-zero list) if it is 0 (`ipfsAdd` is an injected dependency — a mock returning a fake `bafkrei…` CID in tests until Step 16); serve `GET /metadata.json` from `data/issuer-metadata.json`.
Routes: `GET /health`, `GET /did`, `GET /config` (deployments), `POST /credentials {type, subject}` → `{ offerId, offerUrl, walletLink }`, `GET /offers/:id` → `{ issuerDid, type, nonce, subjectPreview }`, `POST /offers/:id/claim {proof}` → `{ sdJwt }` (single-use; 410 after; allocates the index, stores the ledger row incl. `subject` and `signedPreview`, does **not** republish), `GET /credentials` (ledger with `subject` redacted: id, type, index, revoked, `holderDidHash`), `GET /credentials/:id/preview` → `signedPreview` (I7), `POST /credentials/:id/revoke`, `POST /credentials/:id/unrevoke` (both republish), `GET /status/:listId` (`Content-Type: application/vc+jwt`), `POST /status/:listId/publish`, governance (`ADMIN_PRIVATE_KEY`): `POST /admin/issuers`, `POST /admin/issuers/:addr/revoke`, `POST /admin/issuers/:addr/reactivate`, `POST /admin/types {issuer, credentialType}`, `DELETE /admin/types {issuer, credentialType}`, `GET /admin/events` (viem `getLogs` from block 0), `POST /admin/reset` (truncate `data/issuer.json`, clear offers/nonces, republish v1 — the console's "Reset demo"), `GET /admin/privacy-scan` (Step 17).
`scripts/dev.mjs` v1: `concurrently([anvil, ipfs.mjs])` → `wait-on tcp:8545 tcp:5001` → `deploy.ts` → `concurrently([issuer dev])`, prefixed logs, **no `--kill-others`** (so killing the issuer in the demo does not tear down the stack). `scripts/ipfs.mjs` stub (full version Step 16) so `pnpm dev` works now: init `./.ipfs` if missing, `ipfs daemon --offline`. `reset.mjs`: clean-only (kill listeners on 8545/5001/8080/4001/4002/5173/5174 via `netstat -ano`/`lsof`, delete `data/issuer.json`, `data/issuer.pid`, `deployments/anvil.json`); never restarts. `stop-issuer.mjs`: read `data/issuer.pid`; `taskkill /PID <pid> /F` on win32, `process.kill(pid)` elsewhere. Root scripts: `"dev": "node scripts/dev.mjs"`, `"ipfs": "node scripts/ipfs.mjs"`, `"reset": "node scripts/reset.mjs"`, `"stop:issuer": "node scripts/stop-issuer.mjs"`.
Manual 3-terminal recipe (until `pnpm dev` covers everything): `pnpm chain` | `pnpm ipfs` | `pnpm deploy:local; if ($?) { pnpm --filter @dcv/issuer dev }`.
**TEST GATE 12** (Vitest, in-process `app.request()`, self-spawned Anvil on :8547, mutating tests inside `withSnapshot`): after server start `StatusListRegistry.get(issuer,1).version === 1`; `POST /credentials` → 201 with `offerUrl`; `POST /offers/:id/claim` with a valid proof → SD-JWT whose payload passes `CredentialV2Schema`, `cnf.kid` equals the proof kid, `statusListIndex` unused before / used after, version still 1; claim with a bad proof → 401; second claim → 410; `GET /credentials` rows contain no `subject`, `GET /credentials/:id/preview` returns `header.typ === 'vc+sd-jwt'` and `sdDigests.length === 6`; `POST /credentials/:id/revoke` → `GET /status/1` decodes with that bit set, `StatusListRegistry.get(issuer,1)` has `contentHash === keccak256(statusJwt)` and `version === 2`; unrevoke → `version === 3`, bit clear; `POST /admin/issuers/:addr/revoke` → `isTrustedFor` false and `GET /admin/events` contains `IssuerRevoked`; `POST /admin/issuers/:addr/reactivate` → true again; `DELETE /admin/types` → `isTrustedFor` false; `cors.test.ts`: `OPTIONS /offers/x/claim` with `Origin: http://localhost:5173` → `Access-Control-Allow-Origin: http://localhost:5173`; `data/issuer.pid` exists while the server runs. Manual: `pnpm dev` boots Anvil + Kubo + issuer; console at `http://localhost:4001` shows the identity page and the `StatusListPublished v1` event; `pnpm stop:issuer` ends only the issuer process.

### Step 13 — Verifier pipeline (core) (1.5 d)
**Files**: `src/verifier/{request,checks,pipeline,report,fetchRecorder}.ts`, `src/testing/issueTestCredential.ts`, `test/integration/verifierPipeline.test.ts`.
```ts
export interface Check { name: CheckName; label: string; ok: boolean; code?: string; detail: string; evidence?: Record<string, unknown> }
export interface VerificationReport { ok: boolean; checks: Check[]; disclosed: Record<string, unknown>; digestsUndisclosed: string[]; outboundUrls: string[]; chainReads: number; issuerContacted: boolean }
export interface NonceStore { issue(id, nonce, ttl); consume(id, nonce): 'ok'|'replay'|'mismatch'; peek(id, nonce): 'ok'|'replay'|'mismatch' }
export async function verifyPresentation(vp: string, req: PresentationRequest, deps: {
  publicClient; resolver; deployments; nonces: NonceStore; fetchStatusList: (issuer: Address, listId: number, fallbackUrl: string) => Promise<{ jwt: string; cid: string; version: number; source: 'ipfs'|'fallback' }>;
  now?: number; dryRun?: boolean; simulateConsumedNonce?: boolean }): Promise<VerificationReport>
```
`fetchRecorder.ts` wraps `globalThis.fetch` for the duration of one verification: every non-RPC URL is appended to `outboundUrls`, `issuerContacted` becomes true if any origin equals `ISSUER_PUBLIC_URL`; JSON-RPC calls to `RPC_URL` are counted in `chainReads` and excluded from `outboundUrls` by definition. The pipeline never short-circuits (a failed check yields `ok:false` and later checks still run on whatever could be decoded). **Nonce semantics**: real run → `nonces.consume`; `dryRun` → `nonces.peek` and the request's own nonce is treated as valid even if already consumed; `simulateConsumedNonce` → `holderBinding` reports `NONCE_REPLAY`. **Test credential**: `issueTestCredential({ anvil, issuerKey, holderKeyring })` lives in core and uses only core primitives (`buildDegreeCredential` + `issueSdJwtVc` + `signStatusListCredential` + a direct `StatusListRegistry.publish` via viem, and an in-memory status-list server for `fetchStatusList`) — core has **no** dependency on `@dcv/issuer`.
**TEST GATE 13** (self-spawned Anvil :8546, each mutating case inside `withSnapshot`): happy path: all 8 `ok`, `issuerContacted === false`, `outboundUrls` contains only the status-list fetch URL (gateway), `chainReads > 0`; dry-run of the same VP after the real run still yields 8/8 ok; negative table, each fault trips **exactly one** row: (a) issuer revoked in registry (snapshot-reverted afterwards) → `issuerTrusted`; (b) credential revoked (publish v2) → `status` (`REVOKED`, evidence `{bit:42, version:2, cid}`); (c) nonce mismatch → `holderBinding` (`NONCE_MISMATCH`); (d) same VP twice, real runs → `holderBinding` (`NONCE_REPLAY`); (d′) `dryRun + simulateConsumedNonce` → `holderBinding` (`NONCE_REPLAY`) only; (e) `aud` swapped → `holderBinding` (`AUD_MISMATCH`); (f) KB `iat` 1 h old (`now` override, and `currentDate: now` on the library cross-check) → `freshness`; (g) `validUntil` past (issue override) → `validity`; (h) status list served with a tampered byte → `status` (`STATUS_HASH_MISMATCH`); (i) tampered disclosure → `disclosures`; (j) `typ: 'vc+jwt'` → `format`.

### Step 14 — Verifier API + web (report card, attack lab) (1.5 d)
**Files**: `apps/verifier-api/package.json` (`@dcv/verifier-api`; scripts `dev: tsx watch src/server.ts`, `test`, `typecheck`), `apps/verifier-api/vitest.config.ts` (`spawnAnvil({ port: 8548, pkg: 'verifier' })`), `apps/verifier-api/src/{server,requests,lab,admin}.ts`, `apps/verifier-api/test/{verify,lab,cors}.test.ts`, `apps/verifier-web/` (Vite app), `apps/verifier-web/vite.config.ts`, `scripts/dev.mjs` (adds verifier-api + verifier-web).
**Commands (PowerShell; bash identical)**:
```powershell
New-Item -ItemType Directory -Force apps\verifier-api\src, apps\verifier-api\test | Out-Null   # write package.json with "name": "@dcv/verifier-api"
pnpm --filter @dcv/verifier-api add hono@4.13.8 @hono/node-server@2.1.1 viem@2.56.8 "@dcv/core@workspace:*"
pnpm create vite apps/verifier-web --template react-ts            # create-vite 9.2.1 → Vite ^8.3.0 / React ^19.3.0; package is named "verifier-web"
# edit apps/verifier-web/package.json: "name": "@dcv/verifier-web", add "@dcv/core": "workspace:*" to dependencies, then:
pnpm install
pnpm --filter @dcv/verifier-web add react@19.3.0 react-dom@19.3.0 qrcode.react@4.2.0 viem@2.56.8
```
`vite.config.ts` (verifier-web): `envDir: fileURLToPath(new URL('../..', import.meta.url))` so the workspace-root `.env` `VITE_*` values are honoured; `server.port: 5174`; the SPA calls `VITE_VERIFIER_API_URL` directly (CORS, no Vite proxy — one mechanism only). API: `app.use('*', cors({ origin: [WALLET_URL, 'http://localhost:5174'], allowMethods: ['GET','POST','OPTIONS'] }))`.
Routes: `POST /requests {credentialType, claims}` → `{ id, nonce, aud, expiresAt, walletLink, url }`; `GET /requests/:id/public` (what the wallet reads); `POST /requests/:id/presentation {vp}` → runs pipeline (real run, consumes nonce), stores VP + report; `GET /requests/:id` → `{ state, report }`; `POST /lab {requestId, attack: 'tamper'|'replay'|'expire'|'audience'}` → `dryRun: true` re-verification of the stored VP with one mutation (tamper = flip a char in disclosure[0]; replay = `simulateConsumedNonce: true`; expire = `now = kb.iat + 3600`; audience = `req.aud = 'http://evil.example'`); `POST /admin/reset` (clears requests, reports, nonces — the web app's "Reset demo"). Web: `RequestBuilder.tsx` (claim checkboxes, QR + "Open in wallet" link), `Report.tsx` (8 rows, plain labels, code chips, `Evidence.tsx` expanders, "What we saw" table, "0 requests to issuer origin · chain reads: N" badge from `issuerContacted`/`chainReads`), `AttackLab.tsx` (four buttons), `ResetButton.tsx`. `dev.mjs` now also starts `verifier-api` and `verifier-web`.
**TEST GATE 14**: `verify.test.ts`: create request → submit valid VP → `state 'verified'`, `report.ok true`; same VP again → 409 `NONCE_REPLAY`. `lab.test.ts`: after a real verified submission, each of the four attacks returns a report with **exactly one** `ok:false` row named `disclosures` / `holderBinding` / `freshness` / `holderBinding` respectively (the non-replay attacks must not also trip `NONCE_REPLAY`). `cors.test.ts`: preflight from `http://localhost:5173` gets the matching `Access-Control-Allow-Origin`. Manual (`pnpm dev`): `http://localhost:5174` "New request" renders a QR, and `curl.exe http://localhost:4002/requests/<id>` (PowerShell; or `Invoke-RestMethod http://localhost:4002/requests/<id>`; bash: `curl`) shows `pending`.

### Step 15 — Wallet web app (2.5 d)
**Files**: `apps/wallet/vite.config.ts` (`envDir` = workspace root, `server.port: 5173`), `apps/wallet/src/state/{vaultStore,keyring,idleLock}.ts` (keyring in a module singleton, never React state or localStorage; `vaultStore.ts` wraps core's `VaultStore`; `idleLock.ts` = idle timer reset on `pointerdown`/`keydown`/`visibilitychange`, `VITE_AUTO_LOCK_SECONDS`), `src/workers/kdf.worker.ts`, pages `Onboard` (12 words shown once, passphrase, progress bar), `Unlock`, `Credentials` (cards + live status badge from chain + gateway, + "Reset demo" button = `indexedDB.deleteDatabase('dcv')` + reload), `CredentialDetail` (claims table, "disclosable" chips), `Accept` (`#/accept?offer=<url>` → pairwise key → proof → claim → local checks: `recoverAddress == didToAddress(iss)`, schema, `isTrustedFor` → store), `Present` (`#/present?request=<url>` → consent defaults to requested claims only → `presentSdJwtVc` → POST → show report), `Backup` (export/import file; IPFS in Step 16), `test/vaultStore.test.ts`, `scripts/dev.mjs` (adds wallet).
**Commands (PowerShell; bash identical)**:
```powershell
pnpm create vite apps/wallet --template react-ts                  # package is named "wallet"
# edit apps/wallet/package.json: "name": "@dcv/wallet", add "@dcv/core": "workspace:*" to dependencies, then:
pnpm install
pnpm --filter @dcv/wallet add viem@2.56.8 idb-keyval@6.3.0 qrcode.react@4.2.0 hash-wasm@4.12.0
pnpm --filter @dcv/wallet add -D fake-indexeddb@^6 happy-dom@^20
```
**TEST GATE 15**: `vaultStore.test.ts` (happy-dom + fake-indexeddb): onboard → lock → unlock restores the default DID; wrong passphrase leaves the store locked; `acceptOffer` with a credential whose `cnf.kid` is not one of our keys is rejected with `NotMyCredential`; **pairwise assertion**: after accepting an offer from `issuerDid`, `sha256(holderAccount(issuerDid).did) === ledgerRow.holderDidHash` and `sha256(holderAccount('default').did) !== ledgerRow.holderDidHash`; `VITE_AUTO_LOCK_SECONDS=1` + fake timers: locked after 1 s idle, not locked when a `pointerdown` event fires at 0.5 s. Manual (`pnpm dev`, everything running): onboard Alice → issuer console "Issue" → click "Open in wallet" → credential appears with issuer name and green badge → verifier "New request (degree.name)" → "Open in wallet" → consent shows only `degree.name` ticked → submit → verifier shows 8 green rows and "What we saw" contains only `degree.name` + non-SD fields; issuer console `GET /credentials` row's `holderDidHash` equals `sha256` of the pairwise DID shown in the wallet's credential detail ("bound to did:ethr:anvil:0x…") and not of the default DID shown on the identity card.

### Step 16 — IPFS (Kubo) integration, backup & restore, VaultPointer (1.5 d)
*(If behind schedule: implement only `ipfs.mjs` + `kubo.ts` + real status-list publishing; move backup/restore to stretch. The demo still works with file export/import.)*
**Files**: `scripts/ipfs.mjs` (full), `src/ipfs/{kubo,backupStore}.ts` (`addBytes(bytes) → kubo.add(bytes, { cidVersion: 1, rawLeaves: true, pin: true })`, `addString`, `catBytes`, `gatewayUrl`; `BackupStore.put()` → `assertOpaque` → `addBytes`), `src/privacy/opaque.ts`, issuer `statusList.ts` switched from mock to Kubo (`deploy.ts` optionally switches `metadataURI` to `ipfs://<cid>` when `IPFS_API_URL` answers — off by default; Gate 5 keeps asserting the HTTP form), wallet `Backup.tsx` ("Backup to IPFS" → CID + pointer tx hash; funds the pointer key through `makeTestClient().setBalance`) and `Restore.tsx` (mnemonic + new passphrase → pointer → cat → import), `test/unit/opaque.test.ts`, `test/integration/ipfs.test.ts`.
**Commands**: `pnpm --filter @dcv/core add kubo-rpc-client@7.1.0` ; `pnpm ipfs` (bash identical). `ipfs.mjs`: verifies `tools/kubo_v0.43.1_windows-amd64.zip` against the vendored sha512 when present (informational); `IPFS_PATH=./.ipfs`; `ipfs init` if `.ipfs/config` missing; `ipfs config --json Import.CidVersion 1` (belt and braces with the client option); API CORS `ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin ["http://localhost:5173","http://localhost:5174"]` and `…Allow-Methods ["PUT","POST","GET"]`; **gateway CORS** set explicitly, `ipfs config --json Gateway.HTTPHeaders.Access-Control-Allow-Origin ["*"]` and `…Allow-Methods ["GET"]` (the wallet's status badge fetches `:8080/ipfs/<cid>` from the browser); then `ipfs daemon --offline`.
**TEST GATE 16**: `opaque.test.ts`: JSON bytes, a raw SD-JWT, and `did:…` text throw `PlaintextRejected`; AES-GCM output passes. `ipfs.test.ts` (skips with a clear message if `:5001` is down — `spawnAnvil` never starts Kubo, so run `pnpm ipfs` first): `catBytes(await addBytes(b))` byte-equal, CID starts with `bafkrei` (CIDv1 + raw leaf); `BackupStore.put(jsonBytes)` throws; `GET http://127.0.0.1:8080/ipfs/<cid>` answers with `Access-Control-Allow-Origin: *`. Step-12 issuer tests re-run **without** the mock (`IPFS_API_URL` reachable required; the suite skips the real-Kubo cases with a message otherwise): `GET http://127.0.0.1:8080/ipfs/<cid>` returns the status JWT and `keccak256` equals the on-chain `contentHash`; the anchored CID starts with `bafkrei`. Manual: Backup → `ipfs cat <cid> --length 80` (PowerShell; bash may use `| head -c 80`) is binary → DevTools "Clear site data" → Restore with the 12 words → credential is back → verifier: New request → present → 8 green.

### Step 17 — Scripted end-to-end + privacy scan (1 d)
**Files**: `scripts/e2e.ts`, `scripts/privacy-scan.ts`, `src/privacy/scan.ts`, issuer `src/privacy.ts` (term builder) + `GET /admin/privacy-scan`, console "Privacy scan" button, `test/integration/privacyScan.test.ts`.
`e2e.ts` (against live `pnpm dev`, no browser): deploy check → onboard a test keyring → create offer → claim with proof → present subset → round 1 `ok` → revoke → new request → round 2 `ok=false`, only `status` red → un-revoke → new request → round 3 `ok` → **kill the issuer process** (same helper as `scripts/stop-issuer.mjs`: PID from `data/issuer.pid`) → new request → round 4 `ok` with `issuerContacted === false` and no `:4001` URL in `outboundUrls` → run the privacy scan via the ledger file directly (issuer is down) → `terms > 0`, `hits === 0`. Root scripts: `"e2e": "tsx scripts/e2e.ts"`, `"privacy-scan": "tsx scripts/privacy-scan.ts"`.
**TEST GATE 17**: `pnpm e2e` exits 0 in < 60 s and prints a 4-round × 8-check table plus `privacy scan: 0 hits over N blocks / M logs / K blobs for T terms` with `T > 0` asserted **before** the 0-hits assertion; `privacyScan.test.ts` seeds a fake PII string into a plaintext IPFS add and asserts the scanner **finds** it (proves the scanner works), asserts `scanForPii` with an empty term list throws `NoTerms`, then asserts 0 hits on a real flow.

### Step 18 — One-command boot, Playwright, README, dry run (1 d)
**Files**: `scripts/dev.mjs` (final: all six processes, health banner with the issuer PID), per-app "Reset demo" buttons wired (wallet H8, verifier V7, issuer console `POST /admin/reset`), `e2e/playwright.config.ts` (`webServer: { command: 'pnpm dev', url: 'http://localhost:5174', reuseExistingServer: true }`), `e2e/tests/flow.spec.ts` (three browser contexts: issuer console, wallet, verifier; asserts 8 green rows, the verifier DOM contains `Bachelor of Science in Computer Science` and none of `Alice Example`, `2003-04-12`, `ASU-2026-00042`, `First Class Honours`), `attacks.spec.ts` (four buttons → one red row each), `restore.spec.ts` (`indexedDB.deleteDatabase('dcv')` + reload + restore → card back), `README.md`, `docs/demo-script.md` (§10).
**Commands**: `pnpm add -Dw @playwright/test@1.63.0` ; `pnpm exec playwright install chromium` ; root script `"pw": "playwright test -c e2e/playwright.config.ts"`.
**TEST GATE 18**: from a clean clone on a machine that followed only Step 0 (PowerShell 5.1): `git clone <repo> dcv; cd dcv; pnpm install; if ($?) { pnpm build:contracts }; if ($?) { pnpm dev }` (bash: `git clone <repo> dcv && cd dcv && pnpm install && pnpm build:contracts && pnpm dev`) is up in < 45 s with no submodule step; `pnpm reset; if ($?) { pnpm e2e }` green **twice in a row**; `pnpm pw` → 3 specs pass; `pnpm test:contracts`, `pnpm test`, `pnpm typecheck` green on the final commit; two timed rehearsals of §10 each ≤ 10 minutes.

---

## 9. End-to-end flow

```
Admin(#0)   Issuer :4001 (#1)          Wallet :5173 (Alice)               Verifier :4002/:5174        Anvil 31337          Kubo
  |               |                          |                                  |                        |                  |
  |-- deploy DIDRegistry, TrustRegistry, StatusRegistry, VaultPointer ---------------------------------->|                  |
  |-- registerIssuer(#1), allowCredentialType("UniversityDegreeCredential") ---------------------------->|                  |
  |               | boot: versionOf(#1,1)==0 → sign all-zero status-list VC -- ipfs add ------------------------------------->| cid1
  |               |-- publish(1, cid1, keccak256(jwt), "revocation")  → v1 ----------------------------->|                  |
  |               |                   [Onboard] 12 words -> seed -> HKDF tree; argon2id-wrapped seed     |                  |
  |               |<-- POST /credentials {type, subject} (console)              |                        |                  |
  |               |-- offer link/QR -------->|                                  |                        |                  |
  |               |<-- GET /offers/:id ------| derive pairwise key for issuerDid|                        |                  |
  |               |<-- POST claim {proof JWS over nonce, kid=pairwise#controller}                        |                  |
  |               | verify proof; build VCDM2 JSON; idx=42; cnf.kid=pairwise; SD-JWT issue (ES256K-R); no republish        |
  |               |-- {sdJwt} -------------->| recover==iss addr, schema, isTrustedFor -----(read)------->|                  |
  |               |                          | AES-GCM store (IndexedDB)         |                        |                  |
  |               |                          |<-- request link {nonce, aud, claims} (QR/link) ----------|                  |
  |               |                          | consent: degree.name only; KB-JWT(iat,aud,nonce,sd_hash) |                  |
  |               |                          |-- POST /requests/:id/presentation {vp} ----------------->|                  |
  |               |                          |                                  |-- resolve iss + cnf.kid (DID docs) ---->|  |
  |               |                          |                                  |-- isTrustedFor(iss, type) ------------->|  |
  |               |                          |                                  |-- get(iss, 1) -> {cid1, hash, v1} ---->|  |
  |               |                          |                                  |-- GET /ipfs/<cid1> ----------------------------->|
  |               |                          |                                  | hash ok, sig ok, purpose ok, bit[42]=0  |  |
  |               |                          |<-- report 8/8 green; saw {degree.name}; 0 calls to :4001 |                  |
  |               |                          |                                  | attack lab: dry-run ×4, one red row each|  |
  |               |<-- POST /credentials/:id/revoke                             |                        |                  |
  |               | bit[42]=1, re-sign, ipfs add -> cid2, publish(1, cid2, hash2) → v2 ---------------->|                  |
  |               |                          |<-- NEW request -----------------|                        |                  |
  |               |                          |-- present ---------------------->| bit[42]=1 -> status RED, 7/8 green      |  |
  |               | (pnpm stop:issuer)       |<-- NEW request -----------------|                        |                  |
  |               |                          |-- present ---------------------->| still verifies (chain + IPFS only)      |  |
  |               |                          |-- backup: AES-GCM bundle -> ipfs add; setPointer(enc(cid)) from pointer key ->|  |
  |               |                          |   wipe browser -> mnemonic -> getPointer -> cat -> decrypt -> restored       |  |
```

---

## 10. Demo script (~9 minutes)

**Before walking on stage**: demo `.env` (from `pnpm env:init`) sets `NONCE_TTL_SECONDS=600` and `VITE_AUTO_LOCK_SECONDS=900` (idle-based, so the wallet never locks mid-demo); `pnpm reset` then `pnpm dev` (one terminal, prefixed logs; ~30 s). One browser window (dedicated profile, zoom 125 %), three tabs: Issuer console `localhost:4001`, Wallet `localhost:5173`, Verifier `localhost:5174`. One spare terminal.

| Time | On screen | Talking points |
|---|---|---|
| 0:00–0:40 | README diagram (§4) + threat-model slide | "Verifying a diploma today = email the registrar. We'll issue, store, present and revoke a degree on this laptop with no server we don't own: W3C VC 2.0, SD-JWT (RFC 9901), Bitstring Status List, did:ethr, a local chain and local IPFS. Zero API keys." |
| 0:40–1:20 | Issuer console → **Governance** tab: issuer row "trusted for UniversityDegreeCredential", live event feed showing `IssuerRegistered`, `CredentialTypeAllowed`, `StatusListPublished v1` | "The root of trust is a governance contract, not a phone call. The university's DID document is just an Ethereum address — that's why we sign with a recoverable signature. The empty revocation list was already published and anchored at boot." |
| 1:20–2:30 | Wallet: **Create identity** → 12 words → passphrase → argon2id progress bar (~0.5 s) → DID card | "Alice generates her own identity; nobody gave her a key. Everything derives from these 12 words with HKDF. Vault key never leaves the browser." DevTools → IndexedDB: only `wrappedSeed` ciphertext. |
| 2:30–3:45 | Issuer tab: form pre-filled (Alice, BSc CS, First Class) → **Issue** → offer QR + "Open in wallet" → click → wallet shows "Verified issuer signature · schema · trusted on-chain" → card appears. Back on the issuer: "What I signed" card (`typ vc+sd-jwt`, `_sd` digests, index 42) | "The wallet derived a *pairwise* DID for this university — another issuer sees a different one. The signed payload holds salted hashes, not names. Issuance only took one random bit index in the list that is already on IPFS with its hash on-chain — nothing about Alice touched the chain." |
| 3:45–5:15 | Verifier: **New request** (UniversityDegreeCredential, require `degree.name`) → "Open in wallet" → consent screen: only `degree.name` ticked → **Present** → verifier: 8 green rows; expand "Not revoked" (bit 42, version 1, CID); "What we saw" = issuer, type, degree.name; badge "0 requests to the issuer · chain reads: N" | "Acme learns the degree, not the name, birth date or grade. The nonce and audience in the key-binding JWT make this presentation useless anywhere else. Every check came from the chain and IPFS." |
| 5:15–6:15 | Verifier **Attack lab**: Tamper → Replay → Expire → Wrong audience. While talking, pre-create two more requests (same claims) in the builder for the next two beats | Each click: exactly one row turns red with its code. "Tampering breaks the digests; replay is caught by the single-use nonce; freshness is a 5-minute window; audience binding stops relaying to another verifier." |
| 6:15–7:15 | Issuer tab: **Revoke** → event feed `StatusListPublished v2` → wallet badge turns red → verifier: open pre-created request #2 → "Open in wallet" → **Present** → 7 green, `status` red (`REVOKED`, bit 42, v2, new CID) → **Un-revoke** (optional; v3) | "Revocation is one bit among 131,072 — the chain learned nothing about Alice. Tamper-evident: hash anchored on-chain. Each presentation needs a fresh request: nonces are single-use." |
| 7:15–7:50 | Spare terminal: `pnpm stop:issuer` (kills :4001 by PID file; the rest of `pnpm dev` keeps running) → verifier: open pre-created request #3 → "Open in wallet" → **Present** → 8 green | "'Without contacting the issuer' is literal — the university is offline." |
| 7:50–8:40 | Wallet: **Backup** (CID + pointer tx) → DevTools "Clear site data" → reload → **Restore** with the 12 words → card is back | "Self-sovereign: the seed is the vault. The pointer was written from a pseudonymous address; the blob on IPFS is ciphertext — `ipfs cat` shows garbage." |
| 8:40–9:15 | Spare terminal: `pnpm privacy-scan` (issuer is down; the CLI reads `data/issuer.json` directly) → "0 hits over N blocks, M logs, K blobs for 8 terms" (Alice's name, birth date, student id, degree fields, DIDs); then `forge test` / `pnpm e2e` summary | "An executable privacy invariant — the scanner is fed the real PII from the issuer's own ledger and finds none of it in public storage. Test gate at every step. Honest limit: SD-JWT presentations are linkable by colluding verifiers — BBS+ is the production successor." |

**Reset between runs**: `Ctrl+C` the dev terminal → `pnpm reset; if ($?) { pnpm dev }` (bash: `pnpm reset && pnpm dev`; ~30 s: fresh Anvil, same addresses, re-seeded issuer, empty ledger, status list v1 republished, Kubo untouched) → click "Reset demo" in **each** tab (wallet: deletes IndexedDB and reloads; verifier: `POST /admin/reset`; issuer console: `POST /admin/reset`) or DevTools → Clear site data for the wallet. Fallback: pre-captured `pnpm e2e` output and a 60-s screen recording of the happy path.

---

## 11. External services & .env

**No external service and no sign-up is required.** `.env` is optional: every variable has a default baked into `scripts/env.mjs` / `packages/core/src/config.ts` (unit-tested against this table in Gate 5); `pnpm env:init` copies `.env.example` → `.env` for people who want to edit ports (the script is named `env:init` because `setup` and `deploy` are pnpm built-in commands and would be shadowed). Contract addresses are **not** env vars — apps read `deployments/anvil.json`. Both Vite apps set `envDir` to the workspace root, so the single root `.env` is the only place `VITE_*` values are read from.

| Variable | Read by | Class | Default |
|---|---|---|---|
| `RPC_URL` | deploy, issuer, verifier, e2e | has-default | `http://127.0.0.1:8545` |
| `CHAIN_ID` | deploy, core | has-default | `31337` |
| `ADMIN_PRIVATE_KEY` | deploy, issuer governance routes | has-default (Anvil #0; **copy from the `anvil` banner**) | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| `ISSUER_PRIVATE_KEY` | issuer | has-default (Anvil #1) | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| `ISSUER_NAME` | deploy, issuer | has-default | `Anvil State University` |
| `ISSUER_PORT` / `ISSUER_PUBLIC_URL` | issuer, verifier (`issuerContacted` origin check), deploy (`metadataURI`) | has-default | `4001` / `http://localhost:4001` |
| `VERIFIER_PORT` / `VERIFIER_PUBLIC_URL` (= KB `aud`) | verifier | has-default | `4002` / `http://localhost:4002` |
| `WALLET_URL` | issuer, verifier (build "Open in wallet" links; CORS allowlist) | has-default | `http://localhost:5173` |
| `IPFS_API_URL` / `IPFS_GATEWAY_URL` | issuer, verifier, e2e | has-default | `http://127.0.0.1:5001` / `http://127.0.0.1:8080` |
| `IPFS_PATH` | `scripts/ipfs.mjs` | has-default | `./.ipfs` |
| `STATUS_LIST_SIZE` | issuer | has-default | `131072` |
| `NONCE_TTL_SECONDS` / `KB_MAX_AGE_SECONDS` | verifier | has-default (demo `.env`: `600` / `300`) | `300` / `300` |
| `DEPLOYMENTS_FILE` | all (test helper sets `deployments/test-<pkg>.json`) | auto-generated by `pnpm deploy:local` | `deployments/anvil.json` |
| `VITE_RPC_URL` | wallet, verifier web | has-default | `http://127.0.0.1:8545` |
| `VITE_ISSUER_URL` / `VITE_VERIFIER_API_URL` | wallet, verifier web | has-default | `http://localhost:4001` / `http://localhost:4002` |
| `VITE_IPFS_API_URL` / `VITE_IPFS_GATEWAY_URL` | wallet (backup/restore, status badge) | has-default | `http://127.0.0.1:5001` / `http://127.0.0.1:8080` |
| `VITE_AUTO_LOCK_SECONDS` | wallet (idle-based) | has-default (demo `.env`: `900`) | `300` |
| `PLAYWRIGHT_BASE_URL` | e2e | has-default | `http://localhost:5174` |

**Needs registration: none.** The only things that would ever need a sign-up are explicitly unused stretch options (a public-testnet RPC key, a remote pinning token, a WalletConnect project id for mobile wallets) — no code path reads them. The private keys above are Anvil's public, well-known test keys and are safe only because the chain is local (README banner).

---

## 12. Risks, gotchas & stretch goals

**Toolchain / Windows**
- `foundryup` needs Git Bash (getfoundry.sh says PowerShell/cmd are unsupported); the current installer (`foundryup-init` 2.0.0) does **not** edit `~/.bashrc` — it only prints the `export PATH` line, so run `export PATH="$HOME/.foundry/bin:$PATH" && foundryup` yourself. The installed binaries are native and work from PowerShell once `%USERPROFILE%\.foundry\bin` is on PATH (Gate 0 lists that folder). The official `win32_amd64` zip always works. `forge init/install` flags drift between minors — `forge init --help` is the source of truth.
- Windows PowerShell 5.1 has no `&&`; every command in this plan is written as `a; if ($?) { b }`, `curl.exe`/`Invoke-RestMethod` instead of the `curl` alias, and `ipfs cat --length` instead of `head`. PowerShell 7 is optional.
- `pnpm deploy` and `pnpm setup` are pnpm built-ins that shadow package scripts on every released pnpm (through 12.5.1; the fix in pnpm PR #14998 landed after) — the plan uses `deploy:local` and `env:init`. pnpm 12 blocks dependency build scripts by default; if a warning about ignored builds appears, run `pnpm approve-builds` (Vite 8's rolldown and hash-wasm ship prebuilt binaries/WASM, so normally nothing needs approval). `packageManager: pnpm@12.5.1` keeps the package manager pinned like everything else.
- OpenZeppelin is committed as plain files under `packages/contracts/lib/` (nested `.git` removed after `forge install --no-git`), and `EthereumDIDRegistry.sol` comes from the `ethr-did-registry@2.0.0` npm tarball — no submodules, no unpinned branch, so a clean clone builds with `pnpm install; pnpm build:contracts`.
- Deterministic addresses hold only if the four deployments are account #0's first four transactions after Anvil starts; `deploy.ts` asserts this and tells you to restart Anvil otherwise. Anvil is in-memory: every restart wipes contracts and revocations (desired for reset); credentials from a previous run reference the old anchor → re-issue after a reset. Integration tests never share mutated state: each package spawns its own Anvil (ports 8546/8547/8548, `pnpm test` runs packages serially) and every mutating test runs inside `withSnapshot` (`evm_snapshot`/`evm_revert`).
- Kubo: first `ipfs init` takes a few seconds; port `5001`/`8080` collisions show as `address in use` — `ipfs config Addresses.API /ip4/127.0.0.1/tcp/5011` and update `IPFS_API_URL`. API CORS must allow `:5173`/`:5174` and the **gateway** CORS is set explicitly to `*` (both by `ipfs.mjs`) or the wallet backup / status badge fail silently. CIDs are forced to v1 raw-leaf (`bafkrei…`) both by the client option and `Import.CidVersion 1`, so anchors are stable across Kubo versions. Kubo v0.43.1 is the last Shipyard release (maintenance ends 2026-09-30): the release zip's sha512 is vendored in `scripts/ipfs.mjs` and a copy of the zip is kept in the gitignored `tools/` folder so the demo does not depend on GitHub being up; if Kubo ever becomes unavailable, Helia (in-browser IPFS) is the fallback path for the same `add/cat` surface, and the verifier already has the HTTP fallback for status lists, so the demo never hard-depends on it.
- Node 24 exposes `CompressionStream`, `crypto.subtle`, `fetch` globally; never downgrade below 20 (`@types/node@^24` resolves to 24.x; Vitest 5's Node peer range `^22 || >=24` is satisfied). TypeScript `latest` is 7.x (native); stay on `~6.0.3` unless you also upgrade Vite/Vitest plugins.
- `git config core.autocrlf false`: Foundry and shell scripts must be LF.

**Libraries**
- `@sd-jwt/core` is 0.x — pin `0.21.0` exactly. `KbVerifier` is `(data, sig, payload)`; `options.header` overrides `typ`; `verify()` supports `expectedKeyBindingAudience`/`keyBindingMaxAgeSeconds`; the core never fetches anything over HTTP (checked: no `fetch(` and no status-list code in the bundle — `VerifierOptions.disableStatusVerification` is a hook for `@sd-jwt/sd-jwt-vc` only). `verify()` validates `exp`/`nbf`/`iat` by default (`skipJwtClaimValidation`, `currentDate`, `skewSeconds`), so tests that override the pipeline's `now` must pass `currentDate: now` to the library cross-check. Our pipeline uses `splitSdJwt/decodeSdJwt/getClaims` for per-row checks and the library `verify()` only as a cross-check in tests.
- `did-resolver` must be `^5.0.1` (what `ethr-did-resolver@14.1.4` depends on); `pnpm why did-resolver` must show one version. `ethr-did-resolver` pulls ethers v6 (~1 MB): keep it out of the wallet bundle — the wallet only needs `didToAddress` + `recoverAddress`; DID resolution happens in the verifier API. Consequence: the wallet does not honour issuer key rotation (S7).
- viem's `sign()` returns `v` as 27/28 and `recoverAddress` accepts it; keep both ends on viem. `anvil_*` cheat codes go through `createTestClient({ mode: 'anvil' })` (`setBalance`, `snapshot`, `revert`) — `PublicClient.request` is typed against the public RPC schema and fails `pnpm typecheck` on them.
- `create-vite` names a package after its folder; the plan renames to `@dcv/wallet` / `@dcv/verifier-web` before any `pnpm --filter` call, and `apps/verifier-api` / `apps/verifier-web` are siblings so the `apps/*` workspace glob matches both.
- `ES256K-R` is a `did-jwt` convention, not a registered JWA alg; interop with third-party wallets is not a goal.

**Crypto / design**
- argon2id 32 MiB/t=3 via hash-wasm in a Web Worker: ~0.3–0.8 s; the KDF params are stored in `meta`, so lowering `m` for a low-RAM machine is a one-line change that old vaults still unlock with.
- The verifier resolves the holder DID to its *current* controller; a future `changeOwner` would invalidate old credentials (S7 adds block-height-aware verification).
- SD-JWT presentations are linkable across colluding verifiers (same signature, digests, status index — random allocation from a 131k list reduces but does not remove this). Say it out loud; S6/S8 are the fixes.
- The `status` fallback URL (`statusListCredential`) is only used when IPFS is unreachable, and it is inside the signed payload; the anchor lookup key is always the verified `iss` address. The status list is published at boot (v1), so the first verification never sees `STATUS_UNAVAILABLE`; issuance does not republish, so the version only moves on revoke/unrevoke (v2, v3, …).
- Nonce single-use lives in the verifier's memory; a restart forgets consumed nonces (demo-grade, noted). Every presentation needs a fresh request (nonces are single-use and requests expire after `NONCE_TTL_SECONDS`); the demo pre-creates requests and uses a 600 s TTL. The attack lab runs in `dryRun` mode (peek, never consume) so only the Replay button trips `NONCE_REPLAY`.
- Never disclose `birthDate` by default; the consent screen defaults to exactly the requested claims.
- Backup/restore funds the pointer key with `setBalance` — an Anvil cheat code (production: paymaster). Never write anything but AES-GCM ciphertext to `VaultPointer` or IPFS (`assertOpaque` enforces it; the privacy scan proves it). The issuer ledger keeps the entered subject fields server-side (redacted from `GET /credentials`) precisely so the scan has real terms; the DID itself is stored only as a hash.
- The in-app reset is per origin (wallet, verifier, issuer console each have their own button); `BroadcastChannel` is same-origin and cannot span :4001/:5173/:5174.

**Scope / schedule**
- ~22 working days across four weeks (day estimates per step in §8). Heaviest steps: 12, 15, 14. Keep the console vanilla and the React apps unstyled beyond a 40-line CSS file. Step 16 (backup/restore + VaultPointer, 1.5 d) is the first thing to move to stretch if Week 4 slips; Playwright (Step 18) is the second. `pnpm e2e` is the non-negotiable final gate.
- Rehearse with a stopwatch; the revocation, issuer-offline and privacy-scan beats are the payoff. Keep pre-captured `pnpm e2e` output and a 60-s recording as fallback.

**Stretch goals (ranked by value ÷ effort)**: S1 decoys + UX (½ d) → S2 camera QR (½ d) → S9 Shamir kit (½ d) → S10 `EmployeeIdCredential` template (½ d) → S5 suspension list + schema (1 d) → S6 batch unlinkable copies (1 d) → S3 MetaMask second factor via wagmi 3.7 (1–2 d) → S4 OpenID4VP shape (2 d) → S7 issuer key rotation, block-height-aware (3 d) → S8 BBS+ Data Integrity (1–2 wk).

**Sources verified 2026-09-22**: npm registry metadata for every pinned package (`@sd-jwt/core` 0.21.0 typings and bundle inspected: `KbVerifier`, `KBOptions`, `VerifierOptions` incl. `currentDate`/`skewSeconds`/`disableStatusVerification`, exported `decodeSdJwt/getClaims/splitSdJwt`, no `fetch`; `ethr-did-resolver` 14.1.4 → `did-resolver ^5.0.1`, `ethers ^6.16`; `ethr-did-registry` 2.0.0 tarball layout; `@openzeppelin/contracts` 5.6.1; `typescript` 6.0.3 / 7.0.2; `hash-wasm` 4.12.0; `@scure/bip39` 2.4.0; `concurrently` 10.0.5; `wait-on` 9.1.0; `@playwright/test` 1.63.0; `create-vite` 9.2.1; pnpm 12.5.1 dist-tag and built-in command list); Foundry v1.8.3 release assets and `foundryup-init` 2.0.0 installer behaviour; Kubo v0.43.1 release assets, `Import.CidVersion` default and `ipfs cat --length`; getfoundry.sh (Git Bash/WSL requirement); W3C VCDM 2.0 / VC-JOSE-COSE / Bitstring Status List Recommendations (encodedList vector); IETF RFC 9901; RFC 5869 and BIP-39 test vectors.