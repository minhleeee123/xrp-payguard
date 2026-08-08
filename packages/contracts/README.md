# Contracts

Local Foundry/Solidity V1 implementation of the public state machine:

- `PayGuardPolicyRegistry` verifies three machine receipts, freezes identities,
  and exposes only commitment/binding/status data.
- `PayGuardVault` accepts an explicitly supported ERC-20-like public asset and
  conserves available/reserved/spent/withdrawn accounting.
- `PayGuardActionRouter` freezes requests, verifies two distinct registered
  signatures over the signer-independent evaluation digest, and executes one
  transfer atomically.
- `PayGuardPolicyMath` is the Solidity reference for the checked, ceiling-rounded
  FTSO value conversion shared with the Go and TypeScript policy evaluators.
- `PayGuardPolicyComposition` is a bitmask-only precedence reference shared with
  the private evaluators; no private policy field or intermediate value enters
  Solidity.

Run with the pinned local toolchain from the repository root:

```sh
PATH="$PWD/.local/toolchains/bin:$PATH" forge test -vv
PATH="$PWD/.local/toolchains/bin:$PATH" forge build
```

The tests include shared receipt/request/evaluation, reference-value, and
policy-composition vectors, plus replay, stale-checkpoint, wrong-signer,
conservation, cancellation, and machine-replacement negatives. Addresses, token
integrations, FCC signatures, and deployment evidence remain unverified until a
real Coston2 release.
