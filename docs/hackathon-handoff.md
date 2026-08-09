# XRP PayGuard hackathon handoff

> Validation run: `2026-08-09T07:10:05Z` against source commit
> `4a82eb6d4d50572389cfe35a0322f98868364808`. This record is a subsequent
> documentation-only commit. This is a testnet/local-simulation handoff, not a
> verified PayGuard release.

## Delivery boundary

The hackathon build uses solution 3:

- a credential-free local three-machine simulated FCC stack;
- real public Coston2 contract, funding, FDC, FAssets, and foundation-sender
  observations where their individual evidence files say they passed;
- a Vercel public product shell and reviewed static evidence mirror.

Stable FCC servers, authenticated indexer access, hardware TEE attestation,
production machine registration, hosted relay/proxy, live policy custody and
evaluation, and a complete release manifest are post-hackathon work. The local
simulation must never be presented as hardware-backed confidentiality or a
live authorization result.

## Public demo

- Application: <https://xrp-payguard.vercel.app/>
- Evidence index: <https://xrp-payguard.vercel.app/evidence/index.json>
- Vercel deployment ID: `dpl_CwbYf5W1PxjPTNw4pdnptGMjqbna`
- Deployed source commit: `5e157263f280e226401d90bd0983358839b2fdb5`

The deployment is an artifact-only Vercel CLI upload containing 17 static
files. The recorded smoke observed HTTP 200 for HTML, favicon, JavaScript, CSS,
the index, and every listed evidence asset. The index contains 11 Coston2
records and one explicit local simulation record. It does not embed the Vercel
deployment record in itself, avoiding a self-referential identifier that would
always be one deployment stale.

### Suggested walkthrough

1. Open `/#landing` and explain: private policy is the target boundary; amount,
   recipient, timing, and settlement remain public.
2. Activate **Open app** with Enter to show the keyboard path and dependency
   states that remain unavailable rather than mocked.
3. Open **Policy Studio**, choose a template, and run **Validate & compute**.
   Explain that the commitment is computed from in-memory local input and is
   not a custody receipt or activation.
4. Open **Auditor**. Show `11 Coston2 artifacts`, `1 local simulation artifact`,
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
  the separate public-web evidence and deployment/release/FCC tooling suites.
- All workspace TypeScript typechecks and all Go packages passed.
- Forge passed 31 tests, including 256 fuzz runs and a 128-run/8192-call
  conservation invariant with zero reverts.
- Secret scan inspected 326 current files and 141 revisions with zero history
  findings. Privacy scan inspected 40 browser/relay/FCC source and build files,
  found no browser persistence API, and the evidence gate accepted 11
  testnet-only Coston2 files without upgrading them into a release.
- The release check returned `planned` because no verified PayGuard Coston2
  release manifest exists; this is the expected fail-closed outcome.

The following are previously executed, separately recorded operational facts;
they were not rerun in the `2026-08-09T07:10:05Z` source-validation command set:

- The three-machine container smoke passed distinct identity/signer binding,
  container hardening, loopback-only ingress, malformed-ingress failure,
  restart identity rotation, and cleanup. Its reviewed record is
  [`../evidence/simulation/fcc-local-three-machine-2026-08-09.json`](../evidence/simulation/fcc-local-three-machine-2026-08-09.json).
- Two no-cache `linux/amd64` FCC image builds produced the same local image
  digest `sha256:8b62d0b9eb714d433b0b2eb6de7640462893f87f0d2994af36b8d76888c848bd`.
- Production Chrome verified the expanded eight-section/three-SVG-mascot
  landing at desktop `1440x1200` and mobile `390x844`, reduced motion, Enter-key
  activation, zero storage entries, no HTTP/console errors, and no horizontal
  overflow. Lighthouse 13.0.1 scored both Landing and Overview at 98
  performance and 100 accessibility, best practices, and SEO, with zero
  recorded contrast failures.

A fresh HTTPS read during the current validation returned 200 for the
application and evidence index; the index reported 12 entries and retained
`staticShellOnly: true` and `testnetOnly: true`. `PLAN.md` records 94 checked
and 26 open checkboxes (78.3%). The open items are not silently promoted:
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
| FCC policy path | Three-machine local simulation and deterministic threshold/replay tests pass | No hardware TEE confidentiality, stable HTTPS origins, or live custody |
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

This list is a handoff-oriented index, not the complete implementation history;
the remote Git history is authoritative.

The remote `main` branch must match the local HEAD before recording any later
demo or submission claim.
