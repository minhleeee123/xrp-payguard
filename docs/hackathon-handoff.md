# XRP PayGuard hackathon handoff

> Current production deployment/browser audit: `2026-08-09T09:21:09Z` against
> artifact source commit `3147d26fefa8fdeb9a475782820065c1121fa160` plus
> audit implementation commit `6d4dca1942d5d2500b01bcc043e471db00f48718`
> and the deployment-audit evidence and documentation in this subsequent
> commit. The full workspace, Go, and Forge baseline was rerun at
> `2026-08-09T09:23:35Z`. This is a
> testnet/simulation handoff, not a verified PayGuard release.

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
- Vercel deployment ID: `dpl_5T18msAVRVXgzSZiWmkgKLUieEs9`
- Deployed source commit: `3147d26fefa8fdeb9a475782820065c1121fa160`

The deployment is an artifact-only Vercel CLI upload containing 20 static
files. The recorded smoke observed HTTP 200 for HTML, favicon, JavaScript, CSS,
the index, and every listed evidence asset. The index contains 13 records under
`evidence/coston2/` and two explicit simulation records. The Auditor reports 14
chain-114 artifacts because the on-chain simulated lifecycle belongs to both
the Coston2 and simulation categories; those counts are not additive. The index
does not embed the Vercel deployment record in itself, avoiding a
self-referential identifier that would always be one deployment stale.

A later repository-only audit independently fetched that production index and
all 15 listed JSON assets, required HTTP 200 plus JSON content types, reran the
forbidden-field and explicit-simulation checks, and matched every body
byte-for-byte to its reviewed local source. Its own record is excluded from the
hosted index by design.

### Suggested walkthrough

1. Open `/#landing` and explain: private policy is the target boundary; amount,
   recipient, timing, and settlement remain public.
2. Activate **Open app** with Enter to show the keyboard path and dependency
   states that remain unavailable rather than mocked.
3. Open **Policy Studio**, choose a template, and run **Validate & compute**.
   Explain that the commitment is computed from in-memory local input and is
   not a custody receipt or activation.
4. Open **Auditor**. Show `14 Coston2 artifacts`, `2 local simulation artifacts`,
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
- 144 workspace package tests passed: bindings 2, protocol 35, relay 13,
  integrations 77, web 13, and SDK examples 4. The top-level gate also passed
  the separate public-web evidence, four deployment-corpus auditor tests,
  three demo-recorder tests, and deployment/release/FCC tooling suites.
- All workspace TypeScript typechecks and all Go packages passed.
- Forge passed 43 tests, including 256 fuzz runs and a 128-run/8192-call
  conservation invariant with zero reverts.
- Secret scan inspected 364 current files and 159 revisions with zero history
  findings. Privacy scan inspected 40
  browser/relay/FCC source and build files and found no browser persistence API;
  the Coston2 evidence gate retained 13 testnet-only records, while the public
  web validator separately accepted two explicitly limited simulation records.
- The release check returned `planned` because no verified PayGuard Coston2
  release manifest exists; this is the expected fail-closed outcome.

The following operational facts have separate evidence records. The container
and image-reproducibility observations were not rerun in the current
source-validation command set; the production browser audit was. The on-chain
lifecycle was executed before validation and independently re-read through the
public RPC:

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
- The guarded live trigger run validated one exact 100-drop XRPL Testnet
  Payment, waited through FDC finality/data availability, verified its proof
  on Coston2, and atomically created one replay-protected `Pending` request.
  It deliberately stopped before evaluation, reserve, or execution and used
  only ephemeral simulated policy custody.
- Production Chrome verified the expanded eight-section/three-SVG-mascot
  landing at desktop `1440x1200` and mobile `390x844`, Enter-key activation,
  zero storage entries, no HTTP/console errors, and no horizontal overflow.
  The unchanged compiled CSS retains the earlier reduced-motion verification.
  Lighthouse 13.0.1 scored both Landing and Overview at 100
  performance and 100 accessibility, best practices, and SEO, with zero
  recorded contrast failures.
- The fixed-origin demo recorder produced a 74-second, 592-frame, 1440×900 H.264
  MP4 with a silent AAC track and burned captions. `ffprobe` verified the media,
  and the current SHA-256 is
  `1a8b09c4c11376a96075582c47ac8193760fe989477a44984ff04ebb630dd157`.
  It excludes Policy Studio/private inputs and remains ignored until owner
  review/upload.

A fresh HTTPS and Chrome read of deployment
`dpl_5T18msAVRVXgzSZiWmkgKLUieEs9` returned 200 for the application, its
favicon/JavaScript/CSS, the index, and all 15 evidence assets. Desktop and
mobile rendering, Enter-key activation, the 15/14/2 Auditor counts, zero
browser storage, zero HTTP/console errors, and no horizontal overflow passed.
The index retained `staticShellOnly: true` and `testnetOnly: true`. `PLAN.md`
records 101 checked and 24 open checkboxes (80.8%). The open items are not
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
| Web | Vercel shell, responsive/keyboard smoke, public evidence mirror, and byte-exact 15-asset deployment audit pass | Wallet, relay, policy provider, and live audit remain unavailable |
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
- `dd2741e` — fail-closed deployed public-evidence corpus auditor.
- `3147d26` — live XRPL/FDC `Pending` request evidence and claim boundary.
- `6d4dca1` — fail-closed 15/14/2 deployed-corpus audit baseline.

This list is a handoff-oriented index, not the complete implementation history;
the remote Git history is authoritative.

The remote `main` branch must match the local HEAD before recording any later
demo or submission claim.
