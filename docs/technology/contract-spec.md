# Protocol and contract specification

> The local V1 ABI/state machine now exists under `packages/contracts/src` and
> is covered by Foundry tests. Its three contracts and vault wiring are verified
> on Coston2 in `evidence/coston2/contracts-deployment.json`. A separate
> registered Coston2 `SIMULATED_TEE` lifecycle now exercises the V1 contracts,
> but this document does not assert hardware-backed FCC execution, a complete
> release, or a production audit.
> A manager-backed `PayGuardPolicyRegistryV2` is also implemented and tested
> locally, but it has no verified Coston2 deployment or release status.
> The separate XRPL FDC trigger consumer is deployed and binding-verified in
> `evidence/coston2/xrpl-fdc-trigger-deployment.json`. One live proof was later
> consumed into a canonical `Pending` request in
> `evidence/coston2/xrpl-fdc-trigger-pending-2026-08-09.json`; its policy custody
> is simulated and no FCC evaluation or execution is claimed.

## 1. Contracts

### `PayGuardPolicyRegistry`

Responsibilities:

- register policy commitments after verifying three machine receipts;
- freeze owner, version, schema, extension, code, machine IDs/key fingerprints,
  custody threshold, result threshold, and policy nonce;
- activate, stop, revoke, and supersede versions under explicit authority;
- expose no ciphertext or policy fields.

### `PayGuardPolicyRegistryV2` — local release candidate

Responsibilities:

- constructor-freeze the release-resolved official `FlareTeeManager`, extension
  ID, and code hash;
- use the padded official TEE address as canonical machine identity;
- require production status, exact extension, TEE/proxy/initial identity, code
  hash, enabled supported platform, and consistent non-empty machine URL for
  every receipt;
- recover each custody/result signer as the exact frozen official TEE address
  and recheck official state when a result is submitted;
- require the supplied full public-key fingerprint to derive the exact official
  TEE signer in its low 20 bytes and bind the full fingerprint inside the
  TEE-signed receipt/result domain; the current manager getter does not expose
  the full public key, so the signed domain protects the remaining fingerprint
  bytes;
- restrict stop/resume/revoke to the policy owner and expose only an
  administrator global pause for new registration/request/evaluation work;
- permit permanent admin renunciation only while the global pause is off, so
  governance cannot renounce into a permanently paused configuration.

The constructor manager address is not self-authenticating: a future release
manifest must prove it was resolved from the supported Flare source and verify
the deployed constructor/runtime binding. V2 must remain `planned` until then.

### `PayGuardVault`

Responsibilities:

- accept supported public assets;
- account for deposited, available, reserved, spent, withdrawn, and refunded;
- reserve/release exact request amounts under router authority;
- prevent unsupported, rebasing, fee-on-transfer, or callback behavior;
- conserve each asset exactly once across every terminal path.

### `PayGuardActionRouter`

Responsibilities:

- create and freeze canonical action requests;
- capture spend/root/occurrence state and optional FTSO/FDC input;
- dispatch evaluation and track attempt/expiry;
- verify registered distinct threshold signatures;
- execute one supported adapter call atomically with state advancement;
- expose explicit denial, expiry, cancellation, stop, and recovery state.

### `PayGuardFoundationSender`

Responsibilities:

- deploy only on Coston2 and bind once to an exact registry-assigned public
  extension ID;
- choose exactly one machine through the official machine registry;
- construct and dispatch the public `PAYGUARD` / `PING_V1` tuple with exact
  chain, sender, extension, code, nonce, and payload-hash fields;
- expose no evaluation command, policy field, decision input, or fund-moving
  path.

### `PayGuardXrplFdcTrigger`

Responsibilities:

- bind the current `FdcVerification` address through the supported Flare
  Contract Registry boundary and fail closed on runtime drift;
- verify one official `IXRPPayment.Proof` and accept only Coston2 `testXRP`, a
  successful payment, a consumer-owned proof, a fresh timestamp, matching
  received amount, and an exact 32-byte PayGuard request-ID memo;
- derive the same public FDC input commitment as the TypeScript adapter and
  atomically mark both transaction ID and full proof-calldata commitment used;
- call `PayGuardActionRouter.createRequest` in the same transaction, so a
  verifier or router failure rolls replay state back;
- create only a `Pending` request. It has no decision or execution function,
  and the existing two-of-three FCC threshold remains mandatory for `ALLOW`.

This consumer and its real-router integration are locally tested, and its
Coston2 runtime/constructor bindings are independently verified. One validated
XRPL Testnet payment, finalized FDC proof, both replay markers, and the resulting
router `Pending` request are recorded in public-safe Coston2 evidence. The
consumer checks the public payment/request binding only. Private authorization
is a separate deterministic step: the V1 schema freezes attestation/source IDs,
source and receiving address hashes, request-ID memo mode, destination-tag
rule, amount range, maximum age, and exact consumer. Both local evaluators
require a canonical `FDC_TRIGGER_SNAPSHOT_V1` whose proof owner, replay markers,
request ID/hash/status, proof commitment, and payment fields match the policy
and request. Any mismatch yields `FDC_INVALID`. Cross-language vectors and
mutation tests pass; live registered FCC evaluation remains unverified.

### Adapter interfaces

V1 adapters are intentionally narrow:

- FTestXRP/FXRP transfer;
- supported FAssets approval/redeem request, if policy permits;
- selected static EVM targets only after independent review.

No arbitrary call adapter exists in V1.

## 2a. Local V1 implementation boundary

`PayGuardPolicyRegistry`, `PayGuardVault`, and `PayGuardActionRouter` implement
the receipt/binding, conservation, request, threshold, and replay rules in a
local Foundry package. The registry rejects non-canonical schema values and
missing extension/code bindings; the local FCC evaluator rejects a request when
its public spend/balance checkpoints or required FTSO checkpoint do not match
the supplied state. V1 derives a purpose-separated, chain-bound ABI message for
the pinned tee-node `v0.0.24` sign port, then recovers the registered signer
through the Ethereum signed-message wrapper. Raw-digest, wrong-chain,
cross-purpose, and high-S signatures fail closed; the exact convention and
remaining live boundary are recorded in `fcc-attestation-domain.md`. The local
token adapter accepts only explicitly enabled ERC-20-like assets and does not
claim that any Flare reference address is a PayGuard release fact. Local
replacement coverage registers a different machine only for a separately
receipted policy version; the replacement signer is rejected for the old
commitment, whose frozen set is unchanged and fails closed when its threshold
is unavailable.

The separately generated `PayGuardFoundationSender` and locally tested
`PayGuardXrplFdcTrigger` are not among the original three public-state
contracts. The sender is deployed and extension-registered on Coston2 under
independently checked public evidence. The trigger consumer is separately
deployed with independently checked public evidence. Their canonical
request/commitment bindings are protected by hard-coded cross-language golden
digests.
Production machine registration and live result verification remain mandatory
before Gate A can pass.

The V2 candidate preserves the router-facing V1 selectors, so the unchanged
router can call `getPolicy`, `policyStatus`, and `isFrozenSigner` against V2.
Local integration tests prove a result is rejected after the official manager
removes the frozen machine from production status. This does not alter or
upgrade the already deployed V1 registry.

## 2. Schemas

### `POLICY_SCHEMA_V1` — private

Conceptual fields:

- schema/domain version;
- chain, registry, vault, router, owner, policy ID/version;
- asset and reference currency;
- target/action rules;
- fixed, rolling, and calendar caps;
- schedule slots, occurrence limits, cooldown/grace;
- start/end/expiry;
- delegated requester rules;
- FTSO requirement and canonical XRPL FDC trigger descriptor (type/source,
  source/destination hashes, memo/tag rules, amount range, freshness, consumer);
- private salt and one-time submission nonce.

The exact encoding must be canonical, fixed-width where practical, bounded, and
shared by Go/TypeScript fixtures. Plaintext/ciphertext never appears in Solidity.

### `POLICY_RECEIPT_V1` — public

Fields include:

- chain, registry, vault, router, owner;
- policy ID/version/schema and policy commitment;
- extension ID, code version, machine identity/key fingerprint;
- submission nonce, receipt nonce, issued-at, expiry;
- receipt signature.

### `ACTION_REQUEST_V1` — public

Fields include:

- chain, registry, vault, router, policy ID/version;
- request ID, `uint256` nonce, and `uint32` attempt;
- requester, target, action type, asset, amount;
- schedule slot/occurrence;
- spend checkpoint/root and balance checkpoint;
- optional FTSO/FDC descriptor/input commitment;
- created-at, fixed grace deadline, result expiry.

### `EVALUATION_RESULT_V1` — public

Fields include:

- every request-domain field necessary to prevent substitution;
- decision: `ALLOW` or `DENY`;
- public reason class only (`POLICY_DENIED`, `STALE_INPUT`, `MALFORMED`, etc.);
- reserved/execution amount and resulting checkpoint commitment for `ALLOW`;
- result nonce, attempt, issued-at, expiry;
- machine identity and signature.

No private rule, intermediate value, alternate target, or private reason appears.

The public JSON transport for receipts, requests, spend state, FTSO snapshots,
FDC trigger snapshots, and evaluation results uses lower-camel field names.
Every `uint256`, bigint,
and `uint64` is an unsigned quoted decimal string so JavaScript never rounds a
digest input through IEEE-754. Decisions and public reason classes use the
canonical names above, not implementation-specific integer codes. Go rejects
numeric JSON bigints, invalid decimal strings, and unknown enums; round trips
must preserve the receipt/request/evaluation digest.

`FDC_TRIGGER_SNAPSHOT_V1` binds the official attestation/source identifiers,
transaction ID, proof owner and consumer, FDC input and proof commitments,
source/receiving hashes, amount, memo/tag facts, block/time, transaction/proof
consumption markers, request ID, exact `ACTION_REQUEST_V1` hash, and router
status. A policy requiring both FTSO and FDC commits their two checkpoints under
`POLICY_INPUT_V1`; one required input remains its direct commitment. Snapshots
that are absent, unexpected, stale, unconsumed, or inconsistent fail closed.

## 3. Policy lifecycle

```text
None -> Receipted -> Active -> Stopped -> Active
                         |          |
                         v          v
                    Superseded   Revoked
                         \          /
                          -> Closed
```

- `Receipted` requires the exact all-three custody bitmap.
- `Active` accepts requests.
- `Stopped` prevents new requests but permits safe settlement/recovery rules.
- `Superseded` points to a separately receipted version.
- `Revoked/Closed` never reactivates without a new version.

## 4. Request lifecycle

```text
Created -> Frozen -> EvaluationPending -> Allowed -> Executed
                          |                 |
                          +-> Denied        +-> Expired/Recovered (only before execute)
                          +-> Expired
```

Terminal states are unique. `Executed` cannot transition. A denied/expired
request cannot reuse the same nonce. Retry uses a new attempt under the fixed
grace rules and identical frozen inputs where required.
Request creation is permissionless and therefore never reserves owner funds.
The router reserves the exact amount only in the same transaction that reaches
the two-machine `ALLOW` threshold; pending and deny paths cannot lock balance.
Cancel/expiry releases only an already allowed reservation.
An expired `execute` reverts without pretending to finalize a payment; the
permissionless `expire` transition records `Expired` and releases the reserve.

`SPEND_CHECKPOINT_V1` has one canonical genesis per exact policy commitment:
`keccak256(abi.encode(SPEND_CHECKPOINT_V1, policyCommitment, uint32(0)))`.
Each allowed transition hashes the same domain tag, prior checkpoint, request
hash, amount, next occurrence, and canonical evaluation time. The FCC evaluator
rejects a caller-chosen genesis or a non-sequential occurrence. The router
recomputes the exact signed transition, requires denied results to preserve the
prior checkpoint, and rechecks the current checkpoint, occurrence, and
monotonic accounting time at execution. Two requests created against one
snapshot therefore cannot both execute.

## 5. Result digest

The exact hash must cover at minimum:

```text
chainId
policyRegistry
vault
actionRouter
extensionId
codeVersion
policyId
policyVersion
policyCommitment
requestId
requestNonce
requestHash
requester
target
actionType
asset
amount
scheduleSlot
occurrence
spendCheckpoint
balanceCheckpoint
ftsoOrFdcInputCommitment
decision
publicReasonClass
resultNonce
attempt
fixedGraceDeadline
expiry
```

Signatures use the pinned tee-node sign-port behavior, PayGuard purpose prefix,
chain ID, and registered signer mapping. The local fixture proves byte equality;
registered Coston2 signer recovery remains a separate live gate.

Machine identity and key fingerprint are verified signer metadata, but are not
included in the shared evaluation digest. This is intentional: two distinct
registered machines must sign one identical decision digest for a threshold
result. The router verifies each signature against the frozen machine/key
mapping before counting distinct signers.

## 6. Deterministic policy evaluation

- Checked integer/fixed-point math only.
- UTC timestamps/slots from canonical chain state; no local timezone.
- Explicit inclusive/exclusive boundary definitions.
- `SCHEDULE_WINDOW_V1` derives the inclusive window
  `[startAt + (occurrence - 1) * interval, slot + grace]`. Occurrence is
  one-indexed `uint32`; timestamps are checked `uint64`; interval and grace are
  positive; grace must be strictly less than interval; any overflow denies.
- `POLICY_SCHEMA_V1` binds `scheduleIntervalSeconds` and
  `scheduleGraceSeconds`. Both zero selects ad-hoc mode and requires public
  `scheduleSlot == 0`. Otherwise evaluation requires the exact derived slot,
  `createdAt` and canonical evaluation time inside the inclusive window, and
  `graceDeadline == expiry == slot + grace`. A window past policy `endAt`
  denies. All comparisons use UTC chain timestamps only.
- Reference-value conversion binds feed, decimals, timestamp, freshness, and
  documented rounding direction.
- `REFERENCE_VALUE_V1` computes `ceil(amount * price / 10**decimals)` with
  `amount`/`price` restricted to `uint256`, a strictly positive price,
  decimals in `[0, 36]`, and a checked product. The implementation uses
  quotient/remainder rounding so it never adds `scale - 1` near the uint256
  boundary.
- Deny overrides allow when multiple rules conflict.
- Delegated requester authority defaults to owner-only. `allowRequesters` adds
  explicit delegates; an empty list never means public authorization. Delegates
  remain subject to the same target, action, schedule, occurrence, balance, and
  value-cap rules as the owner.
- `POLICY_COMPOSITION_V1` resolves a private evaluator's violation bitmask in
  this fixed order: policy time/schedule window, target, requester, action,
  occurrence, cooldown, available balance, required FTSO input, then value caps.
  Zero allows; any unknown bit fails closed as `MALFORMED`. Solidity contains only this
  bitmask reference, never policy fields or intermediate values.
- Unknown schema/rule/action/input denies.
- Available balance and action amount must fit `uint256`. Cap accumulation uses
  unbounded intermediate math followed by the exact cap comparison, so
  `maxUint256 + 1` cannot wrap into an allowance. Cooldown addition is checked
  in the `uint64` time domain; overflow remains an active cooldown and denies.
- Missing, stale, negative, zero, overflowed, or inconsistent oracle/proof input
  denies or pauses; never falls back.
- Calendar and rolling windows use canonical history/checkpoint data.
- `SPEND_WINDOW_V1` defines a UTC calendar day as `[dayStart, now]` and a
  sliding rolling window as `(now - rollingWindowSeconds, now]`. Ordered history
  is capped at 4,096 entries; future/unordered/non-positive entries and checked
  `uint256` sum overflow deny.
- `SpendStateV1` never accepts caller-declared daily or rolling totals. It
  carries ordered public requests, their canonical accounting times, and the
  exact FTSO snapshots required by those requests. Each FCC evaluator replays
  every transition from the policy-derived genesis, recomputes historical
  reference values, requires the final checkpoint/count/time to equal current
  chain state, and only then derives cap totals. Missing, reordered, altered,
  oversized, or snapshot-drifted history fails closed.

## 7. Conservation and authorization invariants

- `deposited = available + reserved + spent + withdrawn + refunded` per vault/asset.
- One request reserves/executed amount at most once.
- In V1, the frozen policy owner or administrator can stop/resume/revoke. The
  V2 candidate narrows individual lifecycle authority to the owner; governance
  can only toggle a global pause for new work.
- Owner authority cannot manufacture `ALLOW` or bypass result threshold.
- Router cannot transfer an unsupported asset/target/action.
- Executor receives no policy or key and cannot choose decision fields.
- Reentrancy/token failure reverts state and transfer together.
