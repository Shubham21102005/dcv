# Decentralized Credentials Vault (DCV)

A local-only, fully free demo of **W3C Verifiable Credentials** with self-sovereign identity:

- a university (**issuer**) signs a degree credential once,
- the student (**holder**) keeps it in a browser vault only she can open and shows an employer exactly the claims it asked for,
- the employer (**verifier**) checks signature, issuer trust, holder binding, freshness and revocation **without ever contacting the university** — from a local blockchain (trust anchors) and a local IPFS node (status lists, encrypted backups).

Standards: W3C VC Data Model 2.0 · SD-JWT (RFC 9901) with Key-Binding JWT · Bitstring Status List · `did:ethr` (ERC-1056) · ES256K-R over secp256k1 · argon2id + AES-256-GCM vault.

No API keys, no sign-ups, nothing leaves your machine. See [PLAN.md](PLAN.md) for the full design.

```
 ISSUER CONSOLE :4001      WALLET :5173 (React)        VERIFIER :5174 (React) + API :4002
 Hono API + vanilla JS     seed → HKDF key tree        8-check report card, attack lab
        │  offer/claim  ────────►│◄──── request/present ────────┘
        ▼                        ▼                             ▼ (read-only)
 Kubo IPFS (offline): status lists (public), vault backups (AES-GCM blobs)
 Anvil chain 31337: EthereumDIDRegistry · IssuerTrustRegistry · StatusListRegistry · VaultPointer
```

## Quick start (Windows 11 / macOS / Linux)

Prerequisites (see PLAN.md Step 0 for the exact install commands): Git, **Node 24**, **pnpm 12**, **Foundry** (`forge`, `anvil`, `cast`), **Kubo** (`ipfs`) on your PATH.

```bash
git clone <this repo> dcv && cd dcv
pnpm install
pnpm build:contracts     # forge build + generate ABI modules
pnpm dev                 # anvil + ipfs → deploy + seed → issuer, verifier-api, verifier-web, wallet
```

Then open, in three tabs: Issuer console <http://localhost:4001> · Wallet <http://localhost:5173> · Verifier <http://localhost:5174>.

The scripted demo (no browser) against the running stack:

```bash
pnpm e2e        # 4 verification rounds incl. revocation and the issuer process killed, then the privacy scan
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | One-command boot of the whole stack (fresh chain every start → deterministic addresses) |
| `pnpm reset` | Kill everything on the demo ports and delete runtime state (ledger, pid file, deployments). Never restarts |
| `pnpm stop:issuer` | Kill only the issuer process — the "university is offline" demo beat |
| `pnpm e2e` | Scripted end-to-end against a live stack (exit 0 = green) |
| `pnpm e2e:full` | Unattended: reset → boot → e2e → tear down |
| `pnpm pw` | Playwright: 3 browser specs (flow, attack lab, wipe & restore) |
| `pnpm privacy-scan` | Grep every Anvil tx/log and IPFS pin for the real PII in `data/issuer.json` |
| `pnpm test` | Vitest for every package (each spawns its own private Anvil) |
| `pnpm test:contracts` | Foundry unit + fuzz tests |
| `pnpm typecheck` | `tsc` for every package + scripts |
| `pnpm chain` / `pnpm ipfs` / `pnpm deploy:local` | The individual pieces of `pnpm dev` |
| `pnpm env:init` | Copy `.env.example` → `.env` (optional: every variable has a default) |

## Repo layout

```
packages/contracts   Foundry: EthereumDIDRegistry (vendored ERC-1056), IssuerTrustRegistry, StatusListRegistry, VaultPointer
packages/core        @dcv/core: crypto, did:ethr, VC schema, SD-JWT, status list, vault, verifier pipeline, privacy scan
apps/issuer          Hono API + vanilla console (offers, claims, revocation, governance, privacy scan)
apps/verifier-api    Hono API: presentation requests, 8-check pipeline, attack lab
apps/verifier-web    Vite/React: request builder, report card, attack lab
apps/wallet          Vite/React: onboarding, encrypted vault, accept/present, backup & restore
e2e                  Playwright specs
scripts              dev/reset/ipfs/deploy/e2e/privacy-scan
```

## How a verification works (the 8 rows)

1. **format** — `vc+sd-jwt`, VCDM 2.0 envelope, requested type
2. **issuerSignature** — ES256K-R recovers to the controller of `iss` (resolved from `EthereumDIDRegistry`)
3. **issuerTrusted** — `IssuerTrustRegistry.isTrustedFor(issuer, type)`
4. **disclosures** — every presented disclosure matches a signed digest; KB-JWT `sd_hash` binds exactly this set
5. **holderBinding** — KB-JWT signed by the key in `cnf.kid`, `credentialSubject.id` matches, nonce single-use, audience is this verifier
6. **freshness** — KB-JWT `iat` within 300 s, request not expired
7. **validity** — `validFrom` / `validUntil`
8. **status** — status list fetched from IPFS by the CID anchored on chain, `keccak256` matches, signed by the issuer, bit clear

Every row is evaluated independently, so the attack lab (tamper / replay / expire / wrong audience) turns exactly one row red.

## Configuration (.env)

**No external service and no registration is required.** Every variable has a default (`packages/core/src/config.ts`, table in PLAN.md §11); `pnpm env:init` creates a `.env` you can edit for ports or timeouts. Contract addresses are generated into `deployments/anvil.json`. The private keys in the defaults are Anvil's public test keys — fine only because the chain is local.

## Tests

- Foundry: 27 tests incl. fuzz (`pnpm test:contracts`)
- `@dcv/core`: unit tests with known-answer vectors (RFC 5869, BIP-39, W3C status list, Kubo CIDs) + integration tests on a self-spawned Anvil (pipeline negative table, privacy scan)
- `@dcv/issuer`, `@dcv/verifier-api`: in-process Hono tests on their own Anvil
- `@dcv/wallet`: state tests with happy-dom + fake-indexeddb
- `pnpm e2e`, `pnpm pw`: live stack

## Troubleshooting

- **Port already in use** → `pnpm reset` (kills listeners on 8545/5001/8080/4001/4002/5173/5174, IPv4 and IPv6).
- **`admin already has nonce N`** on deploy → the chain is not fresh; `pnpm reset` then `pnpm dev`.
- **Wallet says "IPFS API not reachable"** → Kubo is not running (`pnpm dev` starts it; `pnpm ipfs` alone also works).
- **Foundry on Windows** → install via Git Bash (`curl -L https://getfoundry.sh/install | bash`, then `foundryup`) or the release zip; `~/.foundry/bin` must be on PATH. The scripts also look there directly.
- **Kubo** → the scripts look for `ipfs` on PATH and at `C:\tools\kubo\ipfs.exe`.
- The wallet auto-locks after `VITE_AUTO_LOCK_SECONDS` of idle time (default 300; the demo `.env` uses 900).

## Honest limits

SD-JWT presentations are linkable across colluding verifiers (same signature and digests); BBS+ is the production successor. `ES256K-R` is a did-jwt convention, not a registered JWA algorithm. Nonces live in the verifier's memory. The pointer account is funded with an Anvil cheat code (production: paymaster). This is a demo: it has never been deployed and must not be.
