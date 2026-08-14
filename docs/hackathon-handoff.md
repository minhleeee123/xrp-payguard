# XRP PayGuard hackathon handoff

> The current production web artifact is pinned to source commit
> `62f8a9717dc5adedab1302772521707dcb4f18a4` and Vercel deployment
> `dpl_EUQheMMg5snBo5ht7CWAHWPgEYth`. Its delegated V2 FCC UI,
> production bytes, relay freshness gate, and 26-entry evidence corpus were
> checked on 2026-08-13.
> The older V1 interactive lifecycle remains explicitly historical and is not
> silently reassigned to the active V2 deployment. The full workspace, Go,
> Forge, security, privacy, evidence, release, build, production-corpus audit,
> live Coston2 reads, and browser-recorder baseline was rerun on 2026-08-12.
> This remains a
> Coston2 `SIMULATED_TEE` candidate handoff, not a hardware-attested verified
> PayGuard release.

## Delivery boundary

The primary product story is an XRP-native treasury granting an approved vendor
a bounded recurring-payment path without publishing the complete policy or
handing signing keys and approval discretion to an automation operator. The
vendor creates an exact public request, registered FCC machines evaluate the
private policy, and `PayGuardActionRouter` executes only after two matching
request-bound results. Smart Accounts serve the separate XRP-native funding
segment; they are not the policy execution component.

The hackathon build uses solution 3:

- a credential-free local three-machine simulated FCC stack;
- real public Coston2 contract, funding, FDC, FAssets, and foundation-sender
  observations where their individual evidence files say they passed;
- one real Coston2 contract lifecycle driven by three ephemeral in-memory
  simulated signers and classified as `SIMULATED_TEE_ONCHAIN`;
- a separate Coston2 demo registry/vault/router connected to three stateless
  simulated actors on Vercel; and
- an interactive Vercel dApp plus reviewed static evidence mirror; and
- one authenticated Railway relay connected to registered A/B/D machines for
  the active V2 self-service owner lifecycle.

Three stable Railway origins, authenticated indexer access, registered status-2
`SIMULATED_TEE` machines, signed `PING_V1`, all-three custody, two-of-three
evaluation, C→D replacement, and executor-pause recovery pass on Coston2. The
current A identity was replaced and re-promoted on 2026-08-14 after its process
restart; the stale identity was paused, while B/D retained their existing
identities. A fresh all-three custody and multi-owner ALLOW/DENY/governance/
conservation run then passed against the exact replacement set. The current
Vercel app is wired to the hosted V2 simulated-candidate path, and the sanitized
end-to-end relay run is mirrored in public evidence. Hardware TEE
attestation, verified-release promotion,
remaining dependency outages, and a complete release remain open. No simulated
path may be presented as hardware-backed confidentiality or mainnet production.

## Public demo

- Application: <https://xrp-payguard.vercel.app/>
- Evidence index: <https://xrp-payguard.vercel.app/evidence/index.json>
- Demo video: <https://www.youtube.com/watch?v=1J21DoN9PuI> — owner-reviewed
  final 7:02 demonstration with synchronized English narration and captions.
- Submitted BUIDL: <https://dorahacks.io/buidl/47777> — Interoperable Asset
  Products, confirmed by the owner on 2026-08-14.
- Vercel deployment ID: `dpl_EUQheMMg5snBo5ht7CWAHWPgEYth`
- Deployed source commit: `62f8a9717dc5adedab1302772521707dcb4f18a4`
- Railway relay: <https://payguard-live-relay-production.up.railway.app>
- Railway relay deployment ID: `8500d5e0-5f9b-4ff3-a71d-510447d163cf`
  — configuration-only redeploy of the same `b8512de` source/image
- Railway monitor: <https://payguard-monitor-production.up.railway.app>
- Railway monitor deployment ID: `89ff04bb-3bbb-4248-acc0-1f2254c66c81`

The deployment was built and uploaded through Vercel CLI. It serves the static
Vite application and a 26-entry reviewed evidence index. The live FCC
configuration comes from the separate Railway relay; its evaluation route
rejects any non-empty/client-decision body and accepts only the exact on-chain
requester’s short-lived signature. Historical serverless demo actor
routes are not part of this static artifact and therefore fail closed.

The relay origin allowlist also admits exactly `http://localhost:4173` and
`http://127.0.0.1:4173` for the reviewed local Vite workflow. After deployment
`8500d5e0…`, both local origins and the production Vercel origin returned the
ready V2 config with their exact CORS header, while an unlisted HTTPS origin
returned `403 origin unavailable`. This changes browser transport access only;
wallet signatures, exact owner/requester authorization, FCC validation, and
on-chain thresholds remain mandatory.

A repository-only audit independently fetched the current production index and
all 26 listed JSON assets, required HTTP 200 plus JSON content types,
reran the forbidden-field and explicit-simulation checks, and matched every body
byte-for-byte to its reviewed local source. Its own record is excluded from the
hosted index by design.

### Suggested walkthrough

This walkthrough describes the hosted self-service owner build. It remains a
simulated Coston2 candidate and must not be described as hardware-backed or as
a verified release.

1. Open `/#landing` and explain: private policy is the target boundary; amount,
   recipient, timing, and settlement remain public.
2. Open **Demo lifecycle** and inspect the primary wallet-free V2 proof: three
   registered A/B/D machines at manager status `2`, all-three custody,
   two-matching-result ALLOW execution, `CAP_EXCEEDED` DENY, governance,
   conservation, and thirteen Coston2 checkpoints.
3. Follow any public checkpoint to Coston2 Explorer. Then inspect the live
   Railway readiness card and explicit `SIMULATED_TEE` label.
4. Treat wallet A as the treasury owner: prepare its V2 vendor policy in
   **Policy Studio**, designate wallet B as vendor/requester/payee, collect
   three receipts, register and fund it, then share only the public commitment.
   Connect B in **Requests** to create, evaluate, and receive the payment
   without another A signature.
5. Point out that the evaluation body is empty and requester-authenticated; the
   browser cannot supply `ALLOW` or override canonical chain history.
6. Close with the permanent boundary: V2 simulated candidate, self-service
   owner writes, no hardware attestation and no verified release. The V1 sandbox is
   collapsed historical evidence and its actor APIs are intentionally absent.

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
- 238 workspace package tests passed: monitor 3, bindings 2, protocol 50,
  relay 22, demo protocol 7, integrations 83, demo API 4, web 63, and SDK
  examples 4. Three web-live cases are gated out of the ordinary unit run;
  the live-enabled web run passed 65 tests with only the legacy interactive
  actor case skipped. The top-level gate also passed
  the separate public-web evidence, four deployment-corpus auditor tests,
  three demo-recorder tests, and deployment/release/FCC tooling suites.
- All workspace TypeScript typechecks and all Go packages passed.
- Forge passed 57 tests, including eleven V2 official-manager/adversarial cases,
  256 fuzz runs, and a 128-run/8192-call conservation invariant with zero
  reverts.
- The final documentation review secret scan inspected 498 current files and
  291 revisions with zero history findings. Privacy scan inspected 62
  browser/relay/FCC source and build files and found no browser persistence API.
  The current evidence gate accepts 23 sanitized testnet-only Coston2 records.
  The hosted 26-entry corpus is separately byte-audited and includes the
  reviewed Railway FCC evidence, stale-machine pause, and independent-owner
  lifecycle.
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
- Earlier pinned production Chrome verified the expanded
  eight-section/three-SVG-mascot
  landing at desktop `1440x1200` and mobile `390x844`, Enter-key activation,
  zero storage entries, no HTTP/console errors, and no horizontal overflow.
  The three guardians now have distinct custody/witness/checkpoint silhouettes;
  the reduced-motion CSS gate reran against the deployed source.
  That artifact's Lighthouse 13.4.1 run scored both Landing and Overview at 99
  performance and 100 accessibility, best practices, and SEO, with zero
  recorded contrast failures.
- The fixed-origin V2 demo recorder produced a 74-second, 592-frame, 1440×900 H.264
  MP4 with a silent AAC track and burned captions. `ffprobe` verified the media,
  and the current SHA-256 is
  `5f3c36f65b16d702362751787db78f904d047bfc1f1e7466b93c37856dbbad4a`.
  It excludes Policy Studio/private inputs and remains ignored until owner
  review/upload.

A fresh HTTPS read of deployment
`dpl_EUQheMMg5snBo5ht7CWAHWPgEYth` returned 200 for the application and
26-entry evidence index. The public-corpus audit matched every hosted evidence
body byte-for-byte to its reviewed local source. A fresh production Chrome
read also observed `production monitor healthy` and the aggregate `5
dependencies · 0 active alerts` row with no browser credential. The prior full
Coston2 lifecycle and Lighthouse results remain attached to their earlier
pinned artifacts. The hackathon headline is **105 of 105 pre-hackathon gates
(100%)**. On 2026-08-13 the owner confirmed hands-on testing of every
implemented submission-boundary surface and flow, and all passed to the
owner's satisfaction. On 2026-08-14 the owner published the final demo and
confirmed submission of [BUIDL 47777](https://dorahacks.io/buidl/47777) to
Interoperable Asset Products. The completed production-monitoring row was pulled forward and
added to both sides of the count; other post-hackathon roadmap rows remain
excluded.

## Remaining-gate audit

`PLAN.md` retains 16 unchecked full-roadmap rows, all post-hackathon. They
require external, user, uncontrolled-protocol,
hardware, audit, or release evidence that the repository cannot manufacture
through another local unit test. A post-hackathon row is not a pre-submission
technical blocker:

| Timing | Dependency | Open evidence required |
| --- | --- | --- |
| Completed before submission | Organizer/account | Owner confirmed final form/account/bounty selection, published the video, and retained BUIDL 47777 |
| Completed before submission | Owner acceptance | Owner confirmed every implemented submission-boundary surface and flow was tested and passed; this is not independent user validation |
| Post-hackathon | External users | 15 consented interviews/usability sessions; retain the explicit zero-session disclosure until they occur |
| Post-hackathon | Remaining FCC operations | Hardware-backed independent operators; verified-release promotion; proxy, RPC, FDC, FTSO, and indexer outage drills. Hosted simulated V2 relay/web and lifecycle plus V1 replacement/executor recovery already pass. |
| Post-hackathon | Uncontrolled protocol conditions | A real `DirectMintingDelayed` resume and official partial/default FAssets recovery with canonical PayGuard consumption |
| Post-hackathon | Independent assurance | External contract/TEE review, exact-candidate remediation, and production security audit |
| Post-hackathon | Verified release | Complete release manifest/bindings, runtime/wiring/machine/key/signer mapping, and live recurring/deny/stop/recovery/redemption journeys |
| Post-hackathon | Pilots | Personal and treasury testnet pilots, measurements, and real feedback |
| Post-hackathon | Production/mainnet | Fresh mainnet resolution/canary, multi-operator FCC design, bounded-value FXRP pilot, and post-pilot primitive review. Managed monitoring is already live and was pulled into the submission boundary. |

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
| FCC foundation | Sender/extension binding, status-2 registered simulated machines, and exact live `PING_V1` TEE/proxy signatures pass | No hardware attestation or verified release |
| FCC policy path | V2 official-manager binding, A/B/D stable origins, authenticated indexer, all-three live simulated custody, hosted request-ID-only two-of-three ALLOW/DENY, conservation, and owner lifecycle pass; V1 separately records replacement/executor recovery | `SIMULATED_TEE`, remaining V2 dependency outages, and no verified release |
| Web | Interactive Vercel dApp, hosted Railway FCC V2 controls, refreshed desktop navigation, self-service policy ownership, and a reviewed evidence mirror including production-monitor and independent-owner lifecycle evidence | Simulated V2 candidate; historical actor APIs are not in the current static artifact; hardware release remains unavailable |
| Monitoring | Independent Railway monitor, fixed 5-dependency probes, origin-bound public aggregate health, bearer-protected operator routes, bounded retention, fixed alerts, and sanitized evidence pass | Testnet candidate availability only; not an outage drill, SLA, audit, hardware proof, or release promotion |
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
- `3d0de5d` — refreshed desktop interface and navigation.
- `584c26f` — bounded Vercel upload inputs for reproducible deployment.
- `be51006` — historical 21-entry production-corpus deployment audit.
- `a6788a0` — authenticated hosted Railway FCC gateway.
- `914a7bb` — production web controls for the hosted A/B/D lifecycle.
- `a0bb2da` — sanitized hosted relay lifecycle evidence.
- `1d9ad09` — expanded 22-entry public-evidence baseline.
- `2fbea13` — byte-verified 22-entry production-corpus audit.
- `c169f61` — V2 candidate made the primary web experience.
- `ae09e38` — fail-closed V2 proof and deployment-copy tests.
- `ea02ba9` — V2-first production demo recorder.
- `fb626ef` — canonical documentation aligned with the V2 candidate.
- `3a271bd` — retired V1 actor probes removed from production startup.
- `dbd5f9a` — self-service policy ownership for arbitrary connected wallets.
- `119c97e` — independent-owner custody, registration, execution, and governance evidence.
- `7f7dfc7` — delegated requester/payment path with exact requester authorization.
- `9f9d2dd` — two-wallet delegated lifecycle and authorization-negative evidence.
- `4e54463` — consolidated desktop workflows, navigation, and role surfaces.
- `c71481d` — production artifact audit for the consolidated desktop UI.
- `5b47b52` / `4c87b83` / `0dfa51a` — simplified policy, payment, and verification flows.
- `b8512de` — active-machine freshness enforcement and stale-C exclusion.
- `bddd5ab` — fresh A/B/D monitoring deployment evidence.
- `62f8a97` — refreshed hosted V2 lifecycle against the exact active set.
- `cbcb8bd` / `6078bdd` — 26-asset production-corpus baseline and audit.

This list is a handoff-oriented index, not the complete implementation history;
the remote Git history is authoritative.

Before recording any later demo or submission claim, commit and push the exact
submission branch, then bind the deployed artifact and evidence audit to that
reviewed source. Do not infer that an unmerged branch is already on `main`.
