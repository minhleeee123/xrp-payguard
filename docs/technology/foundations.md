# Gate 0/1 foundations

Status: foundation pins, source map, local protocol, contracts, bindings, FCC
sign-port domain adapter, Coston2 testnet funding, and fail-closed deployment
tooling are committed. The PayGuard registry, vault, router, and FTestXRP vault
wiring are runtime/constructor-verified on Coston2. FCC registration, machine
identities, and the private live lifecycle remain planned and not yet verified.

## Pinned local toolchain

The exact versions are stored in [`tooling/versions.json`](../../tooling/versions.json).
The repository targets Node `24.19.0`, pnpm `10.33.0`, Go `1.25.12`, Foundry
`1.7.1`, and Solidity `0.8.25`. `tooling/preflight.mjs` fails before tests when
Node, pnpm, Go, or Forge is absent or does not match. The FCC scaffold's Go
directive is `1.25.1`; the selected patch release satisfies that directive.

The official FCC scaffold was inspected read-only at commit
`ffb6c4ca7c160c49be59e00fe537e24d2477b000`. PayGuard has not copied its
deployment, extension ID, machine identity, key, or evidence.

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

- three distinct registered FCC machines with stable HTTPS origins and active
  policy/result capacity;
- organizer confirmation of current Summer Signal schedule, submission
  mechanics, and FCC access;
- interviews/usability sessions and a design-partner testnet pilot;
- hosted web/relay/FCC deployment credentials and production smoke access.

Until those inputs are provided, local simulated tests may validate protocol
logic but do not become Coston2 release evidence.
