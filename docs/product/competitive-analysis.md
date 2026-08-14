# Product positioning and operating-model comparison

## 1. Scope and evidence boundary

This document compares four payment-control operating models to explain XRP
PayGuard's intended utility. It is a design analysis, not a market-share study,
competitive product benchmark, user interview, pilot, or traction claim.
Individual implementations can have different properties; the table states the
assumptions used for each archetype.

PayGuard's primary job to be done is:

> Let an XRP-native treasury give an approved vendor a bounded recurring
> payment path without publishing the complete authorization policy or handing
> an automation operator signing keys and approval discretion, while retaining
> publicly inspectable authorization and execution evidence.

## 2. Why the existing operating models leave a gap

### Manual multisig approval

Multiple signers can retain direct transaction authority and avoid encoding a
complete policy publicly. However, signers must coordinate for each payment;
the multisig threshold authenticates approvals but does not itself evaluate a
private recurring policy or automate eligible vendor requests.

### Public policy contract

A contract can automate deterministic limits and expose strong public audit
data. Rules encoded in public calldata, storage, events, or reconstructable
state are observable, which is unsuitable when limits, schedules, target
classes, or operating conditions are commercially sensitive.

### Custodial automation service

A hosted bot can keep its internal configuration away from public chain state
and submit payments automatically. In the assumed model, the operator holds a
signing key or has unilateral approval discretion, and its internal decision
evidence is not necessarily independently verifiable on-chain.

### XRP PayGuard target model

The treasury gives neither its signing keys nor authorization discretion to the
relay or executor. It commits to a private deterministic policy stored by a
fixed registered FCC machine set. A public request must receive two matching,
request-bound machine results before the router can execute, and the resulting
request, threshold evidence, accounting, and transfer remain public.

## 3. Comparison

| Operating model | Complete policy not encoded publicly | No signing key or `ALLOW` control delegated to automation operator | Recurring request automation | Publicly inspectable authorization and execution |
| --- | --- | --- | --- | --- |
| Manual multisig approval | Usually | Yes | No; signers approve each payment | Partial; signatures and transfer are public, but the off-chain policy may not be |
| Public policy contract | No, for rules required by public execution | Yes | Yes | Yes |
| Custodial automation service | Possibly | No, under the assumed custodial model | Yes | Depends on the service; not guaranteed by the model |
| XRP PayGuard target | Yes, for policy limits, schedules, target rules, and conditions | Yes | Yes | Yes, for the request, threshold result, vault accounting, and transfer |

Qualification of the PayGuard row:

- “No delegated custody” means the automation operator receives neither the
  user's signing keys nor authority to supply or override `ALLOW`. Funds are
  still deposited into a public smart-contract vault and remain subject to its
  code and governance assumptions.
- “Policy confidential” does not mean the transaction is private. Requester,
  recipient, asset, amount, timing, vault balances, result signers, and
  transaction graph remain observable.
- The active Coston2 candidate uses registered A/B/D `SIMULATED_TEE` machines.
  It does not establish hardware confidentiality or independently operated
  infrastructure.
- The repository demonstrates the funding, private-policy authorization, and
  redemption segments with separate evidence. It does not claim one canonical
  transaction spanning FDC funding, FCC authorization/execution, and FAssets
  redemption.

## 4. User-facing differentiation

| User concern | PayGuard response | Residual limitation |
| --- | --- | --- |
| “I do not want to publish our complete vendor allowance.” | Policy plaintext and ciphertext stay out of public calldata, storage, events, logs, analytics, browser persistence, and evidence. | Public requests and transfers still reveal transaction facts. |
| “I do not want a bot deciding or redirecting payments.” | The client, relay, executor, vendor, owner, and administrator cannot provide `ALLOW`; evaluations bind the exact target, asset, amount, state, nonce, contracts, and expiry. | Users still trust the verified code, registered machine set, Flare protocols, wallet, and chain liveness. |
| “The vendor should not need a manual signature from us every time.” | An explicitly authorized requester can create its own request and authorize request-bound evaluation under the frozen policy. | A dependency or quorum failure fails closed instead of paying. |
| “Our members need to verify what happened.” | Public registry, router, vault, threshold, transaction, and sanitized evidence records support wallet-free inspection. | Auditors verify the commitment and execution evidence, not the private policy plaintext. |

## 5. Product templates

1. **Recurring vendor allowance — primary.** A treasury fixes requester/payee,
   amount bounds, schedule, occurrence limit, expiry, and emergency controls.
2. **DAO grant or contributor budget.** A DAO applies an approved target class,
   fixed or rolling cap, explicit policy version, and public audit trail.
3. **Personal subscription — secondary.** An individual defines a recurring
   merchant rule, occurrence cap, expiry, and owner recovery path.

These are product templates supported by the policy model, not claims of live
customers or completed pilots.

## 6. Validation status

The owner has completed founder acceptance for every implemented
submission-boundary surface and flow. Structured external interviews,
usability sessions, design-partner pilots, adoption, revenue, and partnership
evidence remain unverified unless separately recorded under the repository's
consented validation protocol. Product positioning in this document must never
be used to manufacture those missing facts. See the
[competition acceptance boundary](../competition.md#5-acceptance-and-post-hackathon-validation)
and [verification plan](../technology/verification.md) for the current evidence
status.
