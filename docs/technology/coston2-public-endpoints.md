# Coston2 public endpoint reachability

Status: `observed`, not a PayGuard deployment or release manifest.

The pinned read-only observer checks the official Coston2 RPC, block explorer,
Explorer ABI endpoint, and faucet landing page without credentials or a wallet
request. It verifies chain ID `114`, captures the current public block, and
parses the Explorer API response for the official Flare Contract Registry ABI.
It records only URLs, HTTP status codes, the ABI item count, and boolean
assertions:

```sh
pnpm coston2:endpoints:observe
pnpm coston2:endpoints:record
```

The evidence file is
[`evidence/coston2/coston2-public-endpoint-reachability.json`](../../evidence/coston2/coston2-public-endpoint-reachability.json).
The faucet check is page reachability only; the observer never submits a
funding request and does not record an address, token, transaction, or
credential. The public Explorer API is an ABI/indexer path for public chain
lookups, not the authenticated FCC machine/indexer service required for
registration.

The observation does not establish stable FCC machine origins, FCC indexer
credentials, a registered machine, a private policy lifecycle, or a PayGuard
release. Refresh it when an explicitly public observation is needed and review
the diff before committing a new timestamp/block.

Official sources:

- [Flare Coston2 network configuration](https://dev.flare.network/network/overview)
- [Flare Explorer ABI API example](https://dev.flare.network/network/guides/flare-for-javascript-developers)
