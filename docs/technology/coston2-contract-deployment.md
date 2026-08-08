# Coston2 contract deployment runbook

Status: tooling implemented and locally tested. No PayGuard contract deployment
is claimed until the public Coston2 evidence file exists and passes repository
checks.

## Safety model

The deployment CLI is deliberately narrower than a general RPC script:

- it accepts only the pinned credential-free Coston2 RPC and chain ID `114`;
- it resolves `AssetManagerFXRP` through the official Flare Contract Registry,
  then resolves and checks the `FTestXRP` address, symbol, decimals, and runtime;
- broadcast requires an explicit `--broadcast` flag, a clean committed source
  tree, and a dedicated PayGuard testnet deployer from ignored `.env.local`;
- the key is used only to construct the in-memory wallet account and is never
  placed in output, resume state, evidence, source, or command arguments;
- each deployment saves the planned nonce and deterministic create address
  before broadcasting, then saves its transaction hash immediately;
- every receipt must succeed with two confirmations before the next step;
- deployed runtime must match the Foundry artifact byte-for-byte outside the
  compiler-declared immutable ranges;
- public getters independently verify registry/vault admin, router registry and
  vault immutables, one-time vault router wiring, and enabled `FTestXRP` support.

Resume state is written atomically with mode `0600` under ignored
`evidence/local/coston2-contract-deployment.json`. It contains only public
addresses, hashes, nonces, blocks, statuses, and assertion booleans. A source,
deployer, dependency, artifact, nonce, receipt, bytecode, or wiring mismatch
fails closed rather than continuing from uncertain state.

## Commands

Build contracts before planning:

```bash
forge build
pnpm bindings:generate
pnpm deploy:coston2:test
```

The read-only plan performs live chain, official dependency, and artifact
checks without loading a wallet:

```bash
pnpm deploy:coston2:plan
```

Only after committing and pushing that exact source, broadcast the resumable
deployment:

```bash
pnpm deploy:coston2
```

Re-read receipts, runtime, constructor bindings, and wiring later with:

```bash
pnpm deploy:coston2:verify
```

A successful deployment writes reviewed public-safe evidence to
`evidence/coston2/contracts-deployment.json`. That evidence proves only the
three contracts and vault wiring. It is not a verified PayGuard release and
does not prove FCC registration, private custody/evaluation, FDC, Smart
Accounts, FAssets mint, XRP movement, or a hosted product lifecycle.
