# Protocol and contract specification

> The local V1 ABI/state machine now exists under `packages/contracts/src` and
> is covered by Foundry tests. Its three contracts and vault wiring are verified
> on Coston2 in `evidence/coston2/contracts-deployment.json`. This document does
> not assert registered FCC execution, a complete release, or a production audit.

## 1. Contracts

### `PayGuardPolicyRegistry`

Responsibilities:

- register policy commitments after verifying three machine receipts;
- freeze owner, version, schema, extension, code, machine IDs/key fingerprints,
  custody threshold, result threshold, and policy nonce;
- activate, stop, revoke, and supersede versions under explicit authority;
- expose no ciphertext or policy fields.

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

The separately generated `PayGuardFoundationSender` ABI is a local Gate A
artifact, not part of the verified three-contract Coston2 deployment. Its
canonical request binding is shared with the Go extension through a hard-coded
golden digest. Registration and live result verification remain mandatory
before it can become a release fact.

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
- FTSO/FDC requirement descriptors;
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
and evaluation results uses lower-camel field names. Every `uint256`, bigint,
and `uint64` is an unsigned quoted decimal string so JavaScript never rounds a
digest input through IEEE-754. Decisions and public reason classes use the
canonical names above, not implementation-specific integer codes. Go rejects
numeric JSON bigints, invalid decimal strings, and unknown enums; round trips
must preserve the receipt/request/evaluation digest.

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
- Only the frozen policy owner/governance can stop/revoke/supersede.
- Owner authority cannot manufacture `ALLOW` or bypass result threshold.
- Router cannot transfer an unsupported asset/target/action.
- Executor receives no policy or key and cannot choose decision fields.
- Reentrancy/token failure reverts state and transfer together.
