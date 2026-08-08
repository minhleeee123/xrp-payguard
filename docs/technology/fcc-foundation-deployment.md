# FCC foundation deployment and registration runbook

Status: local tooling and live read-only preflight are implemented. No sender
deployment, extension registration, TEE machine, or FCC result is claimed until
new PayGuard evidence is committed and independently reverified.

## Official manager resolution

The tooling fetches `config/coston2/deployed-addresses.json` from the official
`flare-foundation/fce-extension-scaffold` repository at immutable commit
`ffb6c4ca7c160c49be59e00fe537e24d2477b000`. It requires SHA-256
`c158350ea5a9bbba8c6485a680252b8f401bc2e25ea10830101eb6d0b40b022e`,
exactly one `FlareTeeManager` entry, and the expected address
`0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE`. The live preflight additionally
requires code at that address and successful official registry-interface reads.
An address copied from prose cannot pass these checks by itself.

## Safety and resume boundary

The registration CLI:

- accepts only Coston2 chain `114` and the credential-free pinned RPC;
- reads the dedicated PayGuard deployer from ignored mode-`0600` `.env.local`,
  verifies its address, and never writes or prints its private key;
- requires an explicit `--broadcast`, a clean committed worktree, permission
  to register an extension, and a conservative live gas balance buffer;
- verifies the sender artifact surface and creation hash before broadcast;
- saves the deterministic deployment address/nonce and each public transaction
  checkpoint atomically under ignored `evidence/local/`;
- recovers a registration or one-shot binding from public events after an
  interrupted run instead of minting another extension;
- verifies deployment bytecode outside compiler-declared immutable ranges,
  constructor manager bindings, registration owner/sender/state verifier,
  sender constants and explicit extension binding;
- verifies machine-owner and wallet-project-owner permission plus the official
  bytes32 `EVM` key type needed by later machine work.

Every mismatch fails closed. The state and evidence schema reject secret,
credential, signature, ciphertext, and private-policy fields.

## Commands

Build and test first:

```bash
forge build --root packages/contracts
pnpm fcc:foundation:test
pnpm fcc:foundation:plan
```

The plan is read-only. Broadcast is permitted only after committing and pushing
the exact source:

```bash
pnpm fcc:foundation:deploy
```

Independent rereading of the official source, receipts, runtime, constructor,
registry mappings, sender binding, and configuration uses:

```bash
pnpm fcc:foundation:verify
```

A successful broadcast writes public-safe evidence to
`evidence/coston2/fcc-foundation-registration.json`. That file proves only a
registered and configured foundation sender. It keeps explicit blockers for
code-version allowance, a production machine, and a live signed `PING_V1`
result. It cannot pass Gate A by itself.
