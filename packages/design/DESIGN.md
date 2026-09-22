# DCV visual identity — "security print, made digital"

**Subject.** Three surfaces of one system: a university registrar's office (issuer), a student's document wallet (holder) and an employer's verification desk (verifier). The audience is a demo room — judges, professors, the presenter. The design's job is to make abstract machinery (SD-JWT, DIDs, status lists) legible through the vernacular of physical identity documents.

**Direction.** Passports, ID-1 cards, diplomas and banknotes: guilloché line-work, duotone security inks, a machine-readable zone, a seal — set in a contemporary grotesque instead of diploma serifs, on cool bond paper instead of cream.

## Tokens

Color

| name | hex | role |
|---|---|---|
| Bond | `#F2F5F8` | the page (security paper) |
| Intaglio | `#122A47` | document ink: text, rules |
| Steel / Rose | `#5B7FA6` / `#B36B7C` | the two guilloché inks — lines only, never text |
| Registrar | `#7A1F33` | the university (issuer actions, seal) |
| Passport | `#1E4D8C` | the holder (wallet actions, card ink) |
| Inspection | `#1D6B45` | verifier "accepted"; failures use correction red `#B3261E` |

Type — one family, **Bricolage Grotesque** (variable width 75–100, weight 200–800, optical size), self-hosted:
- display: width 80, weight 600, tracking −0.01em, leading 1.02 — verdicts, titles, the degree on the card
- body: width 100, weight 400, leading 1.5, ≤ 72 characters
- labels: width 90, weight 500, 13px, sentence case

**B612 Mono** (aviation instrument face) only inside machine-readable zones: DIDs, CIDs, hashes, the MRZ. Fixed width is functional there; nowhere else.

Scale: 13 / 16 / 20 / 25 / 31 / 39 / 49 / 61 (base 16, ratio 1.25).

## Layout

Wallet — one centred column (max 640px). Hero: the credential card at ID-1 proportion (85.6 : 54) with a faint guilloché rosette, the university seal, the degree in condensed display, and a two-line MRZ with `<` fill. Everything else is text on paper separated by rules — no boxes.

```
┌ Wallet ─────────────────────────── Alice · lock ┐
│                                                  │
│  ┌──────────────── ID-1 card ────────────────┐   │
│  │ Anvil State University            (seal)  │   │
│  │ Bachelor of Science in                    │   │
│  │ Computer Science                          │   │
│  │ awarded 30 June 2026     not revoked      │   │
│  │ ANVIL<STATE<UNIVERSITY<<<<<<<<<<<<<<<<<<< │   │
│  │ DID<ETHR<ANVIL<0X7BDC…<<<<<<<<<<<<<<<<<<< │   │
│  └───────────────────────────────────────────┘   │
│  Share · Details · Back up                       │
└──────────────────────────────────────────────────┘
```

Verifier — two columns on desktop (request 2/5, result 3/5), stacked on mobile. The verdict word ("Accepted" / "Rejected") in condensed display with the count; the eight checks as a ruled ledger; undisclosed claims drawn as hatched "sealed" bars.

Issuer — the registrar's desk: seal + name in the header, two plain underlined tabs, the issuance form as a document form, the register as a ruled ledger table.

Alignment: left throughout; numbers right-aligned in tables.

## Principles

1. One bold element per surface — wallet: the card; verifier: the verdict and the sealed bars; issuer: the seal and the ledger. Everything around it is quiet.
2. Structure encodes information: rules separate ledger rows, the MRZ marks machine data, the seal marks authority, hatching marks what stayed hidden.
3. Motion only answers an action: the card is dealt in when a credential is accepted; the eight rows fill in one after another after a presentation. `prefers-reduced-motion` turns both off.
4. Plain, sentence-case copy. Buttons name what happens: "Create offer", "Accept credential", "Share 1 claim".

## Reviewed against the generic defaults

- First instinct was cream paper + a serif + a clay accent (the "diploma" look) — rejected for cool bond paper, a grotesque and document inks.
- The previous UI was the SaaS-card kit: identical rounded cards, grey shadows, `·`-joined meta strings, an all-caps type label, monospace on every small label. All removed; only the credential is a card.
- Numbered check rows were considered and dropped: the eight checks are a checklist, not a sequence.
- No hover transitions on cards, no fade-and-slide on sections, no arrows on buttons.
