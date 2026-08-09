# XRP PayGuard hackathon handoff

> Current web/tooling validation run: `2026-08-09T08:04:26Z` against source
> commit `b20e7ac9ca707b084f8edadda865e6e922c76600` plus the demo recorder and
> documentation in this subsequent commit. The unchanged full Go/Forge baseline
> was last rerun at `2026-08-09T07:37:29Z`. This is a testnet/simulation
> handoff, not a verified PayGuard release.

## Delivery boundary

The hackathon build uses solution 3:

- a credential-free local three-machine simulated FCC stack;
- real public Coston2 contract, funding, FDC, FAssets, and foundation-sender
  observations where their individual evidence files say they passed;
- one real Coston2 contract lifecycle driven by three ephemeral in-memory
  simulated signers and classified as `SIMULATED_TEE_ONCHAIN`;
- a Vercel public product shell and reviewed static evidence mirror.

Stable FCC servers, authenticated indexer access, hardware TEE attestation,
production machine registration, hosted relay/proxy, live policy custody and
evaluation, and a complete release manifest are post-hackathon work. The local
simulation must never be presented as hardware-backed confidentiality or a
live authorization result.

## Public demo

- Application: <https://xrp-payguard.vercel.app/>
- Evidence index: <https://xrp-payguard.vercel.app/evidence/index.json>
- Demo video: local validated MP4 exists under ignored `evidence/local/`; public
  upload remains owner-only and no public video URL is claimed.
- Vercel deployment ID: `dpl_HVwCXyFLKxh1aNv9R9S4W37j1BH5`
- Deployed source commit: `00d04ed4b141930b21e17ea262fd9772b031ad7e`

The deployment is an artifact-only Vercel CLI upload containing 18 static
files. The recorded smoke observed HTTP 200 for HTML, favicon, JavaScript, CSS,
the index, and every listed evidence asset. The index contains 11 records under
`evidence/coston2/` and two explicit simulation records. The Auditor reports 12
chain-114 artifacts because the on-chain simulated lifecycle belongs to both
the Coston2 and simulation categories; those counts are not additive. The index
does not embed the Vercel deployment record in itself, avoiding a
self-referential identifier that would always be one deployment stale.

### Suggested walkthrough

1. Open `/#landing` and explain: private policy is the target boundary; amount,
   recipient, timing, and settlement remain public.
2. Activate **Open app** with Enter to show the keyboard path and dependency
   states that remain unavailable rather than mocked.
3. Open **Policy Studio**, choose a template, and run **Validate & compute**.
   Explain that the commitment is computed from in-memory local input and is
   not a custody receipt or activation.
4. Open **Auditor**. Show `12 Coston2 artifacts`, `2 local simulation artifacts`,
   and the link to the public index while the live audit provider remains
   unavailable.
5. Open the simulation record and point out the false live-gate assertions:
   no hardware TEE, stable origins, authenticated indexer, or registered
   production machines.
6. If a terminal demo is appropriate, run `pnpm fcc:container:smoke`; do not
   display `.env.local`, wallet material, machine internals, or raw signatures.

## Validation actually run

The following commands completed successfully against the stated source
baseline with the repository-pinned toolchain:

```sh
export PATH="$PWD/.local/toolchains/bin:$PATH"
pnpm check
pnpm -r typecheck
pnpm -r test
cd apps/fcc-extension && go test ./...
forge test --root packages/contracts
```

Observed results on the current baseline:

- The toolchain gate resolved Node `24.19.0`, pnpm `10.33.0`, Go `1.25.12`,
  Foundry `1.7.1`, and Solidity `0.8.25` requirements.
- 141 workspace package tests passed: bindings 2, protocol 35, relay 13,
  integrations 74, web 13, and SDK examples 4. The top-level gate also passed
  the separate public-web evidence, three demo-recorder tests, and
  deployment/release/FCC tooling suites.
- All workspace TypeScript typechecks and all Go packages passed.
- Forge passed 31 tests, including 256 fuzz runs and a 128-run/8192-call
  conservation invariant with zero reverts.
- Secret scan inspected 326 current files and 141 revisions with zero history
  findings on the earlier baseline. The current run inspected 334 files and
  146 revisions with zero history findings. Privacy scan inspected 40
  browser/relay/FCC source and build files and found no browser persistence API;
  the Coston2 evidence gate retained 11 testnet-only records, while the public
  web validator separately accepted two explicitly limited simulation records.
- The release check returned `planned` because no verified PayGuard Coston2
  release manifest exists; this is the expected fail-closed outcome.

The following operational facts have separate evidence records. The container,
image-reproducibility, and browser observations were not rerun in the current
source-validation command set. The on-chain lifecycle was executed immediately
before that validation and then independently re-read through the public RPC:

- The three-machine container smoke passed distinct identity/signer binding,
  container hardening, loopback-only ingress, malformed-ingress failure,
  restart identity rotation, and cleanup. Its reviewed record is
  [`../evidence/simulation/fcc-local-three-machine-2026-08-09.json`](../evidence/simulation/fcc-local-three-machine-2026-08-09.json).
- Two no-cache `linux/amd64` FCC image builds produced the same local image
  digest `sha256:8b62d0b9eb714d433b0b2eb6de7640462893f87f0d2994af36b8d76888c848bd`.
- The guarded solution-3 on-chain run produced 14 unique successful Coston2
  transactions across blocks `33811935`–`33811981`. A separate credential-free
  RPC read reverified all receipts, three PayGuard-local machine entries,
  revoked policy state, executed allow request, denied cap request, and final
  vault accounting of `1,000,000` deposited, `990,000` available, and `10,000`
  spent. The record remains non-FCC simulation evidence.
- Production Chrome verified the expanded eight-section/three-SVG-mascot
  landing at desktop `1440x1200` and mobile `390x844`, reduced motion, Enter-key
  activation, zero storage entries, no HTTP/console errors, and no horizontal
  overflow. Lighthouse 13.0.1 scored both Landing and Overview at 98
  performance and 100 accessibility, best practices, and SEO, with zero
  recorded contrast failures.
- The fixed-origin demo recorder produced a 74-second, 592-frame, 1440×900 H.264
  MP4 with a silent AAC track and burned captions. `ffprobe` verified the media,
  six sampled scenes and focused Auditor/lifecycle frames were reviewed, and
  the SHA-256 is
  `5c4a69f6de285a8a06e49188f00de9204f3c6e25dd4d4f6f90df47e775081d39`.
  It excludes Policy Studio/private inputs and remains ignored until owner
  review/upload.

A fresh HTTPS and Chrome read of deployment
`dpl_HVwCXyFLKxh1aNv9R9S4W37j1BH5` returned 200 for the application, its
favicon/JavaScript/CSS, the index, and all 13 evidence assets. Desktop and
mobile rendering, Enter-key activation, the 13/12/2 Auditor counts, zero
browser storage, zero HTTP/console errors, and no horizontal overflow passed.
The index retained `staticShellOnly: true` and `testnetOnly: true`. `PLAN.md`
records 96 checked and 26 open checkboxes (78.7%). The open items are not
silently promoted:
organizer/account actions, user research/pilots, live FCC
infrastructure/lifecycle, remaining canonical live drills, external review,
release, and mainnet work remain outstanding.

## Verified facts versus limitations

| Area | Current evidence | Claim boundary |
| --- | --- | --- |
| Contracts | Three PayGuard contracts and vault wiring deployed and runtime/constructor checked on Coston2 | Does not prove FCC authorization |
| XRP funding | One PayGuard-owned XRPL Testnet → FDC → Smart Account/direct-mint → vault accounting observation | Does not prove a recurring private-policy payment |
| FAssets exits | Public amount and destination-tag redemption observations | Canonical PayGuard consumption/default recovery remain limited as recorded |
| FCC foundation | Sender/extension binding exists and local `PING_V1` vectors pass | No registered production machine or signed live FCC result |
| FCC policy path | Three-machine local simulation, deterministic threshold/replay tests, and one 14-transaction Coston2 simulated-signer lifecycle pass | No hardware TEE confidentiality, official FCC registration, stable HTTPS origins, authenticated indexer, or live custody |
| Web | Vercel shell, responsive/keyboard smoke, and public evidence mirror pass | Wallet, relay, policy provider, and live audit remain unavailable |
| Release | Release validators and fail-closed checks pass | No verified release manifest exists |
| SDK | Compile-tested XRPL-wallet and Flare-dApp preview examples plus integration guide | Package remains private; no live writer or release domain is exposed |
| Competition | Public deadline, prize/track direction, package, and existing-project policy were refreshed from DoraHacks | Enabled final form, owner eligibility, bounty selection, submission receipt, and FCC grant remain owner/organizer-only |
| Provenance | Retrospective commit-linked new/adapted/third-party/reference ledger is published | It was not committed before implementation and is not presented as contemporaneous prior-work evidence |

## Representative pushed scope commits

- `1c5b668` — evidence-backed Interoperable Asset Products submission draft.
- `51b94e2` — fail-closed XRPL-wallet/Flare-dApp examples and guide.
- `40c37c4` — simulated FCC hackathon scope freeze.
- `9bfec62` — explicit local FCC simulation evidence and Auditor count.
- `7b3f157` — safe manifest metadata derivation and Coston2 classification.
- `203b56e` — final non-recursive evidence deployment record.
- `13430f7` — post-hackathon audit, liveness, pricing, support, and mainnet plan.
- `4e589a0` — credential-free historical funding checkpoint audit.
- `6467104` — funding-resume evidence deployment record.
- `6cc99c2` — expanded landing content, motion, and SVG guardians.
- `a6681c6` — enriched landing deployment record.
- `d1066c7` — landing brand accessible-name correction.
- `5e15726` — canonical muted-text contrast correction.
- `de47283` — current application contrast/deployment audit record.
- `1a9a6a1` — refreshed public competition requirements.
- `4a82eb6` — retrospective new-work and provenance ledger.
- `40986ec` — guarded solution-3 Coston2 simulated-policy lifecycle runner.
- `b0cc48b` — canonical recurring schedule correction for that runner.
- `00d04ed` — sanitized 14-transaction lifecycle evidence and claim boundary.

This list is a handoff-oriented index, not the complete implementation history;
the remote Git history is authoritative.

The remote `main` branch must match the local HEAD before recording any later
demo or submission claim.
