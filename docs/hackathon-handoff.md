# XRP PayGuard hackathon handoff

> Validation baseline: source commit
> `1c5b668b6d92b17d7a7ecb3a8b3b617a14001ea9`, 2026-08-09. This is a
> testnet/local-simulation handoff, not a verified PayGuard release.

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
- Vercel deployment ID: `dpl_8mqppV8JNwDiTL5CLa36cXiLteUm`
- Deployed source commit: `d2628a38129b03273dca91d66887a4534b2863d4`

The deployment is an artifact-only Vercel CLI upload. The final smoke observed
HTTP 200 for HTML, JavaScript, CSS, the index, and every listed evidence asset.
The index contains ten Coston2 records and one explicit local simulation
record. It does not embed the Vercel deployment record in itself, avoiding a
self-referential identifier that would always be one deployment stale.

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

The following commands completed successfully against the stated baseline or
an explicitly recorded parent source commit:

```sh
pnpm check
pnpm -r test
pnpm -r typecheck
cd apps/fcc-extension && go test ./...
forge test --root packages/contracts
pnpm fcc:container:smoke
pnpm fcc:image:repro
```

Observed results on the current baseline:

- 134 workspace package tests passed: bindings 2, protocol 35, relay 10,
  integrations 74, web 9, and SDK examples 4.
- All workspace TypeScript typechecks and all Go packages passed.
- Forge passed 31 tests, including 256 fuzz runs and a 128-run/8192-call
  conservation invariant with zero reverts.
- The three-machine smoke passed distinct identity/signer binding, container
  hardening, loopback-only ingress, malformed-ingress failure, restart identity
  rotation, and cleanup. Its reviewed record is
  [`../evidence/simulation/fcc-local-three-machine-2026-08-09.json`](../evidence/simulation/fcc-local-three-machine-2026-08-09.json).
- Two no-cache `linux/amd64` FCC image builds produced the same local image
  digest `sha256:8b62d0b9eb714d433b0b2eb6de7640462893f87f0d2994af36b8d76888c848bd`.
- Secret scan inspected 317 current files and 128 revisions with zero history
  findings. Privacy scan inspected 38 browser/relay/FCC source and build files
  and found no browser persistence API.
- Production Chrome verified desktop `1440x1200`, mobile `390x844`, Enter-key
  landing activation, the Auditor evidence mirror, and the explicit simulation
  count.
- A final HTTPS read returned 200 for the application and evidence index; the
  index still reported ten Coston2 entries, one simulation entry,
  `staticShellOnly: true`, and `testnetOnly: true`.
- `PLAN.md` records 91 checked and 27 open checkboxes (77.1%). The open items
  are not silently promoted: organizer/account actions, user research/pilots,
  live FCC infrastructure/lifecycle, remaining canonical live drills, external
  review, release, and mainnet work remain outstanding.

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

## Pushed scope commits

- `7475fcc` — keyboard activation for application actions.
- `c12a1ac` — keyboard-verified web deployment record.
- `40c37c4` — simulated FCC hackathon scope freeze.
- `9bfec62` — explicit local FCC simulation evidence and Auditor count.
- `7b3f157` — safe manifest metadata derivation and Coston2 classification.
- `f2150c9` — simulated evidence mirror deployment record.
- `d2628a3` — removal of self-referential web evidence.
- `203b56e` — final non-recursive evidence deployment record.
- `51b94e2` — fail-closed XRPL-wallet/Flare-dApp SDK examples and guide.
- `13430f7` — post-hackathon audit, liveness, pricing, support, and mainnet plan.
- `1c5b668` — evidence-backed submission draft and Interoperable Asset Products
  target decision.

The remote `main` branch must match the local HEAD before recording any later
demo or submission claim.
