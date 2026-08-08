# XRP PayGuard — full product execution plan

> Status: local protocol, FCC custody path, and Foundry contract state machine
> are implemented with cross-language/unit tests. The three contracts and vault
> wiring are deployed and runtime/constructor-verified on Coston2; no registered
> FCC result, private live lifecycle, or complete release is verified.

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
- FDC trigger adapters for XRPL Payment, EVMTransaction, and later Web2Json.
- Webhooks/notifications carrying only public-safe state.
- Public evidence API and independent verification CLI.

## 4. Phase gates

### Phase 0 — competition, product, and user discovery

- [ ] Confirm current competition dates, submission mechanics, FCC access, and
  judging requirements with the organizer rather than relying on copied dates.
- [ ] Conduct at least five XRPL-user interviews, five treasury/DAO interviews,
  and five payment-recipient usability sessions.
- [ ] Select the first narrow policy problem and record why private policy
  evaluation is necessary instead of an ordinary public smart contract.
- [ ] Freeze product non-claims, data map, threat model, and one-sentence demo.
- [ ] Record all pre-existing/reused/new work before implementation begins.

Exit: one validated policy journey and one real design partner target exist.

### Phase 1 — pinned official foundations

The checked items below are local reproducibility gates. The dedicated PayGuard
Coston2 development wallet has verified testnet bootstrap funding; stable FCC
origins and the authenticated FCC indexer remain open.

- [x] Pin Node 24, pnpm, Go, Foundry, Solidity, viem, XRPL, and official Flare
  periphery/FCC revisions.
- [x] Add a local fail-closed resolver for official Coston2 protocol addresses
  through the Flare Contract Registry; live reachability remains open.
- [x] Resolve the Coston2 FCC manager and Contract Registry-listed FDC, FTSO,
  FAssets, Smart Account, verifier, and DA addresses through supported sources;
  record block/runtime observations without promoting them to release facts.
- [x] Verify the supported Coston2 faucet page, public Explorer ABI path, and
  their current reachability without committing credentials; the authenticated
  FCC indexer remains a separate open dependency.
- [x] Build the official FCC scaffold unchanged and run its local smoke first.
- [x] Build a digest-pinned reproducible PayGuard FCC image and pass a
  credential-free local three-machine identity/restart/hardening smoke.
- [ ] Obtain three stable HTTPS FCC machine origins and an indexer path without
  committing credentials.
- [x] Add secret, dependency, source-provenance, and release-doc checks.

Exit: every mandatory dependency is pinned and reachable, or product work pauses.

### Phase 2 — FCC private-policy feasibility

The checked items below cover the local ciphertext-only/reference adapter. The
registered Coston2 `PING_V1`, receipt, and evaluation proofs remain open.

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
- [ ] Register a production machine and verify one signed Coston2 `PING_V1`
  result before treating the live FCC path as available.
- [x] Implement ciphertext-only policy ingress and a sealed local policy store.
- [x] Return machine-signed `POLICY_RECEIPT_V1` values bound to policy owner,
  commitment, schema, code version, chain, contracts, machine, and nonce.
- [x] Add a TypeScript public custody-bundle verifier for three frozen receipt
  digests/signatures; registered live receipt evidence remains open.
- [ ] Register three distinct machines and require all-three custody receipts.
- [x] Implement deterministic `EVALUATE_V1` returning only public-safe decision
  fields; prove two matching result signatures in the local adapter.
- [x] Prove replay, wrong owner, wrong commitment, wrong request, wrong code,
  and wrong machine failure locally.
- [ ] Prove supported replacement registration and document that an active
  policy never silently swaps a frozen identity.

Exit: private policy content never enters a public path and registered threshold
machines authorize one domain-bound test action.

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
  `PayGuardActionRouter` contracts with minimal immutable authority.
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
verified on Coston2. External review and registered FCC execution remain open.

### Phase 5 — XRP-native funding and external triggers

- [x] Add a public-only resolver for the XRPL owner's deterministic Flare
  PersonalAccount and memo nonce; live reads remain unverified.
- [x] Encode a bounded `0xFE` `PackedUserOperation` that can target a PayGuard
  vault without accepting a custodial XRPL signer; live Payment/activation
  remains open.
- [x] Build the exact public FDC `XRPPayment` prepare request and ABI encoding
  with source ID, verifier-supplied MIC, and executor `proofOwner`; live
  verifier/MIC/proof submission remains open.
- [x] Add a Coston2-only fail-closed authenticated verifier prepare client with
  strict origin, response bounds, and ABI binding checks; live API credentials,
  request submission, and proof retrieval remain open.
- [x] Add a bounded Coston2 DA reader/parser for the public XRPPayment envelope;
  it binds request/response fields and Merkle-node shape without claiming
  on-chain round finality or cryptographic proof verification.
- [x] Add a runtime-bound Coston2 FDC finality checkpoint for protocol ID,
  relay, finalized state, and non-zero Merkle root; leaf verification remains
  a separate live gate.
- [x] Derive the FDC voting round from the mined request-block timestamp via
  the runtime Relay `getVotingRoundId` calculator; wall-clock and hard-coded
  epoch formulas remain unsupported.
- [x] Add a runtime fee quote and exact `requestAttestation(bytes)` submission
  intent codec; signing, broadcast, receipts, and live request state remain
  open.
- [x] Add an exact direct-mint/`0xFE` with-data call codec bound to parsed
  successful XRPPayment and finalized-round checkpoints; Merkle verification,
  signing, broadcast, and receipt matching remain open.
- [x] Resolve the official runtime `directMintingPaymentAddress()` and reject
  malformed/unavailable Core Vault addresses; live payment remains open.
- [x] Add an integer-only official-field FAssets direct-mint quote calculator
  and injected settings reader; live quote drift, payment, and mint execution
  remain open.
- [x] Add an injected, read-only XRPL API v2 checkpoint reader for validated
  account, ledger, and native-XRP Payment state; wallet signing and live
  funding remain open.
- [ ] Request, retrieve, and verify a real FDC `XRPPayment` proof.
- [ ] Execute Smart Account direct mint/funding and bind payment, user-op hash,
  owner, nonce, asset, amount, executor fee, and PayGuard destination.
- [x] Implement a local fail-closed funding state machine that revalidates the
  operation and expected-payment hashes at every transition, binds accepted FDC
  proof commitment, and requires an exact public direct-mint receipt.
- [ ] Prove public-safe delayed-mint checkpoint/resume and quote, address, nonce,
  proof, operation, or receipt drift rejection against live supported services.
- [x] Add local fail-closed `EVMTransaction` and `XRPPayment` trigger adapters
  over the official request/response fields, with freshness, replay, bounded
  bytes, async-drift, exact-event/payment, and injected-verifier tests.
- [ ] Consume a verified live FDC trigger commitment while atomically advancing
  one canonical PayGuard request on Coston2.
- [ ] Add Web2Json only after source allowlisting, transform/schema pinning, and
  semantic trust are explicit.
- [x] Implement a local official-field FAssets redemption checkpoint model that
  distinguishes request, partial/multi-agent obligations, verified underlying
  payment, and verified collateral default without claiming instant XRP.
- [ ] Execute and verify an official live FAssets redemption/default exit on
  Coston2, including partial fulfillment and destination-tag behavior.

Exit: one XRPL Testnet payment funds a canonical Coston2 PayGuard vault and an
FDC-attested trigger safely advances one request.

### Phase 6 — full application

The checked items describe the local public-safe shell. Wallet flows, hosted
evidence, and live role journeys remain open.

- [x] Build the local laptop-first application shell and standalone landing
  page; hosted deployment and production smoke remain open.
- [x] Build the local Policy Studio with templates, exact public/private
  preview, local validation, schema-checked custody receipt progress, and an
  activation block; live ingress and activation evidence remain open.
- [x] Build the local Accounts/Vaults surface with public balances,
  conservation, emergency state, and recovery copy; wallet deposits and
  withdrawals remain open until a verified provider exists.
- [x] Build the local Schedule/Requests surface with occurrence readiness,
  public threshold decisions, expiry, and recovery; live executor actions
  remain open.
- [x] Build the local Payee view with expected public amount/timing and
  schema-checked receipt status, without policy reveal; live settlement remains
  open.
- [x] Build the local wallet-free Auditor view with policy commitment,
  machine/code binding, FTSO/FDC facts, decision digest, and conservation
  verification; live finalized evidence remains open.
- [x] Build the local Team/Treasury workspace and role-aware public controls;
  no client role can authorize, and live governance remains open.
- [x] Build a strict public notification feed and export with finalized block/time
  facts, domain-separated hashes, and an unavailable UI/report path; hosted feed
  delivery remains open until a verified Coston2 provider exists.
- [x] Make laptop UX primary with responsive/mobile layout, focus states, and
  explicit loading/error/recovery copy; full accessibility and reduced-motion
  review remains open.

Exit: every user role can complete its canonical journey without a mock or
manual database edit.

### Phase 7 — reliability, privacy, and operational hardening

The checked items are automated local gates; live outage drills and external
review remain open.

- [x] Make relay/executor orchestration stateless and recoverable from public
  checkpoints.
- [ ] Run proxy, RPC, FDC, FTSO, indexer, one-machine, and executor outage drills.
- [x] Run full-history secret scans plus browser/network/log/evidence privacy scans.
- [x] Add rate limits, idempotency, health bindings, timeout budgets, and
  competing-executor tests.
- [x] Verify machine replacement for new policies and fail-closed behavior for
  policies bound to unavailable frozen machines.
- [x] Exercise a local fail-closed outage matrix for RPC/registry, FDC, FTSO,
  public-reader states, one-machine relay loss, and executor submission loss;
  live drills remain open.
- [ ] Commission external contract and TEE-path review before production value.

Exit: failure is resumable or explicitly denied, never represented as success.

### Phase 8 — Coston2 release and evidence

- [ ] Generate and verify a PayGuard release manifest and consumer bindings.
- [ ] Verify runtime bytecode, constructor/wiring, extension ID, code/image hash,
  governance, machines, key fingerprints, and signer mapping.
- [ ] Record live personal recurring-payment, cap-denial, emergency-stop,
  recovery, Smart Account funding, and redemption lifecycles.
- [ ] Publish only sanitized public identifiers, hashes, blocks, transactions,
  timings, and assertion booleans.
- [ ] Deploy web, FCC origins, proxy/relay, and evidence endpoint; run production
  desktop/mobile/keyboard smokes against the deployed commit.

Exit: source, runtime, bindings, UI, docs, and public-safe evidence agree.

### Phase 9 — pilots and distribution

- [ ] Run one personal subscription pilot and one treasury recurring-payment pilot.
- [ ] Measure setup completion, activation time, failed-action comprehension,
  recovery success, and recipient confidence.
- [ ] Publish SDK examples and integration guide for XRPL wallets and Flare dApps.
- [ ] Record feedback and product decisions without invented traction.
- [ ] Prepare audit, liveness incentives, pricing, support, and mainnet readiness plans.

Exit: real users have completed real testnet journeys and the next investment is
supported by evidence.

### Phase 10 — production roadmap

- [ ] External security audits and remediation.
- [ ] Mainnet protocol/address re-resolution and a disposable canary release.
- [ ] Hardware-backed multi-operator FCC policy and economic liveness design.
- [ ] Production observability that exposes no private policy material.
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
