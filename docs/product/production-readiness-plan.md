# Audit, operations, pricing, and mainnet readiness plan

## Status and scope

Everything in this document is **planned**. It records the work required after
the hackathon; it is not evidence of an audit, operator agreement, paid usage,
support SLA, production FCC deployment, or mainnet readiness. The current
hackathon boundary remains a local three-machine `SIMULATED_TEE` demonstration,
public Coston2 observations, and a static Vercel shell.

The plans below preserve the V1 invariant: three frozen compatible machines
hold every canonical policy and two matching machine evaluations are required
for execution. No incentive, support action, administrator, or degraded mode
may supply or override `ALLOW`.

## 1. Independent security review

### Review packages

| Package | Required review | Exit artifact |
|---|---|---|
| Solidity | authorization domain, threshold signatures, replay/rollback, accounting conservation, pause/recovery, adapter allowlists, FAssets exit | version-bound report, remediation commits, invariant/fuzz rerun |
| FCC Go extension | private ingress, receipt/result signing, identity/code binding, policy custody, restart/replacement, log and output privacy | image/source digest-bound report and replacement drill |
| Relay and indexer | authentication, bounded parsing, quorum collection, reorg/restart recovery, rate limiting, secret handling | deployment-config review and outage/replay test record |
| XRPL/Flare adapters | FDC finality/proof verification, FTSO freshness, Smart Account nonce/value binding, FAssets settlement/default | deterministic fixtures plus live bounded-value evidence |
| Web and operations | browser persistence, dependency/supply chain, CSP/headers, role separation, evidence sanitization, incident handling | privacy/security test report and reviewed runbooks |

### Sequence

1. Freeze one release candidate with source, dependency lock, runtime bytecode,
   bindings, container image, and machine/code configuration digests.
2. Complete an internal line-by-line review and close all known correctness,
   privacy, and operational gaps before paying for an external review.
3. Commission independent contract and confidential-compute path reviews. Give
   reviewers the threat model, invariants, deterministic cross-language
   fixtures, deployment plan, and a reproducible test environment.
4. Record each finding without secrets, remediate it in a focused commit, and
   have the reviewer retest affected boundaries.
5. Cut a new candidate after remediation; never reuse the pre-remediation
   release manifest or machine code digest.

Production value remains blocked while a critical or high-severity finding is
open. Medium and lower findings require an explicit owner, decision, deadline,
and bounded residual-risk acceptance. A report without runtime/wiring and FCC
deployment coverage does not satisfy this gate.

## 2. FCC liveness and operator incentives

### Initial operating model

- Use three independently administered hardware-backed FCC machines across
  distinct failure domains. Independence and hardware attestation must be
  verified; three processes on one host do not qualify.
- Require all three valid ingress receipts before activation and two matching
  evaluations for an action. One unavailable evaluator may reduce redundancy;
  two unavailable evaluators fail closed.
- Keep result collection permissionless where practical, but authenticate
  private ingress and indexer access. Operator credentials stay outside source,
  browsers, evidence, and logs.
- Use the supported replacement-registration process for a lost identity.
  Existing policies remain frozen; migration requires a visible new policy
  version and fresh three-machine custody.

### Incentive hypothesis to validate

Operator compensation should combine a fixed availability payment with a
metered component for valid custody/evaluation service. Payment is earned from
public-safe service measurements, never from an `ALLOW` result. Candidate
measurements are signed `PING` availability, valid receipt latency, valid
result latency, version compliance, and successful scheduled replacement
drills. An operator receives no credit for malformed, stale, mismatched, or
privacy-leaking output.

Bonding, slashing, token issuance, and permissionless operator admission are
not selected for V1. They require Sybil/collusion analysis, enforceable
measurement, legal review, and evidence that their complexity improves
liveness. The first design-partner deployment should use contracted operators,
bounded service credits, and explicit rotation procedures instead of an
unverified cryptoeconomic claim.

Before pricing operator service, run a testnet soak that measures request
volume, p50/p95 receipt and evaluation latency, false-unavailable rate,
replacement time, storage growth, network transfer, and operator labor. Those
measurements—not invented traffic—set capacity and compensation.

## 3. Pricing experiments

Pricing is a product hypothesis, not current traction or revenue.

### Candidate model

- Testnet/design-partner tier: no product fee, disposable assets only, no SLA.
- Production tier: organization subscription for policy workspace, audit
  export, and support, plus metered confidential evaluations above an included
  allowance.
- Pass through chain/FDC/FAssets fees transparently. PayGuard never hides public
  XRP/FXRP amounts, recipient, timing, or network fees.
- Never charge for a favorable decision, sell a bypass, weaken a threshold, or
  monetize private policy contents.

Cost inputs are audited infrastructure, three independent FCC operators,
RPC/verifier/indexer service, monitoring, incident response, support, external
review amortization, and public transaction fees. Before selecting prices,
interview both individual subscription users and treasury operators, then test
willingness to pay with a non-binding design-partner proposal. Record sample
size, script, responses, rejection reasons, and decisions. Do not publish
conversion, revenue, or demand claims until those events actually occur.

## 4. Support and incident response

### Severity and response objectives

| Severity | Example | Immediate action |
|---|---|---|
| SEV-0 | suspected key/policy exposure, unauthorized execution, accounting loss | pause affected public execution, preserve public-safe evidence, rotate exposed credentials, engage incident and security owners |
| SEV-1 | two-machine loss, finality/proof integrity failure, persistent accounting drift | fail closed, stop new activations/execution, establish canonical chain checkpoint, start recovery runbook |
| SEV-2 | one-machine loss, degraded RPC/indexer, delayed evidence | surface degraded state, preserve threshold rules, repair or replace without silent policy migration |
| SEV-3 | non-security UI/docs/support defect | track, communicate scope, fix through ordinary release process |

Target response times and any SLA remain unset until the team has staffing,
operator contracts, on-call coverage, and measured incident load. A support
promise must name the timezone/coverage, escalation owner, communication
channel, and compensation terms before it is sold.

Incident records may contain addresses, transaction hashes, blocks, public
commitments, timings, and assertion booleans. They must not contain policy
plaintext/ciphertext, XRPL seeds, EVM/FCC keys, API credentials, raw signatures,
or private-policy-derived descriptive text. Support staff cannot manually mark
an action allowed or edit canonical checkpoints.

Required runbooks cover credential compromise, one/two/three machine loss,
machine replacement, RPC/FDC/FTSO/FAssets outage, reorg, stuck transaction,
accounting mismatch, emergency stop, evidence corruption, and release rollback.
Every runbook needs a scheduled test and a sanitized outcome record.

## 5. Mainnet readiness gates

Mainnet is a fresh release process, not a network-ID switch from Coston2.

### M0 — audited candidate

- External reviews and remediation are complete for the exact candidate.
- Deterministic fixtures, unit/integration tests, fuzz/invariants, privacy,
  secret, binding-drift, container reproducibility, and outage drills pass.
- Governance, signer separation, emergency stop, replacement, and incident
  ownership are assigned and rehearsed.

### M1 — fresh resolution and disposable canary

- Re-resolve every mainnet protocol address, feed, ABI, fee, FAsset, Smart
  Account dependency, and supported FCC version from official runtime sources.
- Deploy fresh contracts and machines; independently verify runtime bytecode,
  wiring, extension/code/image hash, machine/key mapping, and `PING` results.
- Run a disposable no-value canary and publish only sanitized evidence tied to
  the exact release manifest.

### M2 — bounded-value pilot

- Enroll named design partners under written support and incident boundaries.
- Apply small per-policy, per-window, and global value caps plus an explicit
  stop condition. Use only assets and actions reviewed for the candidate.
- Exercise funding, allow, deny, expiry, cancellation, emergency stop,
  replacement, redemption, default, restart recovery, and evidence export.
- Reconcile on-chain conservation and operator observations after every pilot
  window. Any unexplained mismatch stops expansion.

### M3 — controlled expansion

Expand value, users, or policy primitives only after the bounded pilot's
security, reliability, comprehension, support load, and unit economics are
reviewed. Each new asset/action or policy primitive reopens compatibility,
privacy, threat-model, test, audit, and release-manifest gates.

## Decision and evidence ledger

For each completed activity, append a dated record that names the owner,
candidate/release digest, method, actual sample or runtime, raw public-safe
measurements, limitations, decision, and follow-up. Until such records exist,
the corresponding claims remain `planned` or `not yet verified`.
