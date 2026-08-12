# Desktop UI/UX working notes

Last updated: 2026-08-12

This file records owner-reviewed desktop UI/UX decisions before the next
combined implementation and deployment. Mobile is outside the current review
scope. These notes do not change PayGuard's protocol, privacy, evidence, or
release claims.

## Status legend

- `IMPLEMENTED LOCALLY`: present in the current uncommitted local UI pass.
- `RESOLVED / IMPLEMENTED LOCALLY`: an earlier choice was resolved during the
  combined implementation and is present locally.

## 1. Interaction affordance

Status: `IMPLEMENTED LOCALLY`

The previous UI did not separate actions, information, and editable fields
strongly enough. The local pass now applies these rules across Landing and all
desktop app views:

- Primary actions use a filled lime button with hover, active, focus, and
  disabled states.
- Secondary actions use a lime outline; tertiary actions use an underline rail.
- Icon-only actions use a bordered square hit area instead of a decorative
  glyph appearance.
- Editable inputs use a black inset surface, stronger label, visible border,
  persistent lime input rail, and distinct focus/disabled states.
- Status tags use a compact left status rail, default cursor, and no button-like
  hover state.
- Static guardian and use-case cards no longer lift or change border on hover.
- Policy templates explicitly show `SELECT TEMPLATE` or `✓ SELECTED`.
- FAQ and expandable technical sections expose boxed `+ / −` markers.

Validation for the combined pass is recorded after section 10 below. The
earlier interaction-only pass completed its own desktop visual QA, web
typecheck, build, and focused tests.

## 2. Landing navigation

Status: `IMPLEMENTED LOCALLY`

Reduce the landing header navigation from five items to three:

- `HOW IT WORKS` → journey/architecture section.
- `USE CASES` → use-case section.
- `EVIDENCE` → evidence section.

Remove `WHY` and `GUARDIANS` from the header only. Keep both content sections
on the page. Rename `ARCHITECTURE` to the more user-facing `HOW IT WORKS`.

## 3. Landing calls to action

Status: `IMPLEMENTED LOCALLY`

The landing currently contains too many repeated buttons into the app. Retain
one contextual entry for each distinct task:

- Header `Open app`.
- Hero `Verify live V2 lifecycle` as the primary demo action.
- Evidence `Open Auditor`.
- Final section `Open Policy Studio`.

Remove:

- Hero `Open Policy Studio` because Studio remains available at the end.
- Evidence `Open lifecycle` because the hero already links to the lifecycle.

Keep `Understand the boundary` and `Evidence index` as text links.

## 4. Remove the current Overview surface

Status: `IMPLEMENTED LOCALLY`

The current Overview repeats onboarding and calls to action already provided by
Landing. Its remaining facts already have dedicated destinations:

- Balances and conservation → Vaults.
- Request state → Requests.
- Wallet, network, and faucet → global top bar.
- V2 candidate state → global candidate context.

Implemented changes:

- Remove `Overview` from the sidebar.
- Route Landing `Open app` directly to `Policy Studio`, the first main task;
  keep the hero lifecycle action as the wallet-free review path.
- Keep the app logo as the route back to Landing.
- Redirect the legacy `#app/overview` URL to `#app/demo`.
- Reintroduce a Dashboard/Home only when it can show meaningful multi-policy,
  alert, pending-action, or activity data.

## 5. Landing CTA overlap after Overview removal

Status: `RESOLVED / IMPLEMENTED LOCALLY`

The overlap is resolved by routing header `Open app` to Policy Studio, the first
main workflow, while the hero `Verify live V2 lifecycle` remains the contextual
wallet-free Demo entry. The final section retains its explicit Policy Studio
entry because it follows the complete product explanation rather than competing
inside the hero.

## 6. Policy Studio information architecture

Status: `IMPLEMENTED LOCALLY`

Use one vertical four-step task flow. All four sections remain visible from top
to bottom; locked sections expose their context but keep state-changing controls
disabled until the preceding gate passes.

### Step 1 — Template

- Show `Personal recurring`, `Delegated allowance`, and `Treasury vendor`.
- Require an explicit template choice before continuing.

### Step 2 — Rules

Keep the user-facing fields focused on the policy intent:

- Policy name.
- Allowed target.
- Maximum per action.
- Daily cap.
- Schedule.

Additional behavior:

- Derive Owner from the connected wallet instead of requiring manual entry.
- Use human-readable date/time controls instead of raw Unix timestamps.
- Ask whether the policy is `Ad-hoc` or `Recurring`; show Interval and Grace
  only for recurring policies.
- Move occurrence limit into `More options`.
- Resolve contract addresses from the configured domain. Do not expose normal
  editable Registry, Vault, Router, or Asset inputs.

### Step 3 — Review

- Present a human-readable policy sentence before technical data.
- Show separate `Public` and `Private` disclosure summaries.
- Repeat that ordinary amount, recipient, timing, and transaction graph remain
  public.
- Use one primary `Compute policy commitment` action.
- Move hashes and exact contract domain into collapsed `Technical details`.

### Step 4 — Activate

- Always show the section; show a locked prerequisite state until a valid
  commitment exists.
- Display the three frozen FCC machines and `0/3` through `3/3` custody receipt
  progress.
- Preserve fail-closed unavailable/error states.
- Enable registration only after the exact custody and domain requirements pass.

Remove the Legacy V1 sandbox from Policy Studio and keep it only in the Demo
lifecycle/archive. Continue keeping policy drafts and entropy in memory only;
refresh intentionally discards them.

## 7. Policy Studio compact step navigation

Status: `IMPLEMENTED LOCALLY`

Add one compact horizontal stepper below the Policy Studio title:

`01 Template → 02 Rules → 03 Review → 04 Activate`

Required behavior:

- Show `Step X of 4`.
- Use lime for the active step and `✓` for completed steps.
- Keep future steps visibly locked until prerequisites pass.
- Allow navigation to every section, including a locked section for inspection.
- Do not allow Review or Activate to bypass validation.
- Keep the stepper compact and sticky below the global top bar throughout the
  long desktop form.
- Update the active step while scrolling and scroll to the selected section when
  its step is clicked.
- Retain clear `Back / Continue` actions inside the corresponding sections.

The stepper represents one in-memory workflow, not four unrelated product
pages. No private draft value may enter the URL or browser persistence.

## 8. Vault information architecture

Status: `IMPLEMENTED LOCALLY`

The current Vault screen gives too much space to informational summaries and
funding explanations before the user reaches the actual task. Reorder the page
so the action surface comes first.

### First card — Manage funds

Place the current `Approve, deposit or withdraw` card immediately below the
page title, before all vault information cards. It remains the only main
transaction surface and contains:

- One `Amount in FTestXRP` input.
- `Prepare exact approval`.
- `Prepare deposit` as the primary action.
- `Prepare withdrawal`.
- The exact two-stage wallet preview and final receipt/error result.

When wallet/finalized prerequisites are unavailable, keep the input and
transaction actions visibly disabled and provide the appropriate connect/retry
action without inventing live values.

### Second card — Vault overview

Keep the existing public `FTestXRP vault` data in one compact `Vault overview`
card. The redundant large `EVM TESTNET PATH` and `XRPL-NATIVE PATH` panels have
already been removed. Its first row shows:

- Asset and shortened account.
- One `LIVE`, `READ BLOCKED`, or `CONNECT` status label.
- Available FTestXRP.
- Wallet balance.
- Vault allowance.
- A compact refresh icon action.

The token `X` mark is informational and must not use a lime outlined treatment
that resembles an icon button.

### Always-visible account details

Remove the `Verification & account details` disclosure and show these facts
directly below the three headline balances:

- Finalized block.
- Deposited, Reserved, Spent, and Withdrawn totals.
- Conservation verification.
- Contract runtime verification.
- The exact EVM operation currently being prepared, only when relevant.

The large three-step EVM instructional panel, separate XRPL evidence card, and
redundant `TRANSACTIONS READY` label are removed locally. Funding evidence
remains available from the evidence-focused surfaces instead of being repeated
inside the transaction task.

The final desktop order is:

1. Page title.
2. `Manage funds` — input and transaction actions.
3. `Vault overview` — compact headline balances followed by always-visible
   technical/account details.

## 9. Application information density

Status: `IMPLEMENTED LOCALLY`

The application was repeating release, hardware, workspace, and dependency
context around nearly every task. This made ordinary status copy compete with
real controls and canonical data. The current local implementation removes:

- The global workspace label and V2 live-candidate banner.
- The sidebar candidate/dependency card and duplicate landing/help link.
- Empty FTestXRP and C2FLR placeholders from the header before a verified read.
- The duplicate Overview dependency-health/trust-surface panel.
- The large Vault EVM and XRPL explanatory path panels.
- The Requests fresh-process recovery strip.
- The duplicate Team role-registry footer note.

The audit deliberately retains information that changes a decision or is the
screen's core function: wallet and network state, fail-closed reasons near
disabled controls, canonical request state, public/private boundaries, Demo
lifecycle evidence, Payee facts, Auditor evidence, and the role rows themselves.

Policy Studio's Legacy V1 setup has moved into the collapsed Demo lifecycle
archive. Its sandbox preparation and registration controls remain available
without competing with the primary V2 policy workflow.

## 10. Contextual card guidance

Status: `IMPLEMENTED LOCALLY`

Every major Landing card and application panel now receives a compact `?`
control in its upper-right corner. Its task-specific guidance opens on hover or
keyboard focus, can be pinned with a click, and closes with blur or `Escape`.
The card itself remains informational unless it contains a separately styled
button, link, input, or disclosure control.

To reduce default density, the local pass moves optional usage explanations out
of Landing guardian, architecture-step, and use-case cards, plus the Vault and
Requests action cards. The visible surface retains titles, statuses, inputs,
actions, and canonical values. It also deliberately keeps safety-critical facts
visible: fail-closed reasons, public/private boundaries, testnet and hardware
limitations, request state, exact amounts, wallet previews, and disabled-action
prerequisites.

Desktop navigation remains available during long-page review. The Landing
header stays pinned while its sections scroll, and the workspace sidebar keeps
the complete Main flow and Verify navigation visible independently of the
active page content. The workspace top bar remains pinned as before. The former
`Team & roles` page is removed because it had no management actions; its useful
request-bound owner, requester, and payee facts now appear in a compact Auditor
card. The legacy route redirects to Auditor.

## 11. Reviewed request identifiers

Status: `IMPLEMENTED LOCALLY`

Requests, Payee, Auditor, notifications, and Auditor's observed actors share one
validated request checkpoint. The former prefilled XRPL/FDC request belongs to
the retained V1 router and fails with `UnknownRequest` when queried through the
active V2 reader, so it is not offered by the V2 selector.

The shared selector now offers four public test IDs that were created before
the current browser session:

- `0x44971c87…79cc1d` — created at block `33941308` and deliberately left
  `PENDING`; create transaction `0x80d4921a…6c34dd`.
- `0x6eef6875…7efc2b` — created and then `CANCELLED` at block `33941321`;
  cancellation transaction `0x28edbafb…c151f`.
- `0x61dfc0cd…93817` — previously `DENIED` with `CAP_EXCEEDED` in the reviewed
  hosted-relay lifecycle.
- `0xc4147a70…83658` — previously threshold-approved and `EXECUTED` in the
  reviewed hosted-relay lifecycle.

The Pending and Cancelled examples use a new active V2 test policy frozen at
block `33941301` after three registered A/B/D custody receipts. The local UI
records no private policy, ciphertext, credential, authorization, signature,
or key. This remains Coston2 `SIMULATED_TEE` test evidence, not hardware
attestation or a verified release.

The dropdown contains only the four full IDs plus `Enter request ID`; it does
not add status, block, transaction, or Explorer metadata to the option list.
Selecting an offered ID copies it into the always-visible editable field below.
Selecting `Enter request ID` clears that field and focuses it for manual entry.
A short note identifies the four values as previously created test IDs, while
status and other public facts appear only after a fresh finalized lookup.

## 12. Self-service policy ownership

Status: `IMPLEMENTED LOCALLY · NOT YET DEPLOYED`

Policy Studio no longer treats the hosted relay executor as the policy owner.
The connected Coston2 wallet is frozen into the commitment, signs one exact
authorization for each A/B/D encrypted copy, verifies all three custody
receipts, and submits registration. Step 4 now exposes the missing activation
actions and distinguishes `ACTIVE`, `STOPPED`, and terminal `REVOKED` state.
Switching wallets requires rebinding, re-reviewing, and recomputing instead of
silently changing ownership.

Requests shows a compact action card only for a policy activated in the current
tab. Its owner can create the public request, sign a short-lived evaluation
authorization, and execute only a threshold-derived `ALLOW`. A stopped or
revoked policy cannot create another request. The relay executor may sponsor
bounded dispatch/result-submission gas but cannot own, govern, or decide a
policy. Browser refresh still discards private workflow state by design; public
request IDs remain independently reloadable.
Terminal denied, expired, and cancelled Payee states must not use an `Expected
payment` heading; the executed example remains unavailable in Payee until its
exact settlement receipt is also verified.

## Combined-pass validation

- Desktop visual QA completed at 1440×1000 for Landing and the application
  destinations. The contextual-help count matches the major-card count on every
  rendered surface, and automated geometry checks found no overlap with status,
  refresh, input, or select controls.
- Follow-up QA verifies all four Policy Studio sections render in one document,
  the step bar remains fixed at 64px below the global topbar, locked step clicks
  scroll without enabling compute/custody actions, and Vault account details are
  visible without a disclosure element.
- Hover/focus display, click-to-pin, `Escape` dismissal, and accessible tooltip
  relationships were exercised in the browser.
- Web typecheck and production build pass; 61 web tests pass and 3 environment-
  gated tests remain skipped.
- Documentation, secret, privacy, public-evidence, and diff-whitespace checks
  pass. The privacy scan confirms no browser persistence.
- The complete repository gate is not runnable in this container because pinned
  Go 1.25.12 and Foundry 1.7.1 are absent. `bindings:check` is blocked by the same
  missing `forge` binary; this is an environment preflight limitation rather
  than a web failure.

## Deployment boundary

The owner approved this combined desktop set for a focused commit and push,
followed by one production Vercel deployment on 2026-08-12. Production must be
rebuilt from the committed source and checked at the public alias after publish.
