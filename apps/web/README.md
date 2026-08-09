# Web application

Vite laptop-first Coston2 dApp with a full editorial landing page at `#landing`, plus
Overview, Policy Studio, Vaults, Requests, Payee, wallet-free Auditor, and
Team/roles surfaces. Its visual language follows the
repository-level [`DESIGN.md`](../../DESIGN.md). The Policy Studio computes a
domain-bound commitment from an in-memory draft only. It includes three policy
templates, structured local validation, fresh browser cryptographic entropy,
and an exact activation/request/private visibility map. Its contract addresses
are explicitly local examples, and receipt progress remains unavailable rather
than substituting local receipts until a verified Coston2 machine set exists.
It does not use browser storage, send ciphertext, or provide an authorization
result.

The injected-wallet boundary now connects or adds Flare Coston2 without ever
receiving a private key. For an authorized public account it pins all reads to
one `finalized` block, verifies the deployed registry/vault/router runtime
hashes against reviewed PayGuard evidence, verifies router/vault wiring and
the supported FTestXRP metadata, then displays exact C2FLR, wallet FTestXRP,
allowance, and conservation-checked vault accounting. Runtime, wiring, asset,
RPC, schema, or conservation drift fails closed and clears every asserted live
balance. The Vaults writer supports exact FTestXRP approval, deposit, and
withdrawal through a two-step preview. Before opening the wallet it reuses the
verified finalized snapshot for balance/allowance checks; it then simulates the
call, waits for the receipt and a finalized block, validates the exact contract
event, and proves the expected post-transaction balance change. A rejection,
revert, missing event, provider failure, or postcondition mismatch is never
reported as success. Request and execution controls remain separate reviewed
units.

The landing page includes a public/private data boundary, three inline SVG
guardian mascots, the complete XRPL/FDC/Smart Account/FAssets/FCC journey,
policy use cases, public-safe evidence scope, FAQ/limitations, and
reduced-motion-compatible ambient effects. It makes no remote image request and
never upgrades the local FCC simulation into a live release claim.

The Vaults surface accepts only the verified finalized Coston2 account snapshot;
it verifies the conservation equation and shows no balance when the wallet or
RPC is unconfigured, unavailable, unfinalized, or invalid. Transaction signing
stays in the injected wallet, and the page never asks for or handles a private
key. Unit coverage and a browser preview smoke are complete; a fresh owner-wallet
transaction submitted from this UI is not yet recorded as release evidence.
Requests & schedules accepts an exact bytes32 request ID and reads the canonical
router tuple at one finalized Coston2 block without requiring a wallet. It
verifies reviewed runtime hashes, router wiring, the full contract domain, the
cross-language request hash, status/decision consistency, occurrence window,
threshold fields, and expiry before publishing any fact. The reviewed
XRPL/FDC-triggered request is prefilled as a public example. The Payee view
derives its pending/ready/denied/expired/cancelled projection from that same
validated tuple; executed settlement remains unavailable until its exact
transaction receipt is also proven.

The Requests writer exposes only the router's existing public transitions:
execute a chain-derived `ALLOWED` request before its approved expiry, expire a
`PENDING`/`ALLOWED` request after its request expiry, or cancel as the exact
requester/policy owner. The policy owner is read from the bound registry policy,
not supplied by the browser. Each action uses a separate preview, preflight
simulation, injected-wallet signature, exact router-event verification, and
finalized terminal-state check. There is no create/submit-evaluation control and
no browser-supplied decision or `ALLOW` field.
Auditor request lookup uses the same wallet-free finalized router read and labels
it only as canonical request-state verification. Full auditor evidence remains
schema-checked against the request/evaluation digest, frozen machine set,
finalized input marker, execution status, and vault conservation equation;
signatures and private policy material are not accepted by the public evidence
wire, and a Pending request is never upgraded into FCC evidence.
Payee receipts bind the public target, asset, amount, expected timing, request
hash, settlement transaction, and resulting checkpoint; missing or drifting
receipts remain unavailable.
Team roles are schema-checked and hashed as public assignments; the permission
projection covers public controls only and always returns `canAuthorize: false`.
When no standalone role registry is deployed, Team instead shows only the
registry-bound policy owner plus the exact request creator and payee as
"observed request actors". These rows are not editable grants and make no team
permission claim.
Policy Studio custody progress accepts only the schema-checked three-machine
receipt bundle: each digest/signature must match the frozen binding and the
shared submission nonce/time window. Until a verified provider supplies that
bundle, the UI shows activation blocked and never substitutes a local receipt.
Notifications use a strict public feed with finalized block/time facts, typed
status/severity, public references, and domain-separated feed/export hashes. A
validated router checkpoint now produces one `EVIDENCE_VERIFIED` observation;
canonical Allowed/Denied/Executed/Expired states map to their exact request
notification kind. A Pending checkpoint is never labelled Ready or Allowed.
Export downloads only this schema-checked public feed, never policy plaintext,
ciphertext, signatures, or private denial reasons.

Run locally with the pinned Node toolchain:

```sh
PATH="$PWD/.local/toolchains/bin:$PATH" pnpm --filter @xrp-payguard/web dev
```

The connected public account/vault reader is a real Coston2 feature, but the UI
is not evidence of a complete PayGuard release or live FCC authorization.
Deploy the built static artifact with the Vercel CLI from the
repository root:

```sh
pnpm --filter @xrp-payguard/web build
vercel deploy apps/web/dist --prod --yes --project xrp-payguard
```

The deployment contains only `apps/web/dist`; wallet signing stays in the
injected wallet, while FCC machines, a relay, a policy provider, and a verified
PayGuard release remain external. The latest sanitized deployment record is
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
