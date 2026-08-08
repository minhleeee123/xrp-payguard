# Required Flare technology and official sources

## 1. Flare Confidential Compute (FCC)

Role in PayGuard:

- hold sealed policy state;
- validate policy binding and replay state;
- evaluate deterministic authorization;
- return machine-signed custody receipts and evaluation results.

It is not a sidecar. The action router must be unable to execute without the
required registered-machine result threshold.

Official starting points:

- [FCC: Build Your First Extension](https://dev.flare.network/fcc/guides/getting-started)
- [Flare Developer Hub](https://dev.flare.network/)

Implementation requirements:

- start from the supported scaffold and pin its exact revision;
- use stable registered HTTPS machine/proxy endpoints;
- bind extension, machine, code/image version, public key, chain, and contracts;
- verify current manager/registry/result-signing semantics from supported sources;
- use replacement registration rather than claiming unsupported key/identity restore.

## 2. Flare Data Connector (FDC)

Role in PayGuard:

- prove XRPL funding or trigger payments;
- prove selected EVM transactions/events;
- later, prove allowlisted Web2 JSON responses with explicit source trust.

Official sources:

- [FDC overview](https://dev.flare.network/fdc/overview)
- [FDC attestation types](https://dev.flare.network/fdc/attestation-types)
- [FDC getting started](https://dev.flare.network/fdc/getting-started)

Important operational facts:

- request, voting-round finalization, DA proof retrieval, and on-chain proof
  verification are asynchronous checkpoints;
- proof availability does not mean the data source's business meaning is true;
- requests require the current fee/configuration and supported source/type;
- PayGuard must validate response fields, confirmations, MIC/domain, freshness,
  owner, amount, destination, memo/reference, and replay state.

## 3. FTSOv2

Role in PayGuard:

- convert a public payment amount into a policy reference currency;
- enforce public value caps using a frozen price input;
- avoid any client-supplied price.

Official source:

- [FTSOv2 overview](https://dev.flare.network/ftso/overview)

Requirements:

- resolve the supported feed ID and contract;
- bind value, decimals, timestamp, block/checkpoint, and freshness;
- reject non-positive, stale, unavailable, malformed, or overflow-prone input;
- define deterministic rounding shared by Go, Solidity, and TypeScript.

## 4. FAssets / FXRP / FTestXRP

Role in PayGuard:

- provide the XRP-backed public asset held by the vault;
- support real XRPL-to-Flare funding and a supported exit/redemption journey.

Official sources:

- [FAssets overview](https://dev.flare.network/fassets/overview)
- [FAssets reference](https://dev.flare.network/fassets/reference)
- [Redeem FAssets](https://dev.flare.network/fassets/developer-guides/fassets-redeem)

Requirements:

- resolve addresses through current supported registries/periphery packages;
- verify decimals, token behavior, asset manager, lot/fee/agent constraints;
- preserve exact public vault conservation;
- distinguish a redemption request from completed underlying XRP payout;
- never claim private FXRP/FTestXRP transfer amounts.

## 5. Flare Smart Accounts

Role in PayGuard:

- allow an XRPL user to fund or call a PayGuard operation on Flare;
- bind an XRPL Payment/mint to the exact PersonalAccount and operation.

Official source:

- [Flare Smart Accounts overview](https://dev.flare.network/smart-accounts/overview)

Requirements:

- derive the PersonalAccount and nonce from supported contracts;
- construct canonical `PackedUserOperation` bytes and `0xFE` commitment;
- validate FDC proof, XRPL owner/payment, operation hash, executor fee, asset,
  target, nonce, and callback events;
- support delayed mint/resume without accepting any drift;
- never accept an XRPL seed or sign on behalf of the user.

## 6. Coston2 and release discovery

- Development chain ID is `114`.
- Every protocol and PayGuard address must be recorded with discovery source,
  block, runtime code, constructor/wiring, and release commit.
- Addresses copied from a reference `.env`, document, or prior release remain
  references until re-resolved and verified for PayGuard.
- Faucet/testnet assets have no real-world value and must never be described as
  production custody.

## 7. Toolchain target

Pin exact versions before implementation:

- Node `>=24 <25` and a repository-pinned pnpm version;
- Go version supported by the official FCC scaffold;
- Foundry/Forge and Solidity version compatible with official Flare packages;
- viem and XRPL SDK versions;
- Docker/buildx and linux/amd64 image output for FCC infrastructure.

The project must fail early with a clear message when a required binary or
version is missing. A partial root test must never be reported as a full pass.
