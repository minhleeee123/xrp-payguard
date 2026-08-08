# Web application

Vite laptop-first shell with Overview, Policy Studio, Vaults, Requests, Payee,
wallet-free Auditor, and Team/roles surfaces. Its visual language follows the
repository-level [`DESIGN.md`](../../DESIGN.md). The Policy Studio computes a
domain-bound commitment from an in-memory draft only. It includes three policy
templates, structured local validation, fresh browser cryptographic entropy,
and an exact activation/request/private visibility map. Its contract addresses
are explicitly local examples, and receipt progress remains unavailable rather
than substituting local receipts until a verified Coston2 machine set exists.
It does not use browser storage, send ciphertext, or provide an authorization
result. Other screens render explicit `planned`, `local`, and `unavailable`
states until a verified Coston2 release is connected.
The Vaults surface accepts only a schema-checked, finalized public snapshot;
it verifies the conservation equation and shows no balance when the provider
is unconfigured, unavailable, unfinalized, or invalid.

Run locally with the pinned Node toolchain:

```sh
PATH="$PWD/.local/toolchains/bin:$PATH" pnpm --filter @xrp-payguard/web dev
```

This UI is a public-safe product shell, not evidence of a live deployment.
