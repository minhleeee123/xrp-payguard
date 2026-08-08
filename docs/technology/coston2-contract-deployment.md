# Coston2 contract deployment runbook

Status: verified public contract deployment, not a verified PayGuard release.
The public evidence file passes repository checks; registered FCC and private
policy lifecycle gates remain open.

## Verified deployment

Source commit `17ff0bc1eb135195a94d0d261bc491f006730720` produced:

| Contract | Coston2 address | Deployment block |
|---|---|---:|
| `PayGuardPolicyRegistry` | `0x8DFb2D7D7a2608Ee7Cd78983fbe28cCE00e1D4A4` | `33792913` |
| `PayGuardVault` | `0xFFe7522075412B2eBA5b8B91c9aA4E1c2c6f84dB` | `33792918` |
| `PayGuardActionRouter` | `0x28A969018975Fb40aEd0BfA98f6d1c3023B6a7Da` | `33792922` |

The vault was wired once to that router at block `33792933`, and FTestXRP
support was enabled at block `33792937`. A fresh verification at observed block
`33792965` re-resolved the official asset path, reread all five successful
receipts, compared runtime to the committed Foundry artifacts, and checked all
constructor/admin/wiring getters. Exact transaction and runtime hashes are in
[`evidence/coston2/contracts-deployment.json`](../../evidence/coston2/contracts-deployment.json).

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
