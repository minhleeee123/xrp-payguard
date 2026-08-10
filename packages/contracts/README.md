# Contracts

Local Foundry/Solidity V1 implementation of the public state machine:

- `PayGuardPolicyRegistry` verifies three machine receipts, freezes identities,
  and exposes only commitment/binding/status data.
- `PayGuardPolicyRegistryV2` is a local release candidate that removes the
  administrator-owned machine mapping, constructor-freezes an official
  `FlareTeeManager`/extension/code domain, rechecks machine status and platform
  at receipt and result time, makes policy lifecycle owner-only, and limits
  governance to a globally scoped pause that can be permanently renounced only
  while unpaused. It is not yet a Coston2 deployment fact.
- `PayGuardVault` accepts an explicitly supported ERC-20-like public asset and
  conserves available/reserved/spent/withdrawn accounting.
- `PayGuardActionRouter` freezes requests, verifies two distinct registered
  signatures over the signer-independent evaluation digest, and executes one
  transfer atomically. Genesis spend state is derived from the exact policy
  commitment, pending requests do not reserve funds, and the
  checkpoint/occurrence is revalidated at execution.
- `PayGuardPolicyMath` is the Solidity reference for the checked, ceiling-rounded
  FTSO value conversion shared with the Go and TypeScript policy evaluators.
- `PayGuardPolicyComposition` is a bitmask-only precedence reference shared with
  the private evaluators; no private policy field or intermediate value enters
  Solidity.
- `PayGuardScheduleMath` is the checked UTC slot/deadline reference shared with
  Go and TypeScript; it is not called by the public router.
- `PayGuardSpendWindowMath` fixes UTC calendar and sliding rolling-window
  boundaries for the private evaluators without wiring history into the router.
- `PayGuardFoundationSender` dispatches a public-safe, domain-bound `PING_V1`
  through the official FCC registry interfaces to one registered machine. It is
  intentionally unable to dispatch evaluations or authorize payments.
- `PayGuardXrplFdcTrigger` verifies an official `IXRPPayment.Proof` through the
  runtime-registry-bound `FdcVerification` contract, checks the successful
  payment, exact request-ID memo, amount, proof owner, and freshness, consumes
  both transaction and proof commitments, then creates one canonical pending
  router request in the same transaction. It cannot authorize or move funds,
  and it does not replace the still-open private FDC descriptor/evaluator path.

Run with the pinned local toolchain from the repository root:

```sh
PATH="$PWD/.local/toolchains/bin:$PATH" forge test -vv
PATH="$PWD/.local/toolchains/bin:$PATH" forge build
```

Foundry runs 256 cases per fuzz test and a 128-run, 64-call-depth vault handler
invariant. The invariant checks conservation buckets, active reservation totals,
and the vault token balance after arbitrary deposit/withdraw/reserve/release/
execute sequences. Adversarial token tests cover reentrant `transferFrom`,
fee-on-transfer deposits, and false-return execute/withdraw rollback.

The tests include shared receipt/request/evaluation, reference-value,
policy-composition, and XRPL FDC input-commitment vectors, plus replay,
stale-checkpoint, wrong-signer, conservation, cancellation, machine-replacement,
runtime-verifier drift, malformed payment, and verifier/router rollback
negatives. The FDC consumer is locally verified only until its own Coston2
deployment and live proof/request receipt are recorded; FCC signatures and a
complete release remain unverified.
