# Protocol and contract specification

> The local V1 ABI/state machine now exists under `packages/contracts/src` and
> is covered by Foundry tests. This document remains the canonical design and
> does not assert a Coston2 deployment or production audit.

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
the supplied state. V1 uses raw `ecrecover` over the shared digest because a
live FCC signing-prefix convention has not yet been verified; the release gate
must verify that convention before deployment. The local token adapter accepts
only explicitly enabled ERC-20-like assets and does not claim that any Flare
reference address is a PayGuard release fact. Local replacement coverage
registers a different machine only for a separately receipted policy version;
the replacement signer is rejected for the old commitment, whose frozen set is
unchanged and fails closed when its threshold is unavailable.

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
- request ID/nonce/attempt;
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
rechecks the current checkpoint and occurrence at execution, so two requests
created against one snapshot cannot both execute.

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

Signatures use the current FCC-supported prefix/domain and registered signer
mapping. A generic EIP-191 assumption is not accepted without live verification.

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
- Reference-value conversion binds feed, decimals, timestamp, freshness, and
  documented rounding direction.
- `REFERENCE_VALUE_V1` computes `ceil(amount * price / 10**decimals)` with
  `amount`/`price` restricted to `uint256`, a strictly positive price,
  decimals in `[0, 36]`, and a checked product. The implementation uses
  quotient/remainder rounding so it never adds `scale - 1` near the uint256
  boundary.
- Deny overrides allow when multiple rules conflict.
- `POLICY_COMPOSITION_V1` resolves a private evaluator's violation bitmask in
  this fixed order: policy time window, target, requester, action, occurrence,
  cooldown, available balance, required FTSO input, then value caps. Zero allows;
  any unknown bit fails closed as `MALFORMED`. Solidity contains only this
  bitmask reference, never policy fields or intermediate values.
- Unknown schema/rule/action/input denies.
- Missing, stale, negative, zero, overflowed, or inconsistent oracle/proof input
  denies or pauses; never falls back.
- Calendar and rolling windows use canonical history/checkpoint data.

## 7. Conservation and authorization invariants

- `deposited = available + reserved + spent + withdrawn + refunded` per vault/asset.
- One request reserves/executed amount at most once.
- Only the frozen policy owner/governance can stop/revoke/supersede.
- Owner authority cannot manufacture `ALLOW` or bypass result threshold.
- Router cannot transfer an unsupported asset/target/action.
- Executor receives no policy or key and cannot choose decision fields.
- Reentrancy/token failure reverts state and transfer together.
