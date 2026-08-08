# Target architecture

> Status: the local protocol, FCC custody/adapter, relay, web shell, and
> registry/vault/router interfaces are implemented and tested. Live addresses,
> registered machines, and deployment wiring remain design targets until a
> verified PayGuard release.

## 1. System model

```text
XRPL wallet                        Flare / Coston2 public state
    |                                         |
    | Payment / mint / 0xFE commitment        |
    v                                         v
FDC request -> voting round -> proof -> Smart Account / PersonalAccount
                                                   |
                                                   v
Browser Policy Studio -- ciphertext only --> Private ingress gateway
      |                                      /       |       \
      |                                     TEE A   TEE B   TEE C
      |                                      \ sealed policy /
      |                                       signed receipts
      v                                              |
PayGuardPolicyRegistry <-----------------------------+
      |
      +--> PayGuardVault (public asset/balance/reservations)
      |
      +--> PayGuardActionRouter (requests/checkpoints/execution)
                  |
                  +--> FCC evaluation dispatch/result threshold
                  +--> FTSO reference-value snapshot, when required
                  +--> FDC external trigger proof, when required
                  +--> public transfer / allowlisted contract adapter
```

## 2. Components

### Policy Studio

Canonicalizes policy input in memory, displays the public/private boundary,
encrypts independently to three machine keys, verifies receipts, and submits
only commitment plus receipts. It never stores plaintext/ciphertext and cannot
authorize an action.

### Private ingress

Authenticates the policy owner/request domain, rate-limits transport, forwards
opaque ciphertext to the exact frozen machine origin, and returns the raw
machine-signed public receipt. It does not decrypt, score, persist plaintext, or
become a correctness authority.

### FCC extension

Maintains sealed policy state keyed by full domain and machine identity. It
validates canonical schemas, commitment, nonce, owner authorization, and replay;
then evaluates frozen public request/checkpoint inputs. It returns only a public
receipt or minimal decision result.

### PolicyRegistry

Records owner, policy commitment/version, schema, extension, code version,
three machine identities/key fingerprints, receipt bitmap, threshold,
activation/revocation state, and policy nonce. No ciphertext is accepted.

### Vault

Holds supported public assets, tracks available/reserved/spent/refunded totals,
and transfers only through router-defined atomic authorization. Owner recovery
cannot race an in-flight authorized request.

### ActionRouter

Creates canonical requests, captures spend checkpoint and optional FTSO/FDC
input, dispatches evaluation, verifies threshold results, and atomically advances
nonce/history/conservation with the action. No client-supplied decision exists.

### Relay/executor

Permissionlessly advances public asynchronous checkpoints. It has no policy
decryption key or authorization override. A fresh process must reconstruct work
from finalized state. The HTTP surface is bound to one exact public
chain/registry/vault/router domain, applies bounded per-socket rate and
concurrency budgets, and coalesces only identical in-flight public work. These
ephemeral controls are not replay authority and never replace canonical chain
state. Liveness health reports dependency readiness as unprobed until a live
checker verifies the registered machines.

### Public reader and Auditor

Reads one finalized Coston2 checkpoint and renders public policy commitment,
machine/code binding, request, input proofs, decision digest, execution, and
conservation. It never fetches private ingress payloads.

### Public notifications and export

Notifications are derived only from finalized public checkpoints. Each event
has a fixed kind/severity, an opaque event ID, one public reference hash, and a
request ID only for request events; free-form policy text, amounts, targets,
signatures, ciphertext, and private denial reasons are not part of the wire.
The feed is bounded, deduplicated, sorted deterministically, and committed by
a domain-separated feed hash. Exports carry the same public events and an
independent export hash, or an explicit unavailable reason with an empty feed.
The web tray never fabricates an event when RPC/indexer state is unavailable.

## 3. Public and private data

| Data | Visibility |
|---|---|
| Owner, vault, asset, funded/available/reserved/spent balances | Public |
| Policy ID, version, commitment, schema, activation/revocation | Public |
| Extension, code version, TEE IDs, key fingerprints, thresholds | Public |
| Policy rules, target groups, internal caps/schedules/relationships | Private in intended TEEs |
| Policy ciphertext | Private transport/sealed state; never public/persistent in browser |
| Policy receipt commitment/signatures/bitmap | Public |
| Requested target, asset, amount, timing, action type | Public |
| FTSO/FDC checkpoint and spend-state commitment | Public |
| Minimal `ALLOW`/`DENY`, digest, signers, expiry | Public |
| Private denial rule/intermediate policy evaluation | Private |
| Executed transfer/call and transaction graph | Public |
| Wallet/TEE keys, XRPL seed, proxy/indexer credentials | Never collected or published |

Privacy benefit: internal authorization rules remain confidential. PayGuard does
not hide the public action or provide unlinkability.

## 4. Policy custody and threshold model

- Policy activation requires receipts from all three policy-fixed machines.
- Every accepted machine must bind the same owner, policy commitment, version,
  contracts, code, and key fingerprint.
- Every evaluation is independently recomputed by the selected machines.
- Execution requires two distinct matching registered identities over the exact
  result digest.
- One result endpoint may fail after all-three policy custody; two consistent
  surviving machines can still authorize/deny.
- Losing two policy-fixed machines fails closed for that policy.
- Replacement registration serves new policy versions. An active policy never
  silently changes its frozen set.

## 5. Canonical spend state

The chain, not the browser or TEE store, is rollback/replay authority. Each
request binds:

- policy version and request nonce;
- vault balance/reservation state;
- rolling/calendar spend checkpoint or history root;
- occurrence/schedule slot;
- previous execution root;
- optional FTSO/FDC input;
- attempt and expiry.

FCC verifies that supplied/read state equals the frozen public checkpoint. The
router atomically executes and advances the next root. A stale TEE snapshot can
deny or fail, but cannot authorize against an old spend window.
The initial root is domain-separated from the exact policy commitment and
occurrence zero; it is never caller-selected. Execution revalidates the stored
root/next occurrence after threshold approval, closing the race between two
requests evaluated from the same snapshot.
Public `SpendStateV1` carries ordered executed requests and their canonical
accounting times, not caller-asserted aggregate totals. For FTSO-denominated
policies, each history entry also carries the request-bound public snapshot.
Every machine independently replays the root and derives UTC calendar/rolling
totals; any history or snapshot drift denies.

## 6. Funding architecture

### EVM recovery/developer path

An EVM wallet approves and deposits supported FTestXRP directly. This is useful
for development/recovery, not the flagship XRPL-native story.

### XRPL-native path

The XRPL owner commits a Smart Account operation in a supported Payment/mint
flow. FDC proves the exact payment, the controller resolves the PersonalAccount,
and the operation deposits into PayGuard. Only public transaction/checkpoint
data is retained; the owner signs in its XRPL wallet.
The local funding model keeps separate domain hashes for the expected XRPL
payment and Smart Account operation, recomputes both after every asynchronous
checkpoint, seals the public transition fields in a state-checkpoint hash, and
binds execution to the accepted FDC response commitment. A
direct-mint success is accepted only from an exact public receipt matching all
owner/account/destination/asset/value/fee/nonce/operation fields. Live supported
service execution remains unverified.

### FAssets exit

The local exit model hashes the exact `redeemAmount` or `redeemWithTag` intent,
then validates the Asset Manager transaction receipt and each public
`RedemptionRequested` obligation. A partial redemption retains the unredeemed
amount, and multiple agents remain separate request legs. A request is only
pending: underlying payment requires a verifier-backed `RedemptionPerformed`
event, while timeout compensation is recorded separately from a verifier-backed
`RedemptionDefault` event. Both terminal paths bind their public receipt
commitment and fail closed on replay or asynchronous drift. Live Coston2
redemption remains unverified.

### Recurring execution

The owner pre-funds a PayGuard vault. A permissionless executor may request an
eligible scheduled occurrence, but cannot choose target/amount outside the
public request domain and cannot execute without threshold FCC authorization.
The private policy fixes a UTC interval and non-overlapping grace duration.
Occurrence one starts at `startAt`; every later slot is derived with checked
integer arithmetic. Ad-hoc policies explicitly use interval/grace/slot zero.

### FDC external triggers

Local `EVMTransaction` and `XRPPayment` adapters mirror the official public
request/response fields and accept a trigger only after an injected verifier
returns a non-zero canonical proof commitment. Exact request, success status,
addresses/hashes, amount or value, memo/input/events, voting round, block, and
freshness are sealed into a domain-separated input commitment. Dynamic bytes
are bounded and that commitment is recomputed after the asynchronous verifier
call to reject in-memory proof drift. Local replay sets are preflight guards;
the Coston2 consumer must atomically consume the transaction and commitment in
canonical state. That live path is not yet verified, and Web2Json is not
implemented.

### Official Flare dependency resolution

The integration layer reads Coston2 protocol addresses through Flare's
Contract Registry at runtime. FDC, FTSO, FAssets, Smart Account, Relay, and
systems-manager names are allowlisted; RPC errors, unsupported names, and
zero/invalid responses fail closed. The resolver records no credentials and
does not turn a runtime lookup into a PayGuard deployment or release manifest.

## 7. Recovery

- Browser loss: recover public state; re-enter unpublished private drafts.
- Relay/executor loss: fresh process resumes finalized public checkpoints.
- FDC delay: persist only public transaction/round/proof checkpoint and resume.
- FTSO stale/unavailable: deny/pause only policies requiring that feed.
- One TEE result loss: use the remaining threshold if policy custody was common.
- TEE replacement: new policies/versions use registered replacements; old
  policy remains frozen or owner uses explicit safe withdrawal after grace.
- Policy loss/unavailability: never synthesize approval; allow bounded owner
  recovery that cannot steal an already executed/reserved payment.
- Hosted UI loss: contracts, executor, CLI, and public evidence remain usable.

## 8. Deployment topology

Target services:

- three independently registered FCC machine/proxy HTTPS origins;
- one optional ciphertext-only ingress facade with strict machine binding;
- stateless executor/relay service;
- static web app;
- optional public-safe indexer/evidence API;
- Coston2 contracts and official protocol dependencies.

Stable origins, pinned images, independent identities, explicit health binding,
and secret-separated environments are required. Quick tunnels, shared machine
keys, browser-shipped API credentials, or proxy fallback to a mock are forbidden.
