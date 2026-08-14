# Verification and evidence plan

## 1. Evidence policy

Allowed public evidence:

- public addresses, extension IDs, code/image hashes, key fingerprints;
- transactions, blocks, statuses, gas, timings, checkpoint/result commitments;
- public policy/request fields and assertion booleans;
- sanitized dependency/version/source mappings.

Forbidden evidence:

- private policy plaintext or ciphertext;
- wallet/XRPL/FCC keys, seeds, signatures forbidden by policy, API credentials;
- proxy/indexer tokens, authenticated raw responses, private denial reasons;
- browser storage/network captures containing confidential payloads.

## 2. Gates

| Gate | Required proof | Status |
|---|---|---|
| 0 — Foundations | pinned supported tools, registries, services, three machine capacity | PARTIAL — FUNDING + CONTRACTS + REGISTRY DEPENDENCIES + RPC/EXPLORER/FAUCET + THREE STABLE RAILWAY ORIGINS + AUTHENTICATED INDEXER + THREE REGISTERED SIMULATED MACHINES PASS / HARDWARE CAPACITY OPEN |
| A — FCC result | registered extension result verified on Coston2 | LIVE V2 SIMULATED PASS — STATUS-2 MACHINES + DISPATCH/DELIVERY + EXACT TEE/PROXY SIGNATURES + OFFICIAL-MANAGER RECHECK / HARDWARE RELEASE OPEN |
| B — Private policy ingress | sealed policy, three receipts, replay/domain negatives | LIVE SIMULATED PASS — THREE INDEPENDENT ECIES WRITES + THREE MACHINE-SIGNED RECEIPTS + SANITIZED ON-CHAIN FREEZE + C→D NEW-POLICY REPLACEMENT / HARDWARE OPEN |
| C — Common custody | all-three matching policy availability and commitment | LIVE SIMULATED PASS — EXACT COMMITMENT/MACHINE/KEY SET FROZEN AFTER ALL THREE RECEIPTS / HARDWARE OPEN |
| D — Deterministic evaluation | cross-language vectors and private policy result | LIVE SIMULATED PASS — THREE MATCHING ALLOW RESULTS AND THREE MATCHING CAP DENIALS; CANONICAL FTSO/FDC LIVE INPUTS REMAIN OPEN |
| E — Threshold execution | two distinct exact results authorize one atomic action | LIVE SIMULATED V2 PASS — TWO DISTINCT ATTESTATIONS AUTHORIZE ALLOW/EXECUTE; TWO DENIALS MOVE NO FUNDS / HARDWARE RELEASE OPEN |
| F — Vault conservation | deposits/reservations/spend/refund and adversarial invariants | LOCAL PASS / VAULT DEPLOYED / LIVE FAssets REQUEST/PAYOUT OBSERVED / CANONICAL SETTLEMENT + DEFAULT RECOVERY OPEN |
| G — XRP-native funding | XRPL payment, FDC proof, Smart Account deposit | PASS — live PayGuard-owned Coston2 evidence in [`evidence/coston2/xrp-fdc-smart-account-funding-2026-08-09.json`](../../evidence/coston2/xrp-fdc-smart-account-funding-2026-08-09.json) covers validated XRPL Testnet payment, FDC request/finalized round/proof commitment, on-chain `verifyXRPPayment`, `executeDirectMintingWithData`, and verified PayGuardVault accounting. The credential-free [`coston2-funding-resume-audit-2026-08-09.json`](../../evidence/coston2/coston2-funding-resume-audit-2026-08-09.json) reconstructs that checkpoint and re-verifies its proof/runtime bindings. The separate [`xrpl-fdc-trigger-pending-2026-08-09.json`](../../evidence/coston2/xrpl-fdc-trigger-pending-2026-08-09.json) binds a second validated XRPL payment and finalized proof to atomic replay consumption and one canonical router `Pending` request. Canonical private FDC evaluation passes locally, but that exact live trigger was not sent through the separately verified simulated FCC lifecycle; delayed resubmission, end-to-end FDC→FCC execution, and release gates remain open. |
| H — Product release | full roles, recovery, accessibility, live deployment | ACTIVE V2 INTERACTIVE VERCEL DAPP + SELF-SERVICE OWNER UI + LIVE RAILWAY SIMULATED-FCC MULTI-OWNER LIFECYCLE + INDEPENDENT AUTHENTICATED AGGREGATE MONITORING + PUBLIC-SAFE REPOSITORY EVIDENCE + LANDING + BROWSER SMOKE PASS; HISTORICAL V1 RECOVERY EVIDENCE IS RETAINED SEPARATELY / HARDWARE, V2 OUTAGE MATRIX, CANONICAL V2 REDEMPTION, POST-HACKATHON PILOT VALIDATION, AND RELEASE MANIFEST OPEN |
| I — Acceptance and user validation | owner acceptance, interviews, usability, and design-partner pilot | OWNER ACCEPTANCE PASS — ON 2026-08-13 THE OWNER CONFIRMED EVERY IMPLEMENTED SUBMISSION-BOUNDARY SURFACE AND FLOW WAS TESTED AND PASSED; STRUCTURED EXTERNAL COHORT VALIDATION AND PILOTS REMAIN NOT STARTED/POST-HACKATHON |

Gate timing is explicit: the owner account/form/video/submission actions were
completed on 2026-08-14, with public [BUIDL 47777](https://dorahacks.io/buidl/47777)
retained as the submission URL. Founder acceptance is complete for the
implemented submission boundary. Structured interviews,
usability, and pilots remain post-hackathon and retain a zero-session disclosure
until real participants complete them. The live portions of Gates 0/A–H, the
external-validation and design-partner portions of Gate I, external review, release
promotion, and production/mainnet work are post-hackathon, except for the
completed production-monitoring row explicitly pulled into the submission
boundary on 2026-08-11. The simulated demo
does not pass those live portions.

## 3. Test matrix

### Protocol/model

- Golden vectors in Go, Solidity, and TypeScript.
- Schema malformed/unknown/oversized/boundary cases.
- Fixed/rolling/calendar cap boundaries and deterministic UTC slots.
- Reference conversion decimals, rounding, zero, overflow, and stale feed.
- Allow/deny precedence, action/target classes, delegated allowances.

### Contracts

- Unit/fuzz/invariant/stateful tests.
- Vault adversarial coverage includes reentrant callbacks, fee-on-transfer and
  false-return rollback, plus conservation/reservation/token-balance invariants.
- Receipt/signature/domain/machine/code/threshold negatives.
- V2 official-manager status, extension, code, platform-disable, fingerprint
  substitution, result-time removal, owner-only lifecycle, and global-pause negatives.
- Third-party submission of three owner-authorized custody receipts, exact-owner
  lifecycle enforcement, exact-requester evaluation authorization,
  owner/executor signer rejection, and independent requester/IP relay rate
  limits.
- The hosted multi-role runner creates fresh recoverable owner and requester
  wallets, funds them from the configured Coston2 source account, runs owner
  custody/registration/vault funding, then has the distinct requester create,
  authorize, execute, and receive a payment without an owner request signature.
  It also checks requester/target/cap denials, owner-as-requester and wrong-signer
  rejection, stopped/revoked state, requester governance rejection and duplicate
  evaluation coalescing. It returns all remaining test funds and emits only
  sanitized public evidence. A retained recovery file means the run is
  incomplete and must not be claimed as a pass.
- Request replay, duplicate occurrence, attempt/expiry/grace behavior.
- Conservation across execute, deny, expire, stop, revoke, withdraw, refund.
- Reentrancy, malicious token, callback, adapter, and partial failure.
- Competing executors/finalizers and transaction-order races.

### FCC/private path

- Two byte-identical no-cache image builds, pinned base/frontend digests, and
  secret-free build context.
- Three fresh local container identities, startup sign/decrypt readiness,
  hardening, malformed-ingress failure, cleanup, and restart rotation.
- Wrong key/owner/policy/request/nonce/commitment/schema/code/machine rejection.
- Foundation result ABI, action ID/status/version/domain/binding checks plus
  canonical TEE and proxy signatures over their distinct pinned FCC domains.
- No plaintext/ciphertext in chain, logs, browser persistence, evidence, or output.
- Same-identity ciphertext-store reconstruction; corrupt/truncated,
  over-permissive, symlink, conflicting, and concurrent records; identity
  rotation remains a new-version recovery rather than silent restoration.
- Replacement registration and frozen-policy failure/recovery.
- Split decisions and wrong result field rejection.

### Relay/executor

- Exact chain/registry/vault/router health and request-domain binding.
- Direct-client rate limits, bounded concurrency/body sizes, and owned timeout budgets.
- Identical in-flight evaluation/submission coalescing without durable private state.
- Competing executor, split-result, one-/two-machine outage, and restart-safe retry behavior.

### FDC/FTSO/Smart Account/FAssets

- Correct and wrong XRPL payment, destination, memo, owner, amount, fee, nonce.
- FDC request/finalization/DA proof/checkpoint resume and duplicate transaction.
- XRPL FDC consumer golden commitment, payment/memo/owner/freshness,
  runtime-verifier drift, transaction/proof replay, and verifier/router atomic
  rollback against both a rejecting mock and the real local router.
- Private FDC descriptor/snapshot parity across TypeScript and Go, including
  source/destination, memo/tag, amount, freshness, proof commitment, consumer,
  replay markers, request hash/status, missing input, and historical drift.
- Local Web2Json adapter source-allowlist commitment, canonical public request
  JSON, deterministic jq/ABI schema, MIC/response/freshness/replay binding,
  `uint64.max` Web2 timestamp sentinel, source-asserted `observedAt:uint64`,
  semantic-trust disclosure, negative verifier behavior, and async drift. No
  live supported source, proof, policy evaluation, or on-chain consumer is
  inferred from these tests.
- Fresh/stale/unavailable/negative FTSO value.
- Direct mint success, delayed mint, callback/event mismatch, quote drift.
- FAssets approve/transfer/redeem request and non-instant exit semantics.
- Runtime direct-mint AssetManager/FAsset/payment-address lookup and integer
  quote observation without transaction submission.

### Product

- Wallet-free public evidence.
- Owner, team, payee, executor, and auditor journeys.
- Laptop/mobile, keyboard, screen-reader names, reduced motion.
- Refresh/reload/fresh-process recovery at every asynchronous checkpoint.
- Explicit dependency-unavailable and no-provider states.
- Production deploy smoke tied to exact source commit.
- Public web evidence build allowlist, metadata index, and absence of forbidden
  policy/key fields.
- Interactive-demo actor descriptor, ciphertext-only ingress, wrong-machine,
  malformed/stale body, signature, split-quorum, RPC/history drift, and
  production-domain isolation tests.
- Production browser checks proving the client sends no decision field, keeps
  policy/ciphertext out of storage/console/evidence, labels every demo state as
  simulation, and verifies exact testnet receipts before showing success.

The local Vite browser smoke run on 2026-08-09 covered the landing page and all
eight application views at 1440px and 390px. It found no horizontal overflow;
the mobile shell exposed five primary destinations plus a four-item secondary
menu. The separate Vercel evidence record covers public HTML/JS/CSS and evidence
reachability, desktop/mobile Chrome captures, and Enter-key activation from the
landing page to the Overview view. Neither run is a live FCC or release smoke.

The later connected-vault browser smoke restored an injected public account,
verified the deployed Coston2 runtime/wiring/asset and finalized account state,
and opened the exact approval preview without issuing
`eth_sendTransaction`. Writer unit tests cover exact six-decimal amount parsing,
balance/allowance preflight, Approval/Deposited/Withdrawn event matching, and
post-finalization state changes. This validates the safety boundary and UI
workflow, not a newly submitted owner-wallet transaction or FCC authorization.

The connected request smoke loaded the reviewed XRPL/FDC-triggered request from
the finalized Coston2 router without a wallet and projected the same validated
state into Requests, Payee, and Auditor. Desktop and 390px mobile checks showed
the exact public `0.0001 FTestXRP` action, its time-derived expired readiness,
zero horizontal overflow after the responsive table fix, and zero browser
storage. The Auditor explicitly reported request-state verification rather than
FCC evidence; no threshold decision or settlement was inferred.

The router-action browser preview used an injected public Coston2 account and
the live reviewed request. Its finalized state disabled Execute, enabled Expire,
and disabled Cancel for the non-owner/non-requester account. Preparing Expire
displayed the exact router/request hash and the no-client-ALLOW boundary without
calling `eth_sendTransaction`; storage and horizontal-overflow checks remained
zero/false. Deterministic tests cover state/time/authorization eligibility,
exact router events, and terminal postconditions. No new router transaction was
broadcast from this UI during the check.

The earlier shared-state browser check exposed the finalized request readiness
on Overview, a hashed public evidence observation in Notifications, and the
bound policy owner/requester/payee under Team's "observed actors" boundary. It did not
label those actors as editable role grants or turn the Pending request into
Allowed. The 1440px run retained zero browser storage and no horizontal
overflow.

The Demo lifecycle parser passed reviewed-body, limitation-drift, quorum-drift,
secret-safety, conservation, and HTTP-failure tests. Browser smoke at 1440px and
390px rendered three visually distinct simulated machines and all fourteen
Coston2 checkpoints with explicit `SIMULATION ONLY`, ALLOW execution,
`CAP_EXCEEDED`, conservation, and production blockers. Both widths had zero
horizontal overflow and browser storage remained empty. The development evidence
route returned JSON with `no-store` and `nosniff`, matching the build artifact.

The final local onboarding smoke rendered the first-time path at 1440×1200 and
390×844, with direct routes to Demo, Vaults, Requests, and Policy Studio plus the
official Flare faucet. The landing at 1440×1000 exposed the Coston2 demo as the
primary action and described wallet reads/guarded writes without upgrading the
simulated FCC boundary. Visual inspection found no clipped horizontal content;
the placeholder Team invite and generic detail-toast controls were absent.

Lighthouse 13.4.1 lab runs against the earlier pinned production Landing and
Overview routes scored 99 performance and 100 accessibility, best practices,
and SEO for both routes. The landing measured FCP/LCP 1,578 ms, TBT 25 ms, and
CLS 0; the Overview measured FCP/LCP 1,570 ms, TBT 19 ms, and CLS 0. The specific
visible-label/accessibility-name mismatch and color-contrast audits both have
zero remaining nodes after aligning the brand name and raising the canonical
muted-text token to `#a0a0a0`. Lighthouse estimated 53,714 landing and 55,555
Overview bytes of unused first-load JavaScript in this run; lab results remain
environment-dependent.
This historical audit covers those Landing and Overview routes, not the
streamlined 2026-08-13 navigation or every authenticated/provider-bound state.

The production evidence-corpus audit recorded on 2026-08-09 fetched the pinned
Vercel origin, required JSON content types and HTTP 200, and matched the
metadata-only index plus all 15 then-listed bodies byte-for-byte with the reviewed
local sources. It reran recursive public-field checks and both simulation
boundaries. The repository-only result is
[`public-evidence-deployment-audit-2026-08-09.json`](../../evidence/web/public-evidence-deployment-audit-2026-08-09.json);
it is intentionally excluded from the hosted index and does not upgrade the
interactive testnet client into an FCC or verified-release claim.

The refreshed production-corpus audit recorded on 2026-08-11 is pinned to
source `3a271bd475637883297ce368109b3aed5df5935c`. It matched the current
metadata index and all 23 hosted bodies byte-for-byte to reviewed local sources,
including 22 chain-114 records and three explicitly bounded simulation records.
Its repository-only result is
[`public-evidence-deployment-audit-2026-08-11.json`](../../evidence/web/public-evidence-deployment-audit-2026-08-11.json).
This proves public-artifact integrity and includes the sanitized hosted-relay
lifecycle record; it does not turn either simulated route into hardware.

On 2026-08-12 the hosted V2 relay passed a fresh-wallet delegated lifecycle at
finalized block `33959050`. The existing Coston2 source funded independent
owner `0x97FA4e2bBD4a00D5243197a250E5F3613a87B469` and requester/payee
`0x9D491F3E06BDf4d6E81267908c198e1E3EE303de`. The owner authorized three
encrypted custody writes, verified three machine receipts, registered policy
commitment `0xe1bbd600410029bda8ffc6689e385ef1827353c8c1efe648493847a03114d681`,
and funded its vault. The distinct requester then created request
`0x9733f65a17f0895e14cbba1bb1d92cc36f9d27bb14be24c2c38e0f6e6b10a4a1`,
authorized FCC evaluation, received two matching relay-submitted `ALLOW`
results, executed, and received `0.1 FTestXRP`; no owner signature entered that
request path. `REQUESTER_DENIED`, `TARGET_DENIED`, and `CAP_EXCEEDED` each
reached a two-result on-chain denial without moving accounting. Requester
governance, policy-owner substitution for requester authorization, wrong signer,
stopped-policy request creation, revoked-policy resume, and client-supplied
decisions failed closed; a newly signed duplicate evaluation coalesced without
new submissions. The owner completed stop/resume/revoke, remaining FTestXRP and
C2FLR were returned, and the mode-`0600` recovery file was removed. The public-safe result
is [`fcc-multi-owner-lifecycle.json`](../../evidence/coston2/fcc-multi-owner-lifecycle.json);
it contains no key, policy, ciphertext, authorization, signature, or credential
and does not promote the `SIMULATED_TEE` candidate to a hardware release.

The 2026-08-12 production-corpus audit then fetched the new Vercel deployment
and matched its metadata index plus all 25 bodies byte-for-byte to reviewed
local sources: 24 entries are chain-114 records and three entries are explicitly
bounded simulation records, with overlapping categories. HTTP status, JSON
content type, recursive public-field safety, simulation boundaries, and the
metadata-only index all passed. The repository-only result is
[`public-evidence-deployment-audit-2026-08-12.json`](../../evidence/web/public-evidence-deployment-audit-2026-08-12.json);
it is not recursively published and does not upgrade any release claim.

The 2026-08-13 refresh added the public-safe stale-machine-C pause record and
the first 26-entry audit. On 2026-08-14 the A process replacement was promoted,
the stale identity was paused, the owner-wallet hosted lifecycle was rerun, and
the static artifact was rebuilt from source
`089c8506002b4901fdc9bc676e5475fe4689ed8a`. The production audit matched all
26 bodies byte-for-byte: 25 chain-114 records and three overlapping, explicitly
bounded simulation records. The current repository-only result is
[`public-evidence-deployment-audit-2026-08-14.json`](../../evidence/web/public-evidence-deployment-audit-2026-08-14.json).
The previous result remains historical at
[`public-evidence-deployment-audit-2026-08-13.json`](../../evidence/web/public-evidence-deployment-audit-2026-08-13.json).
The deployed navigation contains only Policy Studio, Vaults, Requests, Demo
lifecycle, Payee, and Auditor. Legacy Overview and Team routes redirect to Demo
lifecycle and Auditor; request-bound actor observations moved into Auditor, and
the notification feed remains a tray rather than a separate workspace.

On 2026-08-10 the isolated interactive namespace passed a 133.29-second gate
against the public Vercel actor APIs and separate Coston2 contracts. The test
verified three actor custody receipts, policy registration, two matching
`ALLOW` results and execution, a second request denied by two matching
`CAP_EXCEEDED` results, stop/resume/revoke, and final vault conservation. The
production API separately returned HTTP 400 for a client payload containing a
decision field. Chrome 151 inspected landing, Overview, Demo lifecycle, and
Policy Studio at 1440×1100 with zero horizontal overflow, browser storage,
failed HTTP requests, or console errors. Public transaction IDs and bounded
assertions are recorded in
[`vercel-interactive-demo-2026-08-10.json`](../../evidence/web/vercel-interactive-demo-2026-08-10.json).
The actors share one Vercel operator and are not hardware TEEs; these results do
not satisfy production FCC Gates A, B, or C.

## 4. Release manifest

A future `coston2.release.json` becomes authoritative only after it records and
verifies:

- network/chain and deployment block;
- contract addresses, runtime hashes, constructor/wiring, ownership/governance;
- extension ID, code/image version/hash;
- machine IDs, URLs, key fingerprints, status, and signer mapping;
- official protocol discovery sources/addresses;
- deployment and verification transactions;
- source commit and generated binding digest;
- SHA-256-bound canonical lifecycle, outage-drill, redemption, and anonymized
  user-validation evidence files plus pass/fail assertions.

The source-complete V2 preparation layer is checked separately with
`pnpm candidate:build`. It produces an ignored `local-build` record with
`verified: false` and cannot satisfy this release section. The structural live
validators and human/network re-observation inputs are tracked by
`releases/candidates/coston2-v2.plan.json`. The candidate remains
non-authoritative until every recorded blocker is independently satisfied.

## 5. Release acceptance

The hackathon acceptance boundary is narrower than release acceptance. The
production Vercel app exposes the earlier isolated three-actor record as
historical evidence and an explicitly labelled live V2 simulated candidate through
the hosted Railway relay and registered A/B/D `SIMULATED_TEE` machines. A
sanitized end-to-end run verifies private ingress, custody, two-of-three
evaluation, execution, denial, governance, and conservation. After A restarted
on 2026-08-14, its fresh identity was promoted to status 2, the unreachable old
identity was paused, and the complete multi-owner lifecycle passed again with
the exact replacement A/B/D set. Hardware-backed release acceptance remains
open.

One separate solution-3 record now proves the deployed Coston2 registry,
router, and vault path with three ephemeral simulated signers, two matching
allow results, cap denial, stop/resume/revoke, and conservation. It is stored
under `evidence/simulation/`, asserts `hardwareTeeVerified: false` and
`registeredMachinesVerified: false`, and does not satisfy Gate A, B, C, or the
live portion of Gate E.

Do not call PayGuard complete because the simulated Coston2 lifecycle works.
Release still requires hardware lifecycle evidence, the remaining V2 dependency
outage and redemption paths, release-bound generated bindings, release-bound
browser smoke, external review, user testing, and documentation whose claims
exactly match the deployed state.

## 6. Pending local payment-details validation

The local web workspace consolidates the former Requests inspection tab, Payee,
and Auditor into `#app/payment`. One finalized router checkpoint now drives the
primary outcome, while reviewed FCC lifecycle evidence, conservation, and an
exact payee settlement receipt remain separately gated. Legacy Payee, Auditor,
and Team hashes redirect to that surface. This change is not yet part of the
deployed verification record: focused tests, typecheck/build, browser review,
commit, push, deployment, and hosted smoke remain intentionally pending for the
owner-approved final batch.
