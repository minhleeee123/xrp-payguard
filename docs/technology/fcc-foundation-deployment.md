# FCC foundation deployment and registration runbook

Status: sender deployment, extension registration, explicit binding, and
configuration are verified on Coston2. No TEE machine or FCC result is claimed.

## Verified registration

Source commit `f9f550d30bc924c5b5a1ea59fdf96138be7a5c24` deployed
`PayGuardFoundationSender` at
`0xA1e95721aD7F96D7f9bcd1d62b3A38A8625Cf8dC` in block `33795049`. The official
manager registered it as public extension `66037` in block `33795055`. A fresh
read at block `33795084` verified deployment/runtime, constructor manager
bindings, registration owner/sender/zero state verifier, one-shot sender ID,
machine and wallet-project owner permission, and the bytes32 `EVM` key type.
Transactions and the runtime hash are recorded in
[`evidence/coston2/fcc-foundation-registration.json`](../../evidence/coston2/fcc-foundation-registration.json).

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

## Production machine admission preflight

Before any code-version allowance or machine-registration transaction, run the
read-only production preflight against the exact public proxy origin and the
expected reproducible image ID:

```bash
pnpm fcc:machine:preflight -- \
  -url https://machine.example \
  -image-id sha256:<64-lowercase-hex> \
  -leaf-crl /trusted/public/leaf.crl \
  -intermediate-crl /trusted/public/intermediate.crl
```

The defaults bind Coston2 chain `114`, PayGuard extension `66037`, and the
verified PayGuard deployer/initial owner. Override flags exist for explicit
testing, but every supplied value remains part of the admission checks. The
tool accepts only a credential-free HTTPS origin, disables environment proxy
routing and redirects, rejects literal or DNS-resolved internal addresses,
bounds and strictly decodes `/info`, and never emits the raw attestation token
or either signature.

Admission verifies the signed machine-data domain and the proxy TEE-info
domain, freshness, public-key agreement, nonzero governance, exact owner,
extension, chain, and expected image ID. `TEST_PLATFORM`, the scaffold test
code hash, `magic_pass`, debug-enabled workloads, missing secure boot, and
unsupported hardware all fail closed. The Google PKI token must use RS256,
the expected issuer and `https://sts.google.com` audience, the exact TEE-info
hash nonce, a valid certificate chain to the embedded root, and available CRLs
whenever a certificate declares a distribution point. This first preflight
does not fetch CRLs from token-controlled URLs. Instead, the two optional CRL
flags accept only nonempty regular DER or PEM files of at most 2 MiB, obtained
through a separately trusted public source. The pinned verifier then checks
their validity window, issuer signature, and revocation entries against the
already parsed certificate chain. A declared distribution point without its
required explicit CRL still fails closed.

The embedded Google Confidential Space root was taken from the pinned official
`tee-node v0.0.24` asset and independently matched on 2026-08-09 against
Google's discovery endpoint and root URL. Its PEM SHA-256 is
`1e9f82db6b86371f80913f246049516a9dc333e28fb1bf3e343d3459347e0d11`
at those sources (the embedded text has one conventional trailing newline).
The verifier pins the certificate DER SHA-256
`148b293821bb0c6a317f413c8ba475814091cb22d49b9e3c94198db8e8f86c39`;
Google's documented SHA-1 fingerprint is
`B9:51:20:74:2C:24:E3:AA:34:04:2E:1C:3B:A3:AA:D2:8B:21:23:21`.

A successful preflight is only an off-chain admission result. The official
on-chain version allowance, FDC-backed machine promotion, registry reads, and
live signed `PING_V1` are still mandatory and remain unverified.
