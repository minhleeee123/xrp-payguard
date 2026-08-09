# Product discovery and claim freeze

Status: **hypothesis frozen; user validation not run** (2026-08-09).

This document freezes the first PayGuard problem statement and the data/claim
boundary used by the implementation. It is not evidence of interviews,
traction, a partner, or production readiness.

## One-sentence demo

An XRPL owner funds a public Flare vault, keeps recurring-payment rules inside
three registered FCC machines, and lets two matching machines authorize one
public payment without revealing the private policy rules.

## First narrow problem

Start with **bounded recurring subscriptions and vendor allowances for an
XRPL-native individual or treasury**. The owner needs a public, auditable
payment and settlement trail, but does not want internal caps, schedule/grace
windows, target relationships, or delegated-spender rules exposed before an
action is requested.

This is a product hypothesis, not a validated demand claim. The first target
design-partner profile is an XRPL-native treasury or subscription operator that
currently relies on repeated manual approvals or a custodial automation script.
No named partner or interest is claimed.

## Why a public contract alone is insufficient

A public contract can enforce a public allowance, but it exposes the allowance
rules and all policy relationships needed to reproduce the decision. A hosted
custodian can keep those rules private, but it introduces a unilateral operator
that can decide or hold keys. PayGuard separates the roles: the public chain
holds the commitment and action state, while a fixed FCC set independently
evaluates the sealed policy and the router accepts only the required threshold.

The resulting transfer remains public. PayGuard is not private money, a mixer,
an anonymity system, or a truth oracle for an allowlisted Web2 source.

## Data map

| Data | Browser | FCC machines | Public chain/evidence | Never collected |
|---|---|---|---|---|
| Policy draft/rules, target groups, caps, schedule relationships | in-memory only until encryption | sealed policy state | no | — |
| Policy ciphertext | transient upload buffer only | addressed sealed ingress/state | no | browser persistence, logs, calldata, events |
| Policy commitment/version and receipt metadata | verified before submit | signed receipt output | yes | policy plaintext |
| Request, amount, target, timing, checkpoint, decision digest | public request UI | evaluation input | yes | private denial rationale |
| Balances, transfers, redemption requests, blocks, transaction IDs | public reader | public state input | yes | — |
| XRPL/EVM/FCC private keys, credentials, signatures forbidden by policy | no | injected machine/wallet boundary only | no | source, evidence, browser, logs |

## Validation record

- XRPL-user interviews: **0 / 5**
- Treasury/DAO interviews: **0 / 5**
- Recipient/executor usability sessions: **0 / 5**
- Design-partner pilot: **not started**
- Organizer confirmation of current competition mechanics/FCC access: **not
  confirmed**

No conversion, traction, partnership, or usability result is inferred from the
local shell or testnet evidence. The open validation gates remain in
[`PLAN.md`](../../PLAN.md) and [`docs/competition.md`](../competition.md).

## Authority

The canonical non-claims remain in [`product-plan.md`](product-plan.md),
[`threat-model.md`](../technology/threat-model.md), and
[`architecture.md`](../technology/architecture.md). If a future interview or
organizer response changes the problem selection, this document and the plan
must be updated before changing the flagship journey.
