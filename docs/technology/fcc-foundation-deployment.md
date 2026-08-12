# FCC foundation deployment and registration runbook

Status: sender deployment, extension registration, explicit binding, and
configuration are verified on Coston2. This runbook's foundation record alone
claims no TEE machine or FCC result; later files separately verify registered
simulated machines, signed `PING_V1`, custody, and threshold evaluation.

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

Current tooling fetches `config/coston2/deployed-addresses.json` from the
official `flare-foundation/fce-extension-scaffold` repository at immutable
current-main commit `e3f587949069780084e2ced8a53c9419ed05c250`. It requires SHA-256
`c158350ea5a9bbba8c6485a680252b8f401bc2e25ea10830101eb6d0b40b022e`,
exactly one `FlareTeeManager` entry, and the expected address
`0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE`. The live preflight additionally
requires code at that address and successful official registry-interface reads.
An address copied from prose cannot pass these checks by itself.

The original 2026-08-08 registration evidence remains bound to its historical
pin `ffb6c4ca7c160c49be59e00fe537e24d2477b000`; validation accepts that exact
legacy pin because its manager file has the same pinned digest. New operational
runs use only the current pin above.

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

### Production machine registration

After the exact code hash and platform have been allowed, the guarded runner
uses the pinned official scaffold's full FDC-backed `rRap` flow:

```bash
pnpm fcc:machine:plan -- --url https://machine.example \
  --image-id sha256:<64-lowercase-hex> \
  --ftdc-url https://trusted-ftdc.example \
  --leaf-crl /trusted/public/leaf.crl \
  --intermediate-crl /trusted/public/intermediate.crl

pnpm fcc:machine:register -- --url https://machine.example \
  --image-id sha256:<64-lowercase-hex> \
  --ftdc-url https://trusted-ftdc.example \
  --leaf-crl /trusted/public/leaf.crl \
  --intermediate-crl /trusted/public/intermediate.crl
```

Both URLs must be distinct credential-free public HTTPS origins with no path,
port, query, fragment, or trailing slash in the canonical value. The FTDC
origin is an explicit trusted operator input; an example URL in a checkout is
not promoted into a release fact. Registration requires a clean committed
PayGuard tree, the clean official scaffold at the pinned commit and seven exact
source digests, an already-supported exact code version, an explicit broadcast,
the verified extension-owner key, and a conservative C2FLR gas buffer. Public
resume checkpoints remain only under ignored `evidence/local/`.

After `rRap`, the runner obtains a fresh admission result and independently
checks the manager runtime, chain, machine and proxy IDs, owner, extension,
both registered URLs, attested code hash/platform, status `2`, and exact
registration/production events. Only then may it write
`evidence/coston2/fcc-production-machine.json`; that evidence deliberately
contains no attestation token, signature, credential, ciphertext, or private
policy and still records blockers for two more machines and a live FCC result.

### Code-version handoff

The preflight output now includes the signed TEE timestamp and has an exact
public-only JSON schema. `tooling/fcc-code-version.mjs` revalidates that schema,
the two-minute freshness window, machine/TEE identity relation, distinct proxy,
production platform, image hash, and all verification booleans before using any
value in an allowance plan.

The planner binds extension `66037`, version label `0.1.0-payguard`, the
verified extension owner and foundation sender, zero state verifier, official
manager, and the machine's single attested code-hash/platform pair. It requires
the platform in the manager's system allowlist and rejects a disabled pair. A
new code hash produces `add-version`; an existing hash is idempotent only when
the supported readback has the exact bytes32 version and exactly that platform.
Every other existing-hash condition is a conflict and fails closed.

Run the pure handoff/plan regression tests with:

```bash
pnpm fcc:version:test
```

The operational commands invoke the Go preflight directly; they never accept a
saved admission JSON file:

```bash
pnpm fcc:version:plan -- \
  --url https://machine.example \
  --image-id sha256:<64-lowercase-hex> \
  --leaf-crl /trusted/public/leaf.crl \
  --intermediate-crl /trusted/public/intermediate.crl

pnpm fcc:version:deploy -- \
  --url https://machine.example \
  --image-id sha256:<64-lowercase-hex> \
  --leaf-crl /trusted/public/leaf.crl \
  --intermediate-crl /trusted/public/intermediate.crl

pnpm fcc:version:verify -- \
  --url https://machine.example \
  --image-id sha256:<64-lowercase-hex> \
  --leaf-crl /trusted/public/leaf.crl \
  --intermediate-crl /trusted/public/intermediate.crl
```

Plan and verify are read-only. Deploy carries the explicit `--broadcast`
capability in its package script and additionally requires pinned Node
`24.19.0` and Go `1.25.12`, a clean committed source tree, the dedicated
PayGuard extension-owner key, exact official-manager resolution, successful
owner simulation, and a conservative gas buffer. It rechecks the source commit
immediately before signing.

After a successful receipt or an interrupted run whose exact event is already
on-chain, deploy performs a second fresh PKI admission, requires the same
machine/proxy/key/image/platform/governance identity, rereads support, and
accepts only one exact `TeeVersionAdded` event from the manager. It verifies the
owner transaction and two confirmations before writing
`evidence/coston2/fcc-code-version-allowance.json`. That evidence explicitly
keeps machine registration and live FCC result as blockers.

The command and recovery/evidence paths are locally tested but have not run
against a production machine, so no live PayGuard code version is currently
claimed.

### Signed result verification core

`tooling/fcc-foundation-result.mjs` independently verifies the public result
returned by `/action/result/<instruction-id>`. It requires the exact action ID,
`submit` tag, success status, `PAYGUARD` / `PING_V1` operation, code version,
empty additional status, canonical response ABI, and all chain/sender/extension/
nonce/payload/binding fields. It reconstructs the pinned FCC result hash and
recovers both low-S signatures under the distinct `TEE_ACTION_RESULT` and
`PROXY_ACTION_RESULT` domains; the recovered addresses must equal the admitted
registered TEE and proxy IDs. Run its deterministic positive and negative
vectors with `pnpm fcc:result:test`.

The same module provides bounded polling against only the canonical
`/action/result/<instruction-id>` path of a credential-free HTTPS origin. It
disables redirects, applies a per-request timeout, retries only HTTP `202`/`404`
within a fixed window, and requires strict UTF-8 JSON within 512 KiB before
verification. Raw signatures remain transient in memory and are never emitted
or written by the poller.

This verifier does not itself dispatch a transaction or claim a live result.
The operational command is now `pnpm fcc:ping:plan` (read-only) or
`pnpm fcc:ping:send -- --url ... --image-id ...`; it requires the exact
production machine/code-version readbacks, simulates the payable sender call,
requires explicit broadcast and two confirmations, checks the dispatch event,
polls the same machine origin, and writes public evidence only after the two
FCC signatures verify. A production machine is still required before this
command can succeed; Gate A remains open until that live evidence exists.
