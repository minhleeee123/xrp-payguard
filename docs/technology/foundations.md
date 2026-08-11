# Gate 0/1 foundations

Status: foundation pins, source map, local protocol, contracts, bindings, FCC
sign-port domain adapter, Coston2 testnet funding, and fail-closed deployment
tooling are committed. The PayGuard registry, vault, router, and FTestXRP vault
wiring are runtime/constructor-verified on Coston2. Fresh TEE identity discovery,
strict private-policy wire, and loopback ECIES decryption pass locally. FCC
foundation dispatch now has a local typed sender/handler and shared Solidity/Go
binding vector. Its sender deployment, extension registration, explicit binding,
owner permissions, and EVM key-type configuration are verified on Coston2.
Stable A/B/D origins, authenticated indexer access, registered simulated
machines, signed `PING_V1`, private custody/evaluation, C→D replacement, and
executor-pause recovery are now evidenced separately. The hosted V2 simulated
candidate is deployed; hardware-backed machines, sealed identity recovery, and
a verified release remain open.

## Pinned local toolchain

The exact versions are stored in [`tooling/versions.json`](../../tooling/versions.json).
The repository targets Node `24.19.0`, pnpm `10.33.0`, Go `1.25.12`, Foundry
`1.7.1`, and Solidity `0.8.25`. `tooling/preflight.mjs` fails before tests when
Node, pnpm, Go, or Forge is absent or does not match. The FCC scaffold's Go
directive is `1.25.1`; the selected patch release satisfies that directive.

The official FCC scaffold was inspected read-only at commit
`ffb6c4ca7c160c49be59e00fe537e24d2477b000`. PayGuard has not copied its
deployment, extension ID, machine identity, key, or evidence.

The local `PayGuardFoundationSender` follows the official registry instruction
shape but constructs its own `PAYGUARD` / `PING_V1` request. The request binds
Coston2 chain `114`, the exact sender, registry-assigned extension ID, PayGuard
code version, nonce, and a public-safe payload hash. The Go extension accepts
only the canonical ABI tuple and returns the same fields plus their binding
hash. The shared vector proves local wire compatibility; separate Coston2
evidence now verifies an official outer FCC result and registered simulated
TEE/proxy signers. Hardware attestation and verified-release promotion remain separate
requirements.

Deployment tooling resolves the manager from the digest-pinned official
scaffold file, verifies the live diamond interface, and journals deploy,
register, one-shot bind, owner permissions, and EVM key-type configuration.
`fcc-foundation-deployment.md` defines the exact runbook and evidence boundary.
The committed tooling deployed and independently reverified extension `66037`.
The sender registration alone is not a Gate A result; the later signed live
`PING_V1` and threshold-lifecycle evidence are the corresponding simulated-
machine facts.

## Official discovery sources

- FCC build flow: <https://dev.flare.network/fcc/guides/getting-started>
- FCC overview: <https://dev.flare.network/fcc/overview>
- FDC workflow: <https://dev.flare.network/fdc/getting-started>
- FTSOv2: <https://dev.flare.network/ftso/overview>
- Smart Accounts: <https://dev.flare.network/smart-accounts/overview> and
  <https://dev.flare.network/smart-accounts/reference>
- FAssets registry/address guidance: <https://dev.flare.network/fassets/reference>
  and <https://dev.flare.network/fassets/developer-guides/fassets-asset-manager-address-contracts-registry>

The FAssets and Smart Account pages list current Coston2 reference addresses,
but PayGuard will resolve them through the supported Contract Registry and
verify runtime code at release. A documentation address is never a PayGuard
release fact by itself.

## External access still required

The following cannot be truthfully completed from this local workspace alone:

- hardware-backed, independently operated FCC machines and verified V2 release
  capacity; the registered A/B/D `SIMULATED_TEE` V2 candidate path is already hosted;
- organizer confirmation of current Summer Signal schedule, submission
  mechanics, and FCC access;
- interviews/usability sessions and a design-partner testnet pilot;
- verified-release production smoke access and managed monitoring credentials.

Until those inputs are provided, local simulated tests may validate protocol
logic but do not become Coston2 release evidence.
