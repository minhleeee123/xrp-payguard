# XRP PayGuard — visual and interaction system

> Status: canonical product UI direction. This document describes the intended
> visual language and interaction behavior; it is not deployment evidence.

XRP PayGuard is a confidential policy-control product for XRPL users and Flare
applications. The interface should feel like an encrypted terminal crossed with
a classified ledger: near-black surfaces, editorial serif headings, terminal
metadata, and one signal-lime action color. The design explains one boundary
repeatedly and honestly:

> **Policy rules stay private. The authorized action and settlement stay public.**

PayGuard is not private money, a mixer, an anonymous payment rail, or a mock
approval dashboard. Every screen must preserve that distinction and must show
`planned`, `local`, `not verified`, `unavailable`, `denied`, or `verified` as
appropriate to the evidence available.

## 1. Product surfaces

The website has two related surfaces with one visual system:

| Surface | Purpose | Layout |
| --- | --- | --- |
| Landing | Explain the private-policy/public-action problem, trust boundary, and flagship journey | Editorial single column, max 1280px |
| Application | Let owner, funder, executor, payee, team member, and auditor inspect public-safe state | Persistent app chrome, dense two-column workspaces |
| Documentation | Explain protocol, threats, verification, and limitations | Reading column with protocol/code panels |

The application navigation is grouped by purpose:

- Main flow: `Policy Studio` · `Vaults` · `Requests`.
- Verify: `Demo lifecycle` · `Payee` · `Auditor`.
- Admin: `Team & roles`.

There is no Overview screen. Landing owns onboarding; legacy
`#app/overview` routes redirect to the wallet-free Demo lifecycle.

The landing page may use a centered hero and a dotted globe illustration. The
application must prioritize task completion, public checkpoints, recovery, and
clear dependency state; it is not a marketing page disguised as a dashboard.

## 2. Brand voice and content rules

### Core language

- Say **private policy**, **FCC custody**, **public action**, **public
  settlement**, **threshold result**, and **public-safe evidence**.
- Say **planned**, **target**, or **not yet verified** for every unreleased
  Coston2 address, machine, deployment, or integration.
- Explain why a screen is blocked: missing provider, missing receipt, stale
  checkpoint, split result, expired request, or unavailable dependency.
- Use short, factual labels. A user should understand the current state without
  reading a protocol document.

### Forbidden product language

- private transfer, private money, mixer, anonymous payment, hidden amount;
- verified, signed, funded, executed, or settled when only a local preview exists;
- success after FCC, FDC, FTSO, RPC, relay, wallet, or Smart Account failure;
- “the policy was approved” when the UI has only computed a local commitment.

### Status vocabulary

| State | Meaning | UI treatment |
| --- | --- | --- |
| `LOCAL` | Deterministic local code/test only | Fog border, neutral text |
| `PLANNED` | Intended integration, not wired or verified | Ash metadata |
| `NOT VERIFIED` | A release fact is missing runtime or source proof | Ash metadata and explanation |
| `UNAVAILABLE` | A dependency cannot currently provide a required fact | Neutral outlined state, recovery action |
| `DENIED` | A canonical rule or dependency rejected the request | Neutral state plus public reason class |
| `VERIFIED` | Public evidence and release manifest prove the assertion | Signal lime outline/tag |

No color alone carries meaning. Every tag includes text and, where useful, an
icon or status dot with an accessible label.

## 3. Design tokens

### Colors

The palette is intentionally monochrome with one chromatic signal. Do not add
amber, red, blue, purple, gradients, or colored protocol logos to product UI.

| Token | Value | Use |
| --- | --- | --- |
| `--color-void-black` | `#000000` | Top bar, hero void, inline code background |
| `--color-carbon` | `#060606` | Dominant page canvas |
| `--color-graphite` | `#252525` | Card, nav, and code surfaces |
| `--color-onyx` | `#1f1f1f` | Raised application panel |
| `--color-iron` | `#313131` | Hover/focus surface and selected row |
| `--color-slate` | `#3d3d3d` | Dense table dividers and strong borders |
| `--color-fog` | `#525252` | Disabled and low-emphasis borders |
| `--color-ash` | `#a0a0a0` | Helper text, metadata, unavailable copy; minimum 4.97:1 contrast on the darkest supported raised/hover text surface |
| `--color-smoke` | `#8a8a8a` | Secondary captions |
| `--color-pearl` | `#c5c5c5` | Tertiary text |
| `--color-bone` | `#e5e5e5` | Body text |
| `--color-chalk` | `#ffffff` | Display headings and primary text |
| `--color-signal-lime` | `#c5ff4a` | Primary CTA, active state, verified outline |
| `--color-olive-depth` | `#597321` | Decorative globe stroke only |
| `--color-moss-shadow` | `#314013` | Decorative dotted-globe depth only |

The signal lime may be used in exactly three functional roles: filled primary
action, glowing outlined action/status, and one italic accent word in a display
headline. It must not be used for paragraphs, hashes at full length, icons at
full size, or entire panels.

### Typography

| Token | Family | Weight | Role |
| --- | --- | --- | --- |
| `--font-pt-serif` | PT Serif, Georgia fallback | 300 | Display headlines, section titles, one italic accent |
| `--font-inter-tight` | Inter Tight, system sans fallback | 400/500/600 | Body, navigation, labels, controls |
| `--font-jetbrains-mono` | JetBrains Mono, ui-monospace fallback | 400/500/600 | Hashes, protocol names, code, evidence values |

Fonts must have local/system fallbacks so the UI remains usable offline. Do not
make a remote font request a correctness dependency.

| Role | Size | Line height | Tracking |
| --- | ---: | ---: | ---: |
| Metadata label | 10–11px | 1.2 | `0.18–0.26em`, uppercase |
| Body | 14px | 1.55 | normal |
| App subheading | 20px | 1.3 | `-0.01em` |
| Section heading | 32–40px | 1.05–1.15 | `-0.025em` |
| Landing heading | 72–89px | `0.94–0.98` | `-0.035em` |
| Hash/evidence | 10–13px | 1.2–1.55 | `0.01–0.06em` |

Display serif is never used in buttons, nav, tags, form labels, or table copy.
Italic PT Serif is reserved for at most one signal word per headline.

### Spacing and geometry

- Page max width: `1280px`; application content uses `24–44px` outer gutters.
- Section gap: `80–120px` on landing; `16–24px` in application workspaces.
- Card padding: `24–40px`; dense table rows: `12–16px`.
- Element gap: `8–20px` depending on density.
- Cards and panels: `0px` radius. Buttons: `4px`. Metadata tags: `2px`.
- Status pills alone may use `9999px` radius.
- Cards have no drop shadow. Surface steps and hairline borders communicate
  elevation. The only glow is `0 0 8px rgba(197, 255, 74, 0.45)` on signal
  actions and verified outlines.

## 4. Shared components

### Top navigation

Landing and documentation use a sticky `64px` black top bar with a centered
`1280px` frame. The left side is a lime `P` logo tile plus `PayGuard` wordmark;
the center has uppercase ghost links; the right side has `OPEN APP` as an
outlined lime action. The bar never implies a connected wallet or live release.

Application uses the same top bar language with the current network and
connection state at the right. `Coston2 · planned` is valid; `Coston2 · live`
is not valid without a verified manifest.

### Application sidebar

The app has a `224–248px` left sidebar on laptop widths. It contains the
wordmark, role-aware navigation, and the public wallet identity in the footer.
The active item uses a lime left rule and text only; there is no colored tile
background. Repeated workspace, release-candidate, dependency-health, and help
cards do not occupy the global shell. The sidebar footer never shows a private
key, seed, or credential.

Desktop navigation labels the three groups `MAIN FLOW`, `VERIFY`, and `ADMIN`.
This hierarchy must remain visible without turning group labels into controls.

At widths below `760px`, the sidebar becomes a fixed bottom navigation with five
high-value destinations; secondary destinations remain reachable from a menu.
The bottom bar must not obscure form submit buttons or evidence rows.

### Signal CTA

```text
background: #c5ff4a
color: #000000
padding: 14px 24px
border-radius: 4px
font: Inter Tight 500, 14px
letter-spacing: .04em
shadow: 0 0 8px rgba(197,255,74,.45)
```

CTA copy describes a real local or public action: `VALIDATE DRAFT`, `OPEN
VAULT`, `VIEW CHECKPOINT`, or `CONNECT WALLET`. Never label a local computation
`ACTIVATE`, `EXECUTE`, or `APPROVED`.

### Ghost and outlined actions

Ghost navigation is transparent, borderless, uppercase, and tracked. An outlined
lime action is transparent with a `1px` lime border and the same small glow. A
disabled action uses fog border/text and explains its missing prerequisite.

### Sharp content card

Cards use `#1f1f1f` or `#252525`, a one-pixel graphite border, no shadow, and
left-aligned content. The first row is a bracketed metadata label and optional
section index (`[ PUBLIC CHECKPOINTS ]`, `B 01`). The title uses light PT Serif;
body copy uses Inter Tight.

### Contextual card help

Every major card exposes a compact `?` control in its upper-right corner. The
control reveals task-specific guidance on pointer hover and keyboard focus; a
click may pin it temporarily, and `Escape` closes it. The tooltip describes how
to use the surface and what its labels mean without turning the whole card into
a clickable object.

Move optional instructions and repeated explanatory prose into this help layer
to keep the default workspace scannable. Never hide a value or message that can
change a decision: canonical state, wallet/network state, amount, public/private
boundary, disabled-control prerequisite, fail-closed reason, hardware/release
limitation, or exact transaction preview must remain visible in the card.

### Evidence/code panel

Evidence panels use `#252525`, a `4px` radius, `24px` padding, and JetBrains Mono.
Long values wrap or offer a deliberate copy button; they never overflow the
viewport. Display only public-safe fields: addresses, hashes, block/transaction
IDs, timings, result commitments, and assertion booleans. Never render policy
plaintext, ciphertext, keys, signatures that policy forbids, raw ingress bodies,
or private denial reasons.

### Boundary map

Policy Studio uses three explicit groups, in this order:

1. **Public at activation** — chain/domain, owner, policy ID/version,
   commitment, schema, frozen machine/code policy once verified, and thresholds.
2. **Public at request** — target, asset, amount, requester, slot/occurrence,
   expiry, checkpoint, FTSO/FDC input commitment, decision digest, and transfer.
3. **Private in FCC** — target groups, deny precedence, caps, schedule
   relationships, delegated rules, salt, submission nonce, and intermediate
   evaluation details.

Each group is expandable and states *when* a field becomes visible. The public
evidence object is kept separate from the private in-memory preview in code.

### Status tag

Compact tags use uppercase Inter Tight at `10–11px`. `VERIFIED` uses a lime
status rail; every other state uses ash/fog. Tags include text such as
`0 / 3 VERIFIED`, `LOCAL`, `UNAVAILABLE`, or `DENIED`.

Status tags and informational badges must not resemble controls. They use a
compact filled label with a short left status rail, default cursor, and no hover
or pressed state. Static metric, guardian, and use-case cards likewise remain
visually stationary. Only a card implemented as a button may lift or change its
interactive border on hover.

### Interaction affordance

Primary actions use a filled lime surface; secondary actions use a lime outline;
tertiary text actions use a visible underline rail. All three have hover, active,
keyboard-focus, and disabled states. Icon-only actions sit inside a bordered
square rather than appearing as decorative glyphs. Buttons use at least a 40px
desktop control height, except compact icon and tertiary controls.

Editable text and numeric fields use a black inset surface, a high-contrast
border, a persistent left input rail, and a stronger label than helper copy.
Hover and focus strengthen the border; disabled inputs return to neutral gray.
Expandable rows expose a boxed plus/minus marker and a full-row hover state.

### Information density

The application shell shows only navigation, the current route, network,
available verified balances, notifications, and wallet action. Unknown balance
placeholders are hidden from the header rather than repeated as `—`. Release,
hardware, FCC, and dependency detail appears only where it changes a task or is
the subject of evidence; it is never repeated as a banner across every view.

Each view prioritizes its unique task. Repeated explanatory flows, duplicate
status summaries, and footer notices are removed when they add no action or new
fact. Safety-critical fail-closed reasons, public/private boundaries, canonical
state, and evidence limitations remain adjacent to the control or assertion
they qualify.

### Form and validation

Forms use visible labels, helper copy, deterministic field order, and no browser
storage. Validation errors appear beside the field and in a concise summary at
the top. Numeric protocol fields are unsigned decimal strings. Address and
domain fields are explicit; a local example is labeled `LOCAL EXAMPLE · NOT
VERIFIED`. A validation pass computes a commitment only in memory and never
creates a receipt or authorization.

Unix-second fields retain their exact decimal protocol value, but the desktop
form also renders a human-readable UTC timestamp or duration beneath the input.
This helper is presentation-only and must not alter the commitment.

The separate Interactive Demo may continue from that commitment only after the
user explicitly enters `SIMULATED FCC · COSTON2 TESTNET` mode. It encrypts the
draft independently to three demo actors and may display their signed receipts,
but every receipt row and transaction preview retains the simulation label. The
production activation panel remains blocked and visually separate.

## 5. Screen specifications

### Landing

Hero eyebrow: `[ PRIVATE POLICY · PUBLIC ACTION ]`.

Headline: `Authorize public value with private rules.` Use one italic lime
accent word at most. The supporting copy says that ordinary FTestXRP/FXRP
transfers reveal amount, recipient, and timing. The CTA is `OPEN POLICY STUDIO`.

Below the hero, one 6px lime divider appears once. Follow with three sharp cards:

- `FCC CUSTODY` — three matching policy receipts before activation;
- `PUBLIC EXECUTION` — two matching results over the exact request/checkpoint;
- `RECOVERABLE STATE` — chain checkpoints remain replay/rollback authority.

After the trust cards, the complete landing narrative uses this order:

1. public-ledger/private-rulebook data boundary;
2. three code-native guardian mascots;
3. XRPL → FDC/Smart Account → Flare vault → FCC gate → public action journey;
4. personal subscription, treasury vendor, and delegated-budget templates;
5. public-safe verified-versus-limited evidence terminal;
6. FAQ/limitations; and
7. a final local Policy Studio CTA.

No logo wall, partner claim, fake live metric, invented pilot, or repeated neon
divider is allowed. A longer landing page must increase comprehension rather
than repeat marketing copy.

### Guardian mascot system

The landing page may use three inline SVG mascots to make protocol ownership
memorable without becoming childish or implying live machines:

- **Cipher** — all-three compatible policy custody;
- **Quorum** — two distinct matching evaluation results; and
- **Ledger** — canonical chain checkpoint/replay authority.

Mascots use line-only Pearl/Ash strokes, a Moss/Olive orbit, and one tiny Signal
Lime status point. They use no raster assets, gradients, multicolor fills,
drop-shadows, remote requests, or hidden product claims. Each sits beside a
textual role and explicit `LOCAL`, `TARGET`, or `TESTED` label, so the SVG can be
decorative (`aria-hidden`) without losing information.

The three silhouettes must remain visibly distinct, not one robot with swapped
symbols. Cipher is a broad shield/vault with three converging custody nodes;
Quorum is a paired witness form joined by one digest diamond; Ledger is a tall,
stepped checkpoint monolith. Their ambient motion also communicates different
mechanics without changing state: Cipher runs an inward custody/scan pulse,
Quorum moves a dashed link between two witnesses, and Ledger advances three
checkpoint rows. Moss Shadow may tint the interior field and Olive Depth may
carry the mechanism stroke; Signal Lime remains one small status point per
mascot. No mascot gains a second chromatic accent or CTA-style glow.

### Policy Studio

The page is one gated four-step workflow: `Template → Rules → Review →
Activate`. A template must be selected explicitly and creates fresh in-memory
entropy. Rules derive owner from the connected wallet, use human-readable UTC
date controls, show schedule-specific fields only when relevant, and keep the
resolved contract domain read-only.

All four sections remain in one vertical desktop document. The compact step bar
is sticky below the global top bar and acts as a table of contents: scrolling
updates its active item, while clicking any item scrolls to that section.
Future sections stay visible and labelled `LOCKED`; only their state-changing
controls remain disabled until prior gates pass.

Review states the policy in plain language, separates public/private disclosure,
and repeats that ordinary transaction facts remain public. Only then may the
user compute the commitment. Activate remains locked until a valid commitment
exists and registration remains blocked until three registered,
domain-matching machine receipts are actually verified. It never creates local
receipts or displays `ALLOW`.

The separately namespaced V1 sandbox lives only inside Demo lifecycle's
historical archive. It never competes with or falls back into the V2 Studio.

### Vaults

Put the approve/deposit/withdraw task first. Follow it with one compact overview
showing available balance, wallet balance, and allowance. Deposited, reserved,
spent, withdrawn, finality, conservation, runtime, prepared operation, and the
explorer/faucet link remain visible below those headline values without a
disclosure header. With no verified provider, show `UNAVAILABLE` and recovery
instructions; never show a simulated balance.

### Requests and schedules

Use a public table for request ID, target, amount, schedule slot, checkpoint,
expiry, and terminal status. Pending requests do not reserve funds. Executor
buttons advance public checkpoints only and never accept a decision argument.
Show split, stale, unavailable, denied, expired, and executed states separately.
Always present canonical on-chain status separately from time-derived readiness.
For example, a request may be canonically `PENDING` while its window is
`EXPIRED`; explain that expiry still needs an on-chain transition instead of
implying payment remains expected.

### Payee

The payee sees expected public asset, amount, timing, request status, transfer
receipt, and supported redemption status. The page explicitly says that private
target rules, caps, delegates, and private denial reasons are not exposed.

### Auditor

Wallet-free by default. The auditor enters a public request ID or transaction
hash and receives only finalized evidence: policy commitment, machine/code
binding, FDC/FTSO facts, decision digest/signers, execution receipt, and
conservation assertions. An unconfigured evidence endpoint says it cannot assert
anything; it must not infer success from a local shell.

### Team and roles

Show policy author, funder, executor, payee, and auditor as separate roles. A
role description must state which public controls it has and that no role can
provide or override `ALLOW`. Policy changes are new versions with fresh custody
receipts; active rules never silently mutate.

### Desktop navigation and feedback

Every application surface has a stable `#app/<view>` hash and participates in
browser Back/Forward navigation. Landing section hashes stay on the landing
surface. A view change resets document scroll and moves focus to the new main
region; both shells expose a skip link. Desktop navigation never renders the
mobile-only `More` control. Transient notices provide a dismiss control and
expire automatically instead of permanently covering content.

## 6. Responsive, accessibility, and motion

- Laptop (`>=1100px`) is the primary review viewport: complete navigation,
  two-column Studio/evidence layout, and no horizontal scroll.
- Tablet (`760–1099px`) collapses secondary columns while retaining visible
  public/private labels and receipt state.
- Mobile (`<760px`) uses bottom navigation, one-column cards, wrapped hashes,
  full-width CTAs, and a visible submit/recovery action above the bottom bar.
- All controls have keyboard focus rings using lime against a dark surface;
  focus must not rely on color alone.
- Every icon-only button has an accessible name. Expandable data-map sections
  use native `details/summary` semantics or equivalent keyboard behavior.
- Respect `prefers-reduced-motion: reduce`; no information depends on animation.
- Keep body text at least `14px` and maintain readable contrast for ash metadata.

Landing motion is ambient and subordinate to reading: slow dotted-globe drift,
orbit rotation, small signal pulses, one scan line, gentle mascot float/blink,
surface-tone hover, and one-time intersection reveal. Motion never changes
status or exposes information. Content is visible before JavaScript enhancement;
the reveal state is added only when `IntersectionObserver` exists. Reduced-motion
mode removes transforms/reveals and shortens every animation to effectively
zero.

## 7. Privacy and implementation constraints

- No policy plaintext or ciphertext in browser persistence, analytics, logs,
  public evidence, calldata, events, or public storage.
- Draft state and cryptographic entropy are memory-only and discarded on refresh.
- The UI cannot supply a decision, policy evaluator field, mock price, mock
  proof, mock payment, or mock execution.
- Public/local/unavailable labels are derived from evidence state, not a static
  “verified” configuration flag.
- Do not copy VeilBid colors, deployment claims, identities, evidence, or
  credentials. Reused visual primitives require provenance in the reuse ledger.

## 8. Engineering mapping and visual QA

The current Vite app maps to:

| Design area | Source |
| --- | --- |
| Application shell and screens | `apps/web/src/main.ts` |
| Landing narrative and SVG mascots | `apps/web/src/landing.ts` |
| Policy Studio domain/preview | `apps/web/src/model.ts` |
| Base tokens and shared layout | `apps/web/src/styles.css` |
| Studio-specific components | `apps/web/src/studio.css` |
| Model/privacy tests | `apps/web/test/model.test.ts` |

Before a UI commit, verify:

1. Web unit tests, typecheck, and production build pass.
2. `docs:check`, secret scan, privacy scan, evidence check, and binding drift
   checks pass where applicable.
3. Fresh browser storage is empty after Studio use; no private payload appears
   in network or console output.
4. Laptop screenshots cover Landing, all four Studio steps, Vaults, Requests,
   Demo, Payee, Auditor, and Team states; `#app/overview` is checked as a Demo
   redirect.
5. Responsive screenshots cover the Studio form, boundary map, receipt progress,
   and recovery copy without horizontal overflow.
6. The rendered interface agrees with this document and never upgrades a
   planned/local state into a verified release claim.
