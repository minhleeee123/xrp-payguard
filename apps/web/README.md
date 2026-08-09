# Web application

Vite laptop-first shell with an editorial landing page at `#landing`, plus
Overview, Policy Studio, Vaults, Requests, Payee, wallet-free Auditor, and
Team/roles surfaces. Its visual language follows the
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
Requests & schedules applies the same boundary to request hashes, checkpoints,
occurrence windows, threshold-derived decisions, expiry, and recovery states;
it never creates an approval when the public request endpoint is unavailable.
Auditor evidence is schema-checked against the request/evaluation digest,
frozen machine set, finalized input marker, execution status, and vault
conservation equation; signatures and private policy material are not accepted
by the public evidence wire.
Payee receipts bind the public target, asset, amount, expected timing, request
hash, settlement transaction, and resulting checkpoint; missing or drifting
receipts remain unavailable.
Team roles are schema-checked and hashed as public assignments; the permission
projection covers public controls only and always returns `canAuthorize: false`.
Policy Studio custody progress accepts only the schema-checked three-machine
receipt bundle: each digest/signature must match the frozen binding and the
shared submission nonce/time window. Until a verified provider supplies that
bundle, the UI shows activation blocked and never substitutes a local receipt.
Notifications use a strict public event feed with finalized block/time facts,
typed status/severity, request references, and domain-separated feed/export
hashes. The tray remains unavailable until a verified provider supplies a
finalized feed; its export action can only download a public unavailable report
or a schema-checked public feed, never policy plaintext, ciphertext, signatures,
or private denial reasons.

Run locally with the pinned Node toolchain:

```sh
PATH="$PWD/.local/toolchains/bin:$PATH" pnpm --filter @xrp-payguard/web dev
```

This UI is a public-safe product shell, not evidence of a live PayGuard
release. Deploy the built static artifact with the Vercel CLI from the
repository root:

```sh
pnpm --filter @xrp-payguard/web build
vercel deploy apps/web/dist --prod --yes --project xrp-payguard
```

The deployment contains only `apps/web/dist`; it does not provide FCC
machines, a relay, a policy provider, wallet signing, or a verified PayGuard
release. The latest sanitized deployment record is
[`vercel-preview-2026-08-09.json`](../../evidence/web/vercel-preview-2026-08-09.json).

The build also emits only the allowlisted public evidence files under
`/evidence/`, with [`/evidence/index.json`](https://xrp-payguard.vercel.app/evidence/index.json)
as the metadata entry point. This endpoint contains testnet identifiers,
hashes, statuses, and assertion booleans; it never contains policy plaintext,
ciphertext, keys, credentials, or private denial details. The Vercel deployment
record stays repository-only rather than recursively embedding an inevitably
stale deployment identifier in its own artifact.

The Auditor view may display this index as a static evidence mirror. It keeps
the live audit state unavailable until a verified RPC/provider supplies a
finalized request, result, signer mapping, and conservation snapshot.
