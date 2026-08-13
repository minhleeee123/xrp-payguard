# XRP PayGuard — full product execution plan

> Status: the local protocol and Foundry state machine pass cross-language/unit
> tests. Parallel V1 and V2 contract namespaces plus a three-machine FCC
> dispatcher are deployed and verified on Coston2. Three stable, registered
> `SIMULATED_TEE` machines have
> completed all-three private custody plus a live two-of-three ALLOW/execute,
> CAP-denial, stop/resume/revoke, C→D replacement, and executor-pause recovery
> lifecycle, including one hosted V2 run. An independent Railway monitor now
> observes the relay, Coston2 RPC, and A/B/D readiness with authenticated
> operator routes, bounded aggregate retention, fixed alerts, and sanitized
> evidence. Hardware attestation, verified-release
> promotion, the remaining V2 dependency-outage
> drills, and a complete release remain unverified.
>
> Hackathon delivery decision (updated 2026-08-11): historical solution-3
> evidence retains the credential-free local and isolated Vercel simulation
> boundaries. The current Vercel application additionally connects to a hosted
> Railway relay and three registered A/B/D machines using organizer-supported
> `SIMULATED_TEE=true`. They satisfy the hosted V2 Coston2 simulated-candidate
> profile and remain labelled `SIMULATED`. They do not satisfy
> hardware-attestation, verified-release, or mainnet gates.

## 1. Product objective

Build the strongest credible confidential payment-policy product for XRPL and
Flare users. XRP PayGuard lets a user or treasury pre-fund a public asset vault,
keep authorization rules private inside a fixed FCC machine set, and execute a
public payment or contract call only after a threshold of registered machines
evaluates the exact request against the exact policy.

The product is larger than a hackathon MVP. The build starts with the smallest
real vertical slice, then grows into personal, team, treasury, and developer
surfaces without weakening the same privacy, threshold, and recovery model.

## 2. Flagship journey

```text
XRPL owner creates a PayGuard account and private policy
        |
policy is encrypted independently to three registered FCC machines
        |
all three signed receipts bind one public policy commitment
        |
XRPL Payment/FAssets mint funds the user's Smart Account or PayGuard vault
        |
an owner, scheduled executor, or attested external event requests an action
        |
close/evaluation freezes request, spend checkpoint, FTSO input, nonce, expiry
        |
three TEEs independently evaluate the sealed policy and canonical public state
        |
two matching registered results authorize or deny the exact request
        |
the router executes once; public balance/history roots advance atomically
        |
owner, payee, executor, and auditor inspect public execution evidence
```

## 3. Complete product surface

### Personal PayGuard

- Recurring payments with fixed or FTSO-denominated public amounts.
- Daily, weekly, monthly, and rolling-window value caps.
- Target/merchant allow and deny policies.
- Time windows, start/end dates, grace periods, and occurrence limits.
- One-time allowances and delegated spender limits.
- Emergency stop, revocation, replacement, and safe withdrawal.

### Team and treasury PayGuard

- Policy templates for subscriptions, payroll, grants, vendors, and operations.
- Separate policy author, funder, executor, payee, and auditor roles.
- Versioned proposals and explicit activation; no silent rule changes.
- Multiple vaults and budgets under one treasury identity.
- Public reconciliation exports and release evidence.
- Threshold governance for policy activation without granting a winner or
  payment override to the web client.

### Developer platform

- Policy SDK and deterministic codec.
- Simulation endpoint that never returns success when FCC is unavailable.
- Action adapters for FAssets transfer/redeem and allowlisted EVM calls.
- FDC trigger adapters for XRPL Payment and EVMTransaction, plus a deliberately
  local-only Web2Json boundary until a production source and consumer exist.
- Webhooks/notifications carrying only public-safe state.
- Public evidence API and independent verification CLI.

## 4. Phase gates

### Gate timing and hackathon boundary

Unchecked boxes do not all have the same deadline:

- **Completed before submission — owner actions:** on 2026-08-14 the owner
  confirmed the enabled DoraHacks form/account/bounty selection, published the
  reviewed final video, submitted to Interoperable Asset Products, and retained
  the public [BUIDL 47777](https://dorahacks.io/buidl/47777) URL.
- **Before submission — owner acceptance:** on 2026-08-13 the owner confirmed
  hands-on testing of every implemented submission-boundary surface and flow,
  including the landing, Policy Studio, vault, requests, Payment details, Demo
  lifecycle, public evidence, relay, and monitoring states. All passed to the
  owner's satisfaction. This is founder acceptance, not independent user
  validation or a production-release claim.
- **Post-hackathon — external validation:** the structured XRPL-user,
  treasury/DAO, and recipient/executor sessions remain honestly `0 sessions`
  until qualifying participants complete them. Owner acceptance and local tests
  do not close that separate research gate.
- **Post-hackathon — live/release work:** these gates stay separate from the
  submission count even when completed later. Stable A/B/D FCC origins,
  authenticated indexer access, registered simulated custody/evaluation,
  replacement, executor-pause recovery, hosted V2 relay/web integration, and a
  complete V2 custody/threshold/governance lifecycle now pass. Uncontrolled
  live FAssets conditions, remaining V2 outage drills,
  independent review, release promotion, pilots, hardware, and all
  mainnet/production work remain outside the hackathon boundary.

One formerly post-hackathon production-monitoring row was deliberately pulled
into the pre-submission boundary and completed on 2026-08-11. Therefore the
current hackathon count is 105 completed gates out of 105 (100%). No
pre-submission gate remains open, and no post-hackathon row is included in that
headline.

The original hackathon boundary did not require a V2 deployment or a verified
production FCC release to demonstrate its explicitly simulated solution-3
boundary. The required owner actions are now complete; hardware, release,
external-validation, pilot, and production work remains post-hackathon.

### Phase 0 — competition, product, and user discovery

- [x] Recheck the public DoraHacks listing and official FCC readiness docs on
  2026-08-09; record the exact public deadline, prize/track, required-package,
  existing-project, and currently-disabled-form observations plus FCC's
  not-fully-public status without calling any of them account eligibility,
  organizer approval, or granted infrastructure.
- [x] On 2026-08-14 confirm the final form mechanics and owner account/bounty
  selection, publish the reviewed demo, submit to Interoperable Asset Products,
  and retain public [BUIDL 47777](https://dorahacks.io/buidl/47777). This does
  not claim organizer acceptance, an eligibility determination, granted FCC
  hardware, judging outcome, or an award.
- [x] Owner acceptance: on 2026-08-13 the owner confirmed testing every
  implemented part of the submission-boundary product and reported that all
  tested surfaces and flows passed. This covers founder acceptance only; it
  does not claim independent cohort validation, hardware-backed FCC, audit,
  mainnet, or verified-release readiness.
- [x] Select the first narrow policy problem and record why private policy
  evaluation is necessary instead of an ordinary public smart contract.
- [x] Freeze product non-claims, data map, threat model, and one-sentence demo.
- [x] Publish a retrospective, commit-linked ledger of reference-only,
  third-party, adapted, and new PayGuard work before submission. A complete
  ledger was not committed before implementation began, so preserve that
  chronology limitation instead of presenting the retrospective as prior art.

Exit: one validated policy journey and one real design partner target exist.

### Phase 1 — pinned official foundations

The dedicated PayGuard Coston2 development wallet has verified testnet
bootstrap funding. Three stable Railway FCC origins and authenticated indexer
connectivity are now verified separately from the frozen hackathon web artifact.

- [x] Pin Node 24, pnpm, Go, Foundry, Solidity, viem, XRPL, and official Flare
  periphery/FCC revisions.
- [x] Add a local fail-closed resolver for official Coston2 protocol addresses
  through the Flare Contract Registry; live reachability remains open.
- [x] Resolve the Coston2 FCC manager and Contract Registry-listed FDC, FTSO,
  FAssets, Smart Account, verifier, and DA addresses through supported sources;
  record block/runtime observations without promoting them to release facts.
- [x] Verify the supported Coston2 faucet page, public Explorer ABI path, and
  their current reachability without committing credentials; authenticated FCC
  indexer access is evidenced separately and its credentials remain local-only.
- [x] Build the official FCC scaffold unchanged and run its local smoke first.
- [x] Build a digest-pinned reproducible PayGuard FCC image and pass a
  credential-free local three-machine identity/restart/hardening smoke.
- [x] Post-hackathon: obtain three stable HTTPS FCC machine origins and an
  authenticated indexer path without committing credentials. Three Railway
  services are live and the public evidence contains no credential.
- [x] Add secret, dependency, source-provenance, and release-doc checks.

Exit: every mandatory dependency is pinned and reachable, or product work pauses.

### Phase 2 — FCC private-policy feasibility

The checked items below cover both the local ciphertext-only/reference adapter
and the separately evidenced live Coston2 simulated-machine path.

- [x] Implement a typed, domain-bound `PING_V1` sender/handler with a shared
  Solidity/Go golden vector and fail-closed negative coverage.
- [x] Deploy/register the foundation sender, bind extension ID, configure the
  owner/key-type prerequisites, and independently verify its Coston2 runtime.
- [x] Add a production-only machine admission preflight that validates the
  pinned Google PKI chain and claims, fresh TEE identity, machine/proxy
  signatures, image, platform, owner, extension, governance, and chain domain.
- [x] Add bounded, explicit public CRL file inputs for a production Google
  certificate chain with distribution points; never fetch a URL merely because
  an unverified token supplied it.
- [x] Add a strict Go-to-Node machine-admission handoff and deterministic,
  idempotent code-version allowance plan with exact verified PayGuard
  owner/sender/extension and on-chain conflict checks.
- [x] Add a clean-source, explicit-broadcast code-version command with pinned
  toolchains/RPC/official manager, owner simulation, conservative gas gate,
  fresh identity recheck, event/readback recovery, and public-safe evidence.
- [x] Add a guarded official `rRap` machine-registration runner with pinned
  scaffold source, strict stable origins, resumable ignored state, fresh
  identity recheck, exact production readbacks/events, and public-safe evidence.
- [x] Add a strict public `PING_V1` result verifier for canonical response ABI,
  exact request/binding fields, and distinct TEE/proxy FCC signing domains.
- [x] Add a guarded `PING_V1` dispatch/poll/evidence runner with simulation,
  exact sender/machine/event readback, bounded result polling, and public-safe
  testnet evidence that preserves custody/threshold blockers.
- [x] Post-hackathon: register a Coston2 machine and verify one signed
  `PING_V1` result before treating the live simulated FCC path as available.
  Manager status `2`, dispatch/delivery, and distinct TEE/proxy signatures are
  verified; the machine is explicitly `SIMULATED_TEE`, not hardware production.
- [x] Implement ciphertext-only policy ingress and an identity-namespaced local
  store with `0700`/`0600` permissions, no-overwrite atomic writes, exact retry,
  corruption/symlink rejection, and same-identity process reconstruction. A new
  TEE identity intentionally sees no old-policy custody and requires a new
  policy version; production-volume evidence remains open.
- [x] Return machine-signed `POLICY_RECEIPT_V1` values bound to policy owner,
  commitment, schema, code version, chain, contracts, machine, and nonce.
- [x] Add a TypeScript public custody-bundle verifier for three frozen receipt
  digests/signatures; the live simulated custody runner now records only the
  sanitized receipt digests and on-chain freeze transaction.
- [x] Post-hackathon: register three distinct Coston2 simulated machines,
  independently encrypt the private policy to each, verify all-three custody
  receipts, and freeze the exact machine/key set on-chain. This is live
  simulated custody, not hardware attestation.
- [x] Implement deterministic `EVALUATE_V1` returning only public-safe decision
  fields; prove two matching result signatures in the local adapter.
- [x] Prove replay, wrong owner, wrong commitment, wrong request, wrong code,
  and wrong machine failure locally.
- [x] Post-hackathon: prove supported replacement registration and document
  that an active policy never silently swaps a frozen identity. Machine C was
  made unavailable, D completed fresh `rRap`/availability/production, and a new
  A/B/D policy passed custody plus ALLOW/execute/DENY/governance; the prior
  A/B/C policy was never mutated.

Exit: private policy content never enters a public path and registered threshold
machines authorize one domain-bound test action.

Live Coston2 simulated-machine evidence now additionally covers three matching
machine evaluations, two accepted on-chain attestations, one atomic ALLOW
execution, one deterministic `CAP_EXCEEDED` denial with no accounting change,
and stop/resume/revoke. The active V2 path removes the V1 administrator mapping;
simulated attestation remains a verified-release blocker.

### Phase 3 — deterministic policy protocol

Codec/evaluator checks marked here are local cross-language coverage. Solidity
contains math and bitmask-only composition references, never private policy
fields; live machine-domain verification remains open.

- [x] Freeze `POLICY_SCHEMA_V1`, `POLICY_RECEIPT_V1`, `ACTION_REQUEST_V1`,
  `SPEND_CHECKPOINT_V1`, and `EVALUATION_RESULT_V1`.
- [x] Implement fixed-point value conversion with shared Go/Solidity/TypeScript
  golden vectors.
- [x] Implement deterministic policy composition with shared
  Go/Solidity/TypeScript golden vectors.
- [x] Implement recurring slots, rolling windows, target rules, occurrence
  limits, delegated allowances, expiry, and deny precedence.
- [x] Freeze checked, inclusive UTC recurring-slot arithmetic with shared
  Go/Solidity/TypeScript boundary and overflow vectors.
- [x] Bind recurring interval/grace into `POLICY_SCHEMA_V1` and enforce exact
  slot, occurrence, inclusive deadline, expiry, and ad-hoc-zero semantics.
- [x] Make delegated requester authority owner-only by default and require every
  non-owner to be explicitly allowlisted under the same policy caps.
- [x] Freeze UTC calendar and exact sliding rolling-window sums with shared
  Go/Solidity/TypeScript boundary, order, range, and overflow vectors.
- [x] Remove caller-declared spend aggregates; replay ordered public requests,
  accounting times, and request-bound FTSO snapshots from canonical genesis in
  both Go and TypeScript before deriving cap totals.
- [x] Freeze the Go/TypeScript HTTP wire to lower-camel fields, named enums, and
  quoted decimal bigint/uint64 values with digest-preserving round-trip tests.
- [x] Define deterministic tie/conflict rules: explicit deny outranks allow;
  malformed/unknown masks, stale checkpoints, and unavailable dependencies fail
  closed; shared Go/TypeScript/Solidity vectors cover the priority order.
- [x] Add range, rounding, overflow, time-boundary, timezone-independent,
  permutation, and concurrency suites.

Exit: all implementations agree for every golden vector and no subjective/AI
branch exists.

### Phase 4 — contracts, vault, and atomic execution

The checked items cover the local Foundry state-machine and public Coston2
contract-deployment gates. External review and live FCC protocol wiring remain
open.

- [x] Implement non-upgradeable `PayGuardPolicyRegistry`, `PayGuardVault`, and
  `PayGuardActionRouter` contracts with minimal immutable authority. Add a local
  `PayGuardPolicyRegistryV2` candidate that constructor-freezes the official
  manager/extension/code binding, rechecks production machine status and
  platform at receipt/result time, limits individual lifecycle controls to the
  owner, and gives governance only a global pause with safe permanent
  renunciation. The V2 simulated candidate is deployed and verified against
  its reviewed public evidence; hardware-attested release promotion remains open.
- [x] Commit policy hash plus frozen machine/key/code policy after all-three
  receipts; never publish ciphertext.
- [x] Implement deposit, request, evaluate, execute, deny, expire, revoke,
  emergency stop, and withdrawal state transitions.
- [x] Require two distinct registered signers over one exact evaluation digest.
- [x] Advance spend checkpoint, occurrence count, request nonce, and transfer in
  one atomic transaction; reject duplicate or partial execution.
- [x] Derive a domain-separated genesis checkpoint and revalidate the current
  checkpoint/occurrence at execution to reject competing stale approvals.
- [x] Recompute every threshold-signed checkpoint transition in the router and
  reject checkpoint substitution or regressing canonical accounting time.
- [x] Keep permissionless pending/deny requests unreserved and reserve funds
  atomically only when two matching registered machines reach `ALLOW`.
- [x] Restrict V1 actions to an explicitly supported FTestXRP-like transfer;
  arbitrary calls remain disabled and the adapter still needs independent audit.
- [x] Add unit, reentrancy, fee/false-return token failure, 256-run fuzz, and
  128-run/64-depth stateful conservation/reservation invariant tests. External
  review remains open.
- [x] Deploy registry, vault, and router from committed source on Coston2;
  independently verify successful receipts, artifact runtime outside immutable
  ranges, constructor getters, one-time router wiring, and FTestXRP support.

Exit: the local multi-policy state machine cannot overspend, replay, partially
execute, or bypass FCC authorization, and its exact public contract layer is
verified on Coston2. Separate registered simulated FCC execution now passes;
external review, hardware attestation, and V2 official-manager deployment remain
open.

### Phase 5 — XRP-native funding and external triggers

- [x] Add a public-only resolver for the XRPL owner's deterministic Flare
  PersonalAccount and memo nonce; live reads are covered by the Coston2
  funding evidence.
- [x] Encode a bounded `0xFE` `PackedUserOperation` that can target a PayGuard
  vault without accepting a custodial XRPL signer; tuple encoding and live
  activation/deposit are covered by the Coston2 funding evidence.
- [x] Build the exact public FDC `XRPPayment` prepare request and ABI encoding
  with source ID, verifier-supplied MIC, and executor `proofOwner`; live
  verifier/MIC/proof submission is covered by the Coston2 funding evidence.
- [x] Add a Coston2-only fail-closed authenticated verifier prepare client with
  strict origin, response bounds, and ABI binding checks; live request and
  proof retrieval are covered without recording the API credential.
- [x] Add a bounded Coston2 DA reader/parser for the public XRPPayment envelope;
  it binds request/response fields and Merkle-node shape; the live run also
  verifies the finalized round and on-chain proof commitment.
- [x] Add a runtime-bound Coston2 FDC finality checkpoint for protocol ID,
  relay, finalized state, and non-zero Merkle root; the live run verifies the
  corresponding XRPPayment proof on-chain.
- [x] Derive the FDC voting round from the mined request-block timestamp via
  the runtime Relay `getVotingRoundId` calculator; wall-clock and hard-coded
  epoch formulas remain unsupported.
- [x] Add a runtime fee quote and exact `requestAttestation(bytes)` submission
  intent codec; a caller-owned testnet executor broadcast and successful receipt
  are covered by the Coston2 funding evidence.
- [x] Add an exact direct-mint/`0xFE` with-data call codec bound to parsed
  successful XRPPayment and finalized-round checkpoints; live Merkle
  verification, broadcast, receipt matching, and vault accounting are covered
  by the Coston2 funding evidence.
- [x] Add a runtime-bound `IFdcVerification.verifyXRPPayment` proof boundary
  that accepts only a finalized round and a successful `testXRP` envelope; the
  live run exercises this boundary before direct mint.
- [x] Compose the public FDC preparation flow from fee intent, mined receipt
  timestamp, Relay round, finality, DA envelope, proof verification, and
  direct-mint intent; no signer, broadcast, or private credential is retained.
- [x] Resolve the official runtime `directMintingPaymentAddress()` and reject
  malformed/unavailable Core Vault addresses; the live XRPL payment to the
  resolved Core Vault is covered by the Coston2 funding evidence.
- [x] Add an integer-only official-field FAssets direct-mint quote calculator
  and injected settings reader; the live quote, payment, and mint execution are
  covered, while quote-drift/recovery drills remain open.
- [x] Add a credential-free read-only Coston2 observer that resolves
  `AssetManagerFXRP` through the Contract Registry, reads the runtime FAsset,
  direct-mint fee settings, and Core Vault payment address, and records an
  integer quote without submitting a transaction.
- [x] Add an injected, read-only XRPL API v2 checkpoint reader for validated
  account, ledger, and native-XRP Payment state; wallet signing remains outside
  the production reader boundary, while one live funding run is evidenced.
- [x] Request, retrieve, and verify a real FDC `XRPPayment` proof on Coston2;
  sanitized public identifiers and the proof commitment are recorded in
  `evidence/coston2/xrp-fdc-smart-account-funding-2026-08-09.json`.
- [x] Execute Smart Account direct mint/funding and bind payment, tuple-encoded
  user-op hash, owner, nonce, asset, amount, executor fee, and PayGuard
  destination; the live receipt and vault accounting are recorded in the same
  testnet-only evidence file.
- [x] Implement a local fail-closed funding state machine that revalidates the
  operation and expected-payment hashes at every transition, binds accepted FDC
  proof commitment, and requires an exact public direct-mint receipt.
- [x] Reconstruct the completed public funding checkpoint from XRPL/Coston2
  history, decode the FDC proof and `0xFE` operation from public calldata,
  reverify the proof on-chain, and bind current quote, payment address,
  consumed nonce, approve/deposit operation, receipt, and vault conservation;
  injected mutations prove each live-bound drift fails closed.
- [ ] Post-hackathon: capture a real `DirectMintingDelayed` event on a
  supported test condition,
  wait until its public `executionAllowedAt`, and verify the same proof/data is
  resubmitted successfully. The completed historical funding transaction did
  not enter the delayed state, so local delay simulation is not live evidence.
- [x] Add local fail-closed `EVMTransaction` and `XRPPayment` trigger adapters
  over the official request/response fields, with freshness, replay, bounded
  bytes, async-drift, exact-event/payment, and injected-verifier tests.
- [x] Implement and locally verify an XRPL FDC canonical consumer that binds the
  runtime `FdcVerification`, exact payment amount/request-ID memo/proof owner,
  atomically consumes transaction and proof commitments, and creates one
  `Pending` request in the real PayGuard router without an `ALLOW` path.
- [x] Deploy the XRPL FDC consumer on Coston2 and independently verify its
  receipt, runtime bytecode, constructor/protocol constants, one-hour freshness
  bound, current `FdcVerification`, and canonical PayGuard router bindings.
- [x] Extend the private policy schema and both evaluators with canonical FDC
  trigger descriptors/snapshots so source, destination, memo/tag, amount,
  freshness, proof commitment, and consumer state are independently enforced
  before either machine can sign `ALLOW`.
- [x] Consume a verified live FDC trigger commitment while atomically advancing
  one canonical PayGuard request to `Pending` on Coston2; the sanitized record
  binds the validated XRPL Testnet payment, finalized round, on-chain proof,
  replay markers, request hash, and router readback. Policy custody is explicitly
  simulated, and no FCC evaluation, `ALLOW`, reserve, or execution is claimed.
- [x] Add a local fail-closed Web2Json boundary only after source allowlisting,
  transform/schema pinning, and semantic trust are explicit. The adapter now
  requires an exact source commitment allowlist, canonical public request
  fields, jq/ABI/MIC/response/freshness/replay binding, and an injected verifier;
  production source configuration, live proof, private-policy evaluation, and
  canonical on-chain consumption remain open and are not claimed.
- [x] Implement a local official-field FAssets redemption checkpoint model that
  distinguishes request, partial/multi-agent obligations, verified underlying
  payment, and verified collateral default without claiming instant XRP.
- [x] Add a Coston2 FAssets redemption boundary that resolves the runtime
  AssetManager/FAsset/minimum, checks public balance and allowance, binds
  approve/redeem receipts to submitted transaction hashes, and parses official
  amount/tag request events with fail-closed partial-leg checks. Signing stays
  in an injected writer; live settlement remains open.
- [x] Align successful `RedemptionPerformed` settlement parsing with the live
  Coston2 event (positive `spentUnderlyingUBA` and deployed uint256 request
  ID), while retaining a uint64 compatibility decoder and rejecting blocked or
  failed-event spend semantics on the successful path.
- [x] Execute one live minimum amount-based FXRP redemption on Coston2 and
  observe a validated XRPL payout plus matching `RedemptionPerformed` event;
  the sanitized public identifiers are in the redemption evidence file. The
  canonical PayGuard verifier-consumption, tag, and default paths remain open.
- [x] Execute one live `redeemWithTag` FXRP redemption on Coston2 and verify the
  XRPL payout carries the requested destination tag; the sanitized public
  identifiers are in the tagged redemption evidence file. Partial fulfillment,
  default recovery, and canonical PayGuard event consumption remain open.
- [ ] Post-hackathon: execute and verify an official live FAssets
  redemption/default exit on
  Coston2, including partial fulfillment, default recovery, and canonical
  PayGuard settlement consumption.

Exit: one XRPL Testnet payment funds a canonical Coston2 PayGuard vault and an
FDC-attested trigger safely advances one request. A single live testnet run
passes this funding exit; FCC custody/evaluation and redemption remain separate
release gates.

### Phase 6 — full application

The checked items describe the reviewed source application and the current
Vercel deployment. Hosted simulated V2 custody/evaluation and owner governance
now pass; fresh non-operator user-wallet evidence and verified-release FCC remain
open.

- [x] Build the laptop-first application shell and standalone landing page;
  deploy the exact reviewed artifact with Vercel CLI and pass production
  HTML/assets/evidence, desktop/mobile, keyboard, and Lighthouse smoke.
- [x] Build the local Policy Studio with templates, exact public/private
  preview, local validation, schema-checked custody receipt progress, and an
  activation block; hosted V2 ingress, receipt, and activation evidence now pass.
- [x] Build the Accounts/Vaults surface with injected-wallet Coston2 connection,
  one-finalized-block runtime/wiring/asset verification, public wallet and vault
  balances, conservation, and recovery copy. Add one human-unit deposit intent
  that conditionally sequences exact FTestXRP approval and deposit, plus a
  separate withdrawal action, while preserving preflight simulation,
  injected-wallet signing, per-transaction progress, finalized receipt/event
  checks, and exact postcondition verification. Unit and browser preview checks
  pass, while a fresh UI-submitted transaction remains outside the current
  evidence set.
- [x] Build the local Schedule/Requests surface with occurrence readiness,
  public threshold decisions, expiry, and recovery. Connect wallet-free exact-ID
  lookup to one finalized Coston2 block with runtime/wiring/domain/request-hash
  validation and shared Payee/Auditor request projection. Add two-step router
  execute/expire/cancel controls whose eligibility comes only from finalized
  status/time and registry requester/owner facts, followed by simulation,
  receipt/event, and terminal-state checks; browser preview passes, while a new
  UI-submitted router transaction remains outside the evidence set.
- [x] Build the local Payee view with expected public amount/timing and
  schema-checked receipt status derived from the finalized router request,
  without policy reveal; executed settlement transaction proof remains open.
- [x] Build the local wallet-free Auditor view with policy commitment,
  machine/code binding, FTSO/FDC facts, decision digest, and conservation
  verification. Add finalized canonical request-state verification while keeping
  full FCC/evaluation evidence unavailable until its independent facts exist.
- [x] Build a solution-3 Demo lifecycle that strictly parses the reviewed
  simulation artifact and presents three distinct simulated machines, fourteen
  Coston2 transactions, matching allow/deny results, lifecycle governance, and
  conservation while preserving every false production-FCC assertion. Serve the
  same scanner-approved evidence in Vite development and production builds.
- [x] Build and validate the role-aware public projection; no client role can
  authorize. Because no role registry exists, the final UI consolidates the
  former Team workspace into Auditor and shows only finalized registry/request
  actors as observations rather than invented grants; live editable governance
  remains open.
- [x] Build a strict public notification feed and export with finalized block/time
  facts and domain-separated hashes. Derive exact terminal request kinds or a
  neutral evidence-checkpoint observation from the validated Coston2 request;
  never infer Ready/Allowed from Pending readiness.
- [x] Make laptop UX primary with responsive/mobile layout, focus states, and
  explicit loading/error/recovery copy. Historical production
  Landing/Overview Lighthouse and all-view responsive/reduced-motion checks
  passed; the 2026-08-13 artifact separately passed its targeted production
  browser, navigation, and corpus checks after Overview/Team consolidation.
  Manual assistive-technology testing remains open.
- [x] Add an isolated Interactive Demo namespace with three stateless
  ciphertext-only simulated actors, independently computed signed receipts and
  results, exact wallet previews, two-result threshold submission, lifecycle
  governance, permanent simulation labels, and no production FCC claim. The
  deployed API gate, automated Coston2 ALLOW/execute/CAP-denial/governance
  lifecycle, and wallet-free 1440px browser smoke passed on 2026-08-10.

Exit: every user role can complete its canonical journey without a mock or
manual database edit.

### Phase 7 — reliability, privacy, and operational hardening

The checked items are automated local gates; live outage drills and external
review remain open.

The repository CI workflow now runs locked install, pinned-toolchain checks,
workspace type/tests/build, Go tests, Forge formatting/tests, and all existing
privacy, secret, evidence, release, documentation, and binding-drift gates.

- [x] Make relay/executor orchestration stateless and recoverable from public
  checkpoints.
- [ ] Post-hackathon: run proxy, RPC, FDC, FTSO, indexer, one-machine, and
  executor outage drills. The one-machine-loss/replacement and full executor
  pause/resume portions now pass live on Coston2 simulated machines; the
  proxy, RPC, FDC, FTSO, and indexer cases remain open.
- [x] Run full-history secret scans plus browser/network/log/evidence privacy scans.
- [x] Add rate limits, idempotency, health bindings, timeout budgets, and
  competing-executor tests.
- [x] Verify machine replacement for new policies and fail-closed behavior for
  policies bound to unavailable frozen machines.
- [x] Exercise a local fail-closed outage matrix for RPC/registry, FDC, FTSO,
  public-reader states, one-machine relay loss, and executor submission loss;
  live drills remain open.
- [ ] Post-hackathon: commission external contract and TEE-path review before
  production value.

Exit: failure is resumable or explicitly denied, never represented as success.

### Phase 8 — Coston2 release and evidence

- [x] Deploy the public-safe web application to Vercel through the pinned CLI
  workflow and verify HTTPS HTML/JS/CSS plus desktop/mobile/keyboard
  reachability. It now reaches the hosted V2 relay and registered A/B/D
  simulated machines; verified-release smoke remains open.
- [x] Emit an allowlisted public-safe evidence index and JSON assets at the
  Vercel `/evidence/` endpoint. The hosted relay lifecycle is now included as a
  sanitized FCC observation; hardware-attested and verified-release claims remain
  unavailable while the V2 simulated candidate remains explicitly labelled.
- [x] Freeze the hackathon demo to the local three-machine simulated FCC mode
  and document that it proves deterministic/fail-closed behavior, not TEE
  confidentiality, registered custody, or a live PayGuard release.
- [x] Publish a hackathon handoff with the exact demo boundary, production-web
  smoke, local validation commands/results, limitations, and pushed commits.
- [x] Record a captioned, wallet-free production walkthrough that excludes
  Policy Studio/private inputs, checks the exact public evidence boundary, and
  remains local/ignored pending owner review and upload.
- [x] Record one solution-3 Coston2 simulated-policy lifecycle with three
  ephemeral in-memory signers, two matching allow evaluations, deterministic
  cap denial, stop/resume/revoke, and vault conservation; keep the evidence
  under `evidence/simulation/` and do not count it as a live FCC lifecycle.
- [ ] Post-hackathon: generate and verify a PayGuard release manifest and
  consumer bindings.
  The V2 source candidate, ignored local build digest, explicit blocker plan,
  promotion runbook, deployment, hosted lifecycle, and lifecycle/outage/
  redemption/user-validation validators are prepared. The live simulated
  candidate remains non-authoritative until the remaining redemption,
  fault-drill, hardware, and consented study evidence passes.
- [x] Post-hackathon: verify runtime bytecode, constructor/wiring, extension ID,
  code/image hash, governance, machines, key fingerprints, and signer mapping
  for the live Coston2 simulated V1 and V2 stacks and their three-machine
  dispatcher. This does not verify a hardware-backed release.
- [ ] Post-hackathon: record live personal recurring-payment, cap-denial,
  emergency-stop, recovery, Smart Account funding, and redemption lifecycles.
- [x] Publish only sanitized public identifiers, hashes, blocks, transactions,
  timings, and assertion booleans; the 2026-08-13 production-corpus audit fetched
  all 26 listed assets, matched every JSON body byte-for-byte to its reviewed
  source, reran the public-field/simulation guards, and remains repository-only
  to avoid recursive evidence publication. The corpus contains 25 chain-114
  records and three explicitly bounded simulation records, with overlapping
  categories.
- [x] Post-hackathon: deploy the authenticated hosted relay, connect the
  production web to registered A/B/D `SIMULATED_TEE` machines, reject a
  client-supplied decision, and pass one complete Coston2 custody/ALLOW/execute/
  cap-denial/governance/conservation run through the public relay origin, then
  promote the active route to the V2 simulated candidate while retaining V1
  rollback metadata.
- [ ] Post-hackathon: promote the hosted V2 simulated candidate to a verified
  hardware-backed release and run the complete production desktop/mobile/
  keyboard matrix against that exact release-bound commit.
- [x] Deploy and audit the separate Interactive Demo contracts/serverless
  actors, publish sanitized simulation evidence, and verify the production web
  lifecycle without treating it as Gate A/B/C or a verified release. The three
  simulation-only contracts, actor registrations, environment bindings, and
  sanitized deployment evidence passed on 2026-08-10. The production API
  rejected a client-supplied decision, the 133.29-second automated testnet
  lifecycle passed, and the landing/Overview/Demo/Policy Studio laptop smoke
  reported no HTTP/console failure, browser storage, or horizontal overflow.

Exit: source, runtime, bindings, UI, docs, and public-safe evidence agree.

### Phase 9 — post-hackathon pilots and distribution

- [ ] Post-hackathon: conduct at least five XRPL-user interviews, five
  treasury/DAO interviews, and five payment-recipient/executor usability
  sessions under the consented validation protocol. Until then, retain the
  explicit zero-session disclosure and do not treat owner acceptance or source
  tests as independent user validation.
- [ ] Post-hackathon: run one personal subscription pilot and one treasury
  recurring-payment pilot.
- [ ] Post-hackathon: measure setup completion, activation time, failed-action
  comprehension, recovery success, and recipient confidence.
- [x] Publish compile-tested, fail-closed SDK examples and an integration guide
  for XRPL wallets and Flare dApps; keep the package private until a verified
  release manifest exists.
- [ ] Post-hackathon: record feedback and product decisions without invented
  traction.
- [x] Prepare explicit post-hackathon audit, FCC liveness-incentive, pricing,
  support/incident, and gated mainnet-readiness plans without claiming those
  activities have run.

Exit: real users have completed real testnet journeys and the next investment is
supported by evidence.

### Phase 10 — post-hackathon production roadmap

- [ ] External security audits and remediation.
- [ ] Mainnet protocol/address re-resolution and a disposable canary release.
- [ ] Hardware-backed multi-operator FCC policy and economic liveness design.
- [x] Implement aggregate-only relay metrics with fixed labels, disabled-by-
  default bearer access, and tests excluding identifiers, decisions, policy
  material, ciphertext, credentials, signatures, and per-request timing.
- [x] Pulled forward before submission: deploy operator-only production
  monitoring with a Railway-managed bearer, origin-bound public health,
  authenticated HTTPS operator routes, 1,440-sample/128-incident bounds, fixed
  alerts, a credential-free incident runbook, and sanitized live evidence in
  `evidence/coston2/production-monitoring.json`.
- [ ] Mainnet FXRP pilot with bounded value, support, incident, and rollback plans.
- [ ] Additional policy primitives only after compatibility and privacy review.

## 5. Product quality bars

- The private rule must solve a real user problem that a public contract cannot.
- All Flare integrations are necessary to one flagship journey.
- A judge or user understands the product in 30 seconds and verifies one action
  in two minutes without a wallet.
- Policy changes are explicit new versions; activated rules never mutate silently.
- Public amounts and transaction graph are disclosed honestly.
- No feature ships without recovery, evidence, privacy, and user-comprehension tests.
