# Web application

Vite laptop-first Coston2 dApp with a full editorial landing page at `#landing`, plus
Policy Studio, Vaults, Requests, a strict solution-3 Demo lifecycle,
Payee, and wallet-free Auditor surfaces. Its visual language follows the
repository-level [`DESIGN.md`](../../DESIGN.md). Policy Studio uses a gated
`Template → Rules → Review → Activate` flow and computes a domain-bound
commitment from an in-memory draft only. It derives the owner from the connected
wallet, resolves the configured contract domain, uses human-readable UTC
controls, and separates disclosure review from activation. All four sections
remain visible in one vertical document; a sticky step bar follows scrolling and
jumps to any section without bypassing locked actions. The local candidate can
select the hosted V2 Coston2 candidate, independently encrypt to registered A/B/D
machines, collect verified receipts through the Railway relay, and register the
commitment for the connected wallet as policy owner. The owner—not the relay
executor—signs custody and request-specific evaluation authorizations. It does
not use browser storage or provide an authorization result.

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

Overview is removed because the Landing already owns onboarding and every
remaining fact has a dedicated task. Legacy `#app/overview` routes redirect to
Demo lifecycle. The sidebar groups `Policy Studio → Vaults → Requests` as the
main flow and `Demo lifecycle → Payee → Auditor` as verification. The former
Team/roles route redirects to Auditor because no editable role registry exists.

Desktop application views use refresh-safe hashes such as `#app/requests` and
participate in browser Back/Forward navigation. Landing section hashes remain
on the landing surface, view changes reset scroll and keyboard focus to the new
main region, and both application and landing surfaces expose a skip link.
Transient notices auto-dismiss and also provide an explicit close control.

The desktop interaction system deliberately separates controls from facts:
filled/outlined/underlined actions have complete hover, focus, pressed, and
disabled states; icon actions use bordered hit areas; editable inputs use a
persistent left rail and inset surface; static tags use a compact status rail;
and non-interactive landing cards do not move on hover. Template and accordion
controls expose explicit selection or expand/collapse markers.

Major cards also expose a small upper-right `?` control. Optional usage copy is
shown on hover or keyboard focus and can be pinned with a click, which keeps the
default Landing, Vault, and Requests surfaces concise. Canonical chain state,
amounts, public/private boundaries, fail-closed reasons, disabled prerequisites,
release limitations, and exact wallet previews stay visible rather than being
hidden in contextual help.

The application shell intentionally omits the repeated workspace label, V2
candidate banner, sidebar dependency card, and duplicate help link. Header
balances appear only after a verified finalized read. Vaults omits the large
explanatory EVM/XRPL path cards; Requests omits the repeated recovery strip; and
Team omits the duplicate role-registry footer note. Contextual fail-closed
reasons and evidence limits remain in the task that they qualify.

Demo lifecycle makes the reviewed hosted V2 candidate the primary wallet-free
proof. Its strict decoder requires exactly three distinct status-2 simulated
machine identities, all-three custody, two matching results for each decision,
thirteen successful Coston2 transactions, allow execution, cap denial,
stop/resume/revoke, conservation, and all negative hardware/release assertions.
Schema, transaction, threshold, conservation, or limitation drift makes the
entire proof unavailable. The older isolated V1 simulation remains collapsed
under an explicitly historical sandbox boundary and cannot become the active
deployment fallback. The Vite development server and production build expose
the same scanner-approved same-origin evidence bodies with JSON/nosniff headers.

The Vaults surface accepts only the verified finalized Coston2 account snapshot;
it verifies the conservation equation and shows no balance when the wallet or
RPC is unconfigured, unavailable, unfinalized, or invalid. Transaction signing
stays in the injected wallet, and the page never asks for or handles a private
key. The transaction panel appears before a compact three-value overview;
secondary accounting, runtime, finality, prepared-operation, and explorer facts
remain visible directly below it without a disclosure header. Unit coverage and
a browser preview smoke are complete; a fresh owner-wallet transaction submitted
from this UI is not yet recorded as release evidence.
Requests & schedules accepts an exact bytes32 request ID and reads the canonical
router tuple at one finalized Coston2 block without requiring a wallet. It
verifies reviewed runtime hashes, router wiring, the full contract domain, the
cross-language request hash, status/decision consistency, occurrence window,
threshold fields, and expiry before publishing any fact. A shared selector on
Requests, Payee, and Auditor contains only four previously created V2 test IDs
plus `Enter request ID`. Selecting a test ID copies it into the editable bytes32
field below; selecting `Enter request ID` clears that field for manual input.
Loading either kind still performs a fresh finalized lookup, and a compact note
separately explains that the four offered IDs come from earlier test runs.
Canonical on-chain status and time-derived readiness are displayed separately:
for example, `PENDING` plus `EXPIRED` means the time window passed while the
request still awaits an on-chain expiry transition. The Payee view uses the same
separation and never describes that state as an expected future payment;
executed settlement remains unavailable until its exact transaction receipt is
also proven.

For a policy activated in the current tab, Requests first lets the connected
policy owner create a public request and sign a request-specific FCC evaluation
authorization. The relay reconstructs public state, obtains two matching
machine results, and submits them through its bounded executor; the browser
cannot send a decision or `ALLOW`. The same surface then exposes the router's
public transitions:
execute a chain-derived `ALLOWED` request before its approved expiry, expire a
`PENDING`/`ALLOWED` request after its request expiry, or cancel as the exact
requester/policy owner. The policy owner is read from the bound registry policy,
not supplied by the browser. Each action uses a separate preview, preflight
simulation, injected-wallet signature, exact router-event verification, and
finalized terminal-state check. A stopped or revoked policy cannot create
another request; only a stopped policy can be resumed by its exact owner.
Auditor request lookup uses the same wallet-free finalized router read and labels
it only as canonical request-state verification. Full auditor evidence remains
schema-checked against the request/evaluation digest, frozen machine set,
finalized input marker, execution status, and vault conservation equation;
signatures and private policy material are not accepted by the public evidence
wire, and a Pending request is never upgraded into FCC evidence.
Payee receipts bind the public target, asset, amount, expected timing, request
hash, settlement transaction, and resulting checkpoint; missing or drifting
receipts remain unavailable.
The standalone Team & roles page is removed because the active product has no
editable role registry or team-management controls. Auditor instead shows a
compact `Actors & permissions` card for the loaded request: registry-bound
policy owner, exact requester, and public payee. These rows are observations,
not editable grants, and make no team permission claim. The legacy `#app/team`
route redirects to Auditor rather than leaving a dead link.
Policy Studio custody progress accepts only the schema-checked three-machine
receipt bundle: each digest/signature must match the frozen binding and the
shared submission nonce/time window. The configured hosted relay supplies this
bundle only after preflighting and forwarding independently encrypted copies to
registered A/B/D machines; otherwise activation stays blocked.
Notifications use a strict public feed with finalized block/time facts, typed
status/severity, public references, and domain-separated feed/export hashes. A
validated router checkpoint now produces one `EVIDENCE_VERIFIED` observation;
canonical Allowed/Denied/Executed/Expired states map to their exact request
notification kind. A Pending checkpoint is never labelled Ready or Allowed.
Export downloads only this schema-checked public feed, never policy plaintext,
ciphertext, signatures, or private denial reasons.

Policy Studio presents UTC `datetime-local` controls and converts them to exact
Unix seconds before deterministic validation and commitment. The raw contract
domain remains resolved and hidden from normal editing. This presentation layer
never changes the committed numeric values after conversion.

Run locally with the pinned Node toolchain:

```sh
PATH="$PWD/.local/toolchains/bin:$PATH" pnpm --filter @xrp-payguard/web dev
```

The verified Railway relay origin is also the source default, so a plain
production build cannot silently omit the live path. A reviewed deployment may
override it with `VITE_PAYGUARD_LIVE_RELAY_ORIGIN`; config preflight and exact
CORS still fail closed on any wrong or unavailable origin.

The connected public account/vault reader and hosted simulated-FCC V2 candidate
are real Coston2 features, but the UI is not evidence of a complete PayGuard
release or hardware FCC authorization.
Deploy the built static artifact with the Vercel CLI from the
repository root:

```sh
pnpm --filter @xrp-payguard/web build
vercel deploy apps/web/dist --prod --yes --project xrp-payguard
```

The current production deployment at <https://xrp-payguard.vercel.app/> contains
only `apps/web/dist`; wallet signing stays in the injected wallet. It calls the
pinned public Railway relay, while its executor key, FCC machines, and indexer
credentials remain external/server-side. A verified PayGuard release remains
unavailable. The latest production-corpus integrity record is
[`public-evidence-deployment-audit-2026-08-11.json`](../../evidence/web/public-evidence-deployment-audit-2026-08-11.json),
pinned to deployed source `3a271bd475637883297ce368109b3aed5df5935c`.

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
