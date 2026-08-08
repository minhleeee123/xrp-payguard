# XRP PayGuard — full product execution plan

> Status: local protocol, FCC custody path, and Foundry contract state machine
> are implemented with cross-language/unit tests. No live Coston2 deployment,
> registered FCC result, or release evidence is verified; every live capability
> remains planned until its phase gate passes.

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

The checked items below are local reproducibility gates. Official endpoint
resolution, three stable FCC origins, and funded live access remain open.

- [x] Pin Node 24, pnpm, Go, Foundry, Solidity, viem, XRPL, and official Flare
  periphery/FCC revisions.
- [ ] Resolve Coston2 FCC manager, registries, FDC, FTSO, FAssets, Smart Account,
  verifier, DA, RPC, faucet, and explorer through supported sources.
- [x] Build the official FCC scaffold unchanged and run its local smoke first.
- [ ] Obtain three stable HTTPS FCC machine origins and an indexer path without
  committing credentials.
- [x] Add secret, dependency, source-provenance, and release-doc checks.

Exit: every mandatory dependency is pinned and reachable, or product work pauses.

### Phase 2 — FCC private-policy feasibility

The checked items below cover the local ciphertext-only/reference adapter. The
registered Coston2 `PING_V1`, receipt, and evaluation proofs remain open.

- [ ] Implement a minimal `PING_V1` foundation and verify one registered Coston2
  result before policy code.
- [x] Implement ciphertext-only policy ingress and a sealed local policy store.
- [x] Return machine-signed `POLICY_RECEIPT_V1` values bound to policy owner,
  commitment, schema, code version, chain, contracts, machine, and nonce.
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

Codec/evaluator checks marked here are local cross-language coverage; full
Solidity policy composition and live machine-domain verification remain open.

- [x] Freeze `POLICY_SCHEMA_V1`, `POLICY_RECEIPT_V1`, `ACTION_REQUEST_V1`,
  `SPEND_CHECKPOINT_V1`, and `EVALUATION_RESULT_V1`.
- [ ] Implement fixed-point value conversion and policy composition with shared
  Go/Solidity/TypeScript golden vectors.
- [ ] Implement recurring slots, rolling windows, target rules, occurrence
  limits, delegated allowances, expiry, and deny precedence.
- [ ] Define deterministic tie/conflict rules: explicit deny outranks allow;
  malformed, unknown, stale, or unavailable input denies.
- [ ] Add range, rounding, overflow, time-boundary, timezone-independent,
  permutation, and concurrency suites.

Exit: all implementations agree for every golden vector and no subjective/AI
branch exists.

### Phase 4 — contracts, vault, and atomic execution

The checked items are the local Foundry state-machine gate. Deployment,
external review, and live protocol wiring remain open.

- [x] Implement non-upgradeable `PayGuardPolicyRegistry`, `PayGuardVault`, and
  `PayGuardActionRouter` contracts with minimal immutable authority.
- [x] Commit policy hash plus frozen machine/key/code policy after all-three
  receipts; never publish ciphertext.
- [x] Implement deposit, request, evaluate, execute, deny, expire, revoke,
  emergency stop, and withdrawal state transitions.
- [x] Require two distinct registered signers over one exact evaluation digest.
- [x] Advance spend checkpoint, occurrence count, request nonce, and transfer in
  one atomic transaction; reject duplicate or partial execution.
- [x] Restrict V1 actions to an explicitly supported FTestXRP-like transfer;
  arbitrary calls remain disabled and the adapter still needs independent audit.
- [x] Add unit, reentrancy, token-failure, and conservation tests. Fuzz/invariant
  and external review remain open.

Exit: a local multi-policy state machine cannot overspend, replay, partially
execute, or bypass FCC authorization.

### Phase 5 — XRP-native funding and external triggers

- [ ] Derive the XRPL owner's Flare PersonalAccount and nonce.
- [ ] Build a `0xFE` operation that funds/activates a PayGuard vault without a
  custodial XRPL signer.
- [ ] Request, retrieve, and verify a real FDC `XRPPayment` proof.
- [ ] Execute Smart Account direct mint/funding and bind payment, user-op hash,
  owner, nonce, asset, amount, executor fee, and PayGuard destination.
- [ ] Support public-safe delayed-mint checkpoint/resume and reject quote,
  address, nonce, or commitment drift.
- [ ] Add `EVMTransaction` and XRPL Payment trigger adapters. Add Web2Json only
  after source allowlisting and semantic trust are explicit.
- [ ] Implement official FAssets redemption as an exit, without claiming an
  instant underlying XRP payout.

Exit: one XRPL Testnet payment funds a canonical Coston2 PayGuard vault and an
FDC-attested trigger safely advances one request.

### Phase 6 — full application

The checked items describe the local public-safe shell. Wallet flows, hosted
evidence, and live role journeys remain open.

- [x] Build the local laptop-first application shell; a standalone hosted
  landing page remains open.
- [ ] Build Policy Studio with templates, exact public/private preview, local
  validation, receipt progress, and activation evidence.
- [ ] Build Accounts/Vaults with public balances, deposits, withdrawals, caps,
  and emergency state.
- [ ] Build Schedule/Requests with occurrence readiness, executor actions,
  decisions, expiry, and recovery.
- [ ] Build Payee view with expected public amount/timing and receipt status,
  but no policy reveal.
- [ ] Build wallet-free Auditor view with policy commitment, machine/code
  binding, FTSO/FDC facts, decision digest, and execution conservation.
- [ ] Build Team/Treasury workspace and role-aware permissions.
- [ ] Build notifications and export without confidential payloads.
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
