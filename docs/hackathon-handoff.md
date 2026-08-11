# XRP PayGuard hackathon handoff

> Interactive demo baseline validated before the V2 preparation work:
> `d5f81f341843bf9ad71113065d2597ebc36c1f3d`. The later V2 candidate and
> documentation work does not alter or upgrade the deployed demo evidence.
> The production web/API artifact is pinned to source commit
> `da66c74b1c4f4fc118f5cc268e169b2d5ee2d324`; its interactive lifecycle and
> browser evidence was recorded in `9305976`.
> The later live simulated FCC evidence is bound to source commit
> `60fd9af72015ef69b44fb87f05fea2224d240700`; its evidence and documentation
> updates are in `7cd8acd` and `bd4337a`. The full workspace, Go, Forge,
> security, privacy, evidence, release, and build baseline was rerun on
> 2026-08-11. This remains a testnet/simulation handoff, not a verified PayGuard
> release.

## Delivery boundary

The hackathon build uses solution 3:

- a credential-free local three-machine simulated FCC stack;
- real public Coston2 contract, funding, FDC, FAssets, and foundation-sender
  observations where their individual evidence files say they passed;
- one real Coston2 contract lifecycle driven by three ephemeral in-memory
  simulated signers and classified as `SIMULATED_TEE_ONCHAIN`;
- a separate Coston2 demo registry/vault/router connected to three stateless
  simulated actors on Vercel; and
- an interactive Vercel dApp plus reviewed static evidence mirror.

After the web artifact was frozen, three stable Railway origins, authenticated
indexer access, registered status-2 `SIMULATED_TEE` machines, signed `PING_V1`,
all-three custody, two-of-three evaluation, C→D replacement, and executor-pause
recovery passed separately on Coston2. Those facts are repository evidence and
are not retroactively part of the deployed Vercel demo. Hardware TEE
attestation, V2 release, hosted release relay/web integration, remaining
dependency outages, and a complete release remain open. No simulation path may
be presented as hardware-backed confidentiality or mainnet production.

## Public demo

- Application: <https://xrp-payguard.vercel.app/>
- Evidence index: <https://xrp-payguard.vercel.app/evidence/index.json>
- Demo video: local validated MP4 exists under ignored `evidence/local/`; public
  upload remains owner-only and no public video URL is claimed.
- Vercel deployment ID: `dpl_GMecUxEknhpUc6TXF5rGukUN7JUZ`
- Deployed source commit: `da66c74b1c4f4fc118f5cc268e169b2d5ee2d324`

The deployment was built and uploaded through Vercel CLI. It serves the static
Vite application, a 16-entry reviewed evidence index, configuration API, and
three actor routes. Actor responses are no-store JSON and the API rejects any
client-supplied decision. The repository-only Vercel lifecycle record is not
embedded in the hosted index, avoiding a self-referential deployment identifier.

A repository-only audit independently fetched the earlier production index and
all 15 then-listed JSON assets, required HTTP 200 plus JSON content types,
reran the forbidden-field and explicit-simulation checks, and matched every body
byte-for-byte to its reviewed local source. Its own record is excluded from the
hosted index by design.

### Suggested walkthrough

1. Open `/#landing` and explain: private policy is the target boundary; amount,
   recipient, timing, and settlement remain public.
2. Choose **Inspect Coston2 demo**. The wallet-free recorded path shows three
   visually distinct machines, ALLOW, cap denial, governance, and conservation.
3. For the interactive path, use only a disposable Coston2 wallet with faucet
   C2FLR/FTestXRP. Approve and deposit `1` FTestXRP into the isolated demo vault.
4. In **Policy Studio**, select **Use isolated demo domain**, review the private
   `0.1` per-action / `0.15` daily test policy, validate it, collect three
   simulated receipts, and register it.
5. Create a `0.1` request, call all three actors, submit two matching `ALLOW`
   results, and execute. Repeat `0.1` to demonstrate canonical
   `DENY · CAP_EXCEEDED`, then stop/resume/revoke.
6. Point out the permanent web boundary labels: one Vercel operator, no
   hardware TEE, serverless actors that are separate from registered A/B/D, and
   no verified release.

## Validation actually run

The following commands completed successfully against the stated source
baseline with the repository-pinned toolchain:

```sh
pnpm check
pnpm -r typecheck
pnpm -r test
cd apps/fcc-extension && go test ./...
forge test --root packages/contracts
```

Observed results on the current baseline:

- The toolchain gate resolved Node `24.19.0`, pnpm `10.33.0`, Go `1.25.12`,
  Foundry `1.7.1`, and Solidity `0.8.25` requirements.
- 197 workspace package tests passed: bindings 2, protocol 50, relay 13,
  demo protocol 7, integrations 83, demo API 4, web 34, and SDK examples 4.
  Three web-live cases are gated out of the ordinary unit run; the full
  production-origin Coston2 lifecycle gate passed separately. The top-level gate also passed
  the separate public-web evidence, four deployment-corpus auditor tests,
  three demo-recorder tests, and deployment/release/FCC tooling suites.
- All workspace TypeScript typechecks and all Go packages passed.
- Forge passed 53 tests, including seven V2 official-manager/adversarial cases,
  256 fuzz runs, and a 128-run/8192-call conservation invariant with zero
  reverts.
- The final documentation review secret scan inspected all current tracked
  files and 227 revisions with zero history findings. Privacy scan inspected 51
  browser/relay/FCC source and build files and found no browser persistence API.
  The evidence gate accepted 18 sanitized testnet-only records; the frozen
  hosted evidence mirror remains an older, separately audited deployment.
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
- Registered Railway machines A/B/D under extension `66037` returned manager
  status `2`, exact proxy/TEE identities, three custody receipts, three matching
  ALLOW results, and three matching `CAP_EXCEEDED` results. Two exact results
  authorized V1 execution; denial moved no funds. Machine C was made
  unavailable, D completed fresh supported registration/production, and only a
  newly frozen A/B/D policy used D. During a measured 17.093-second complete
  executor pause across blocks `33907478`–`33907487`, the request remained
  `Pending` and vault accounting stayed unchanged before successful resume.
  The sanitized record is
  [`../evidence/coston2/fcc-live-replacement-lifecycle.json`](../evidence/coston2/fcc-live-replacement-lifecycle.json).
- The guarded solution-3 on-chain run produced 14 unique successful Coston2
  transactions across blocks `33811935`–`33811981`. A separate credential-free
  RPC read reverified all receipts, three PayGuard-local machine entries,
  revoked policy state, executed allow request, denied cap request, and final
  vault accounting of `1,000,000` deposited, `990,000` available, and `10,000`
  spent. The record remains non-FCC simulation evidence.
- The isolated Vercel/Coston2 run completed in 133.29 seconds: three custody
  receipts, policy registration, two matching `ALLOW` results and execution,
  two matching `CAP_EXCEEDED` results, stop/resume/revoke, and vault
  conservation. Its public-safe record is
  [`../evidence/web/vercel-interactive-demo-2026-08-10.json`](../evidence/web/vercel-interactive-demo-2026-08-10.json).
- The guarded live trigger run validated one exact 100-drop XRPL Testnet
  Payment, waited through FDC finality/data availability, verified its proof
  on Coston2, and atomically created one replay-protected `Pending` request.
  It deliberately stopped before evaluation, reserve, or execution and used
  only ephemeral simulated policy custody.
- Production Chrome verified the expanded eight-section/three-SVG-mascot
  landing at desktop `1440x1200` and mobile `390x844`, Enter-key activation,
  zero storage entries, no HTTP/console errors, and no horizontal overflow.
  The three guardians now have distinct custody/witness/checkpoint silhouettes;
  the reduced-motion CSS gate reran against the deployed source.
  Lighthouse 13.4.1 scored both Landing and Overview at 99 performance and 100
  accessibility, best practices, and SEO, with zero recorded contrast failures.
- The fixed-origin demo recorder produced a 74-second, 592-frame, 1440×900 H.264
  MP4 with a silent AAC track and burned captions. `ffprobe` verified the media,
  and the current SHA-256 is
  `1a8b09c4c11376a96075582c47ac8193760fe989477a44984ff04ebb630dd157`.
  It excludes Policy Studio/private inputs and remains ignored until owner
  review/upload.

A fresh HTTPS and Chrome read of deployment
`dpl_GMecUxEknhpUc6TXF5rGukUN7JUZ` returned 200 for the application and demo
configuration, found 16 hosted evidence assets, and observed HTTP 400 when a
client attempted to supply `decision: ALLOW`. Landing, Overview, Demo lifecycle,
and Policy Studio at 1440×1100 had zero browser storage, HTTP/console errors, or
horizontal overflow. The hackathon headline is **102 of 104 pre-hackathon gates
(98.1%)**. The two open items are owner/account confirmation and real user
validation. Explicit post-hackathon roadmap rows are tracked separately and are
not included in that count.

## Remaining-gate audit

`PLAN.md` retains 18 unchecked full-roadmap rows: two pre-submission items and
16 post-hackathon items. They require external, user, uncontrolled-protocol,
hardware, audit, or release evidence that the repository cannot manufacture
through another local unit test. A post-hackathon row is not a pre-submission
technical blocker:

| Timing | Dependency | Open evidence required |
| --- | --- | --- |
| Before submission — owner-only | Organizer/account | Enabled final form, owner eligibility, bounty selection, public video URL, submission URL/receipt |
| Before submission — validation target | Users | 15 interviews/usability sessions; retain the explicit zero-session disclosure until they occur |
| Post-hackathon | Remaining FCC operations | Hardware-backed independent operators; hosted release relay/web; proxy, RPC, FDC, FTSO, and indexer outage drills. Stable simulated origins/indexer, `PING`, custody, threshold lifecycle, C→D replacement, one-machine loss, and full executor pause/resume already pass separately. |
| Post-hackathon | Uncontrolled protocol conditions | A real `DirectMintingDelayed` resume and official partial/default FAssets recovery with canonical PayGuard consumption |
| Post-hackathon | Independent assurance | External contract/TEE review, exact-candidate remediation, and production security audit |
| Post-hackathon | Verified release | Complete release manifest/bindings, runtime/wiring/machine/key/signer mapping, and live recurring/deny/stop/recovery/redemption journeys |
| Post-hackathon | Pilots | Personal and treasury testnet pilots, measurements, and real feedback |
| Post-hackathon | Production/mainnet | Fresh mainnet resolution/canary, multi-operator FCC design, managed monitoring, bounded-value FXRP pilot, and post-pilot primitive review |

The local Web2Json boundary added at `897b54b` does not close any of those live
gates. It has no configured production source, live FDC request/proof, private
policy evaluation, or canonical on-chain Web2 consumer.

## Verified facts versus limitations

| Area | Current evidence | Claim boundary |
| --- | --- | --- |
| Contracts | Three PayGuard contracts and vault wiring deployed and runtime/constructor checked on Coston2 | Does not prove FCC authorization |
| XRP funding | One PayGuard-owned XRPL Testnet → FDC → Smart Account/direct-mint → vault accounting observation | Does not prove a recurring private-policy payment |
| FAssets exits | Public amount and destination-tag redemption observations | Canonical PayGuard consumption/default recovery remain limited as recorded |
| Web2Json | Local source-commitment allowlist, exact jq/tuple-ABI/MIC/response binding, source-asserted freshness, replay, and fail-closed verifier tests | No production source, live proof, source-truth guarantee, private evaluation, or on-chain consumer |
| FCC foundation | Sender/extension binding, status-2 registered simulated machines, and exact live `PING_V1` TEE/proxy signatures pass | No hardware attestation or V2 release |
| FCC policy path | A/B/D stable origins, authenticated indexer, all-three live simulated custody, two-of-three ALLOW/DENY, conservation, replacement, and executor recovery pass | V1 administrator mapping, `SIMULATED_TEE`, no hosted-web integration, remaining dependency outages, and no verified release |
| Web | Interactive Vercel dApp, three simulated actor APIs, separate Coston2 demo contracts, responsive/keyboard smoke, and 16-asset evidence mirror pass | Actors share one operator and are not production FCC machines; production relay/release remains unavailable |
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
- `7360cd2` — canonical private FDC policy descriptor/snapshot enforcement.
- `f6d570a` — distinct guardian identities, motion, and design alignment.
- `fc92b6a` — current Vercel guardian browser/Lighthouse/deployment audit.
- `897b54b` — local fail-closed Web2Json source/transform/schema boundary.
- `177f5a6` — isolated interactive simulated-FCC architecture boundary.
- `5532108` — three fail-closed serverless actor API routes.
- `62007b8` — separate Coston2 demo namespace and sanitized deployment evidence.
- `1287b80` — interactive wallet policy/ALLOW/DENY/governance lifecycle UI.
- `6623165` — gated deployed full-lifecycle test.
- `da66c74` — bounded canonical Coston2 history scans for public RPC limits.
- `9305976` — deployed interactive lifecycle and laptop browser evidence.
- `d5f81f3` — direct fail-closed HTTP-boundary tests for the demo API.
- `7f0563d` — live threshold lifecycle runner.
- `e03a204` — sanitized live A/B/C threshold lifecycle evidence.
- `c2626a2` — supported C→D replacement lifecycle mode.
- `7d89b76` — live C→D replacement evidence.
- `60fd9af` — measured full executor pause/recovery drill.
- `7cd8acd` — sanitized executor-recovery evidence.
- `bd4337a` — current FCC recovery documentation boundary.

This list is a handoff-oriented index, not the complete implementation history;
the remote Git history is authoritative.

The remote `main` branch must match the local HEAD before recording any later
demo or submission claim.
