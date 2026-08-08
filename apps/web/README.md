# Web application

Vite laptop-first shell with Overview, Policy Studio, Vaults, Requests,
wallet-free Auditor, and Team/roles surfaces. The Policy Studio computes a
commitment from an in-memory draft only; it does not use browser storage, send
ciphertext, or provide an authorization result. Other screens render explicit
`planned`, `local`, and `unavailable` states until a verified Coston2 release is
connected.

Run locally with the pinned Node toolchain:

```sh
PATH="$PWD/.local/toolchains/bin:$PATH" pnpm --filter @xrp-payguard/web dev
```

This UI is a public-safe product shell, not evidence of a live deployment.
