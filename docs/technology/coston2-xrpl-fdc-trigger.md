# Coston2 XRPL FDC trigger consumer

## Scope

`PayGuardXrplFdcTrigger` is the public on-chain boundary between one verified
FDC `IXRPPayment.Proof` and one canonical PayGuard request. It is deliberately
separate from the three original state contracts and can only create a
`Pending` request. It has no function that supplies `ALLOW`, submits an FCC
result, reserves vault assets, or executes a transfer.

The local implementation and real-router test are complete. The consumer is
deployed at `0x4b626E2DA4D45034C8fAA38D10AbDfD4921486b2` from source commit
`aa75eda1bd7248be82bc3d70640d3aa247e1af0e`; its receipt, bytecode, constructor,
protocol constants, and current runtime dependency bindings are recorded in
[`../../evidence/coston2/xrpl-fdc-trigger-deployment.json`](../../evidence/coston2/xrpl-fdc-trigger-deployment.json).
A deployed consumer alone does not prove a live XRPL payment, FDC consumption,
request, private FDC policy evaluation, FCC result, or PayGuard release.

## Fixed deployment bindings

The deployment CLI accepts only chain `114` and the pinned credential-free
Coston2 RPC. It resolves `FdcVerification` from the supported Flare Contract
Registry during preflight, reads the verified PayGuard router from the reviewed
core deployment evidence, and deploys with a one-hour maximum proof age.

Verification independently checks:

- successful deployment receipt and exact contract address;
- every non-immutable runtime byte against the current Foundry artifact;
- Flare Contract Registry, runtime `FdcVerification`, and PayGuard router
  constructor getters;
- the one-hour proof-age bound, Coston2 chain constant, `XRPPayment` type, and
  `testXRP` source identifier;
- current Contract Registry resolution still matches the immutable verifier.

The ignored resume state contains public identifiers only and is written with
mode `0600`. The committed evidence builder rejects secret-shaped fields and
explicitly records that no proof or request was consumed.

## Commands

From the repository root with the pinned toolchain available:

```sh
pnpm coston2:fdc-trigger:test
pnpm coston2:fdc-trigger:plan
pnpm coston2:fdc-trigger:deploy
pnpm coston2:fdc-trigger:verify
```

`plan` is read-only. `deploy` requires an exact `--broadcast` capability inside
the package script, a clean committed worktree, the PayGuard-local deployer key,
matching configured address, sufficient testnet gas, current dependency
runtimes, and a safe pending nonce. It never loads VeilBid credentials.

## Remaining authorization boundary

The consumer validates proof type/source, proof owner, payment status, source
hash consistency, receiver consistency, positive/exact received amount, request
ID memo, freshness, and both transaction/proof replay markers. These checks
make canonical request creation fail closed, but they do not interpret a private
policy's desired XRPL source or destination. V1 FCC evaluators therefore must
not treat consumer acceptance alone as private-policy authorization. Canonical
private FDC descriptors, verified snapshots, and both cross-language evaluator
paths remain a separate open gate before either machine may sign `ALLOW` for a
policy that requires those semantics.
