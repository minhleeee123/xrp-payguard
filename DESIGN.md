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

The application navigation is:

`Overview` · `Policy Studio` · `Vaults` · `Requests` · `Payee` · `Auditor` ·
`Team & roles`

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
| `--color-ash` | `#7a7a7a` | Helper text, metadata, unavailable copy |
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
wordmark, `PERSONAL WORKSPACE`/team name, role-aware navigation, and a compact
dependency-status block. The active item uses a lime left rule and text only;
there is no colored tile background. The sidebar footer shows wallet state and
never a private key, seed, or credential.

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

Transparent tags use a one-pixel border and uppercase Inter Tight at `10–11px`.
`VERIFIED` and active controls use signal lime; every other state uses ash/fog.
Tags include text such as `0 / 3 VERIFIED`, `LOCAL`, `UNAVAILABLE`, or `DENIED`.

### Form and validation

Forms use visible labels, helper copy, deterministic field order, and no browser
storage. Validation errors appear beside the field and in a concise summary at
the top. Numeric protocol fields are unsigned decimal strings. Address and
domain fields are explicit; a local example is labeled `LOCAL EXAMPLE · NOT
VERIFIED`. A validation pass computes a commitment only in memory and never
creates a receipt or authorization.

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

The final section shows the flagship XRPL → FDC/Smart Account → Flare vault →
public action journey and a plain limitations block. No logo wall or fake live
metrics is allowed.

### Overview

The overview opens with the active role/workspace and a one-line network state.
Metrics are public facts only: available balance, reserved, active policy
versions, and next public checkpoint. Unknown values use `—` plus an explanation;
zero must not mean “provider unavailable.” A trust-surface list shows FCC, FDC,
FTSO, router/vault, and wallet states independently.

### Policy Studio

The page starts with three templates: personal recurring, delegated allowance,
and treasury vendor. A template changes only an in-memory draft and creates new
entropy. The form collects policy name, owner, target, caps, UTC window,
schedule, occurrence bound, and explicit public contract domain.

The primary action is `VALIDATE & COMPUTE`. After validation, show the commitment,
exact boundary map, and `0 / 3 VERIFIED` receipt progress. The activation panel
must remain blocked until three registered, domain-matching machine receipts are
actually verified. It must never create local receipts or display `ALLOW`.

### Vaults

Show public deposited/available/reserved/spent/withdrawn conservation. Funding
steps clearly distinguish XRPL wallet signing, asynchronous FDC proof, Smart
Account operation, and final public receipt. With no verified provider, show
`UNAVAILABLE` and recovery instructions; never show a simulated balance.

### Requests and schedules

Use a public table for request ID, target, amount, schedule slot, checkpoint,
expiry, and terminal status. Pending requests do not reserve funds. Executor
buttons advance public checkpoints only and never accept a decision argument.
Show split, stale, unavailable, denied, expired, and executed states separately.

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
4. Laptop screenshots cover Overview, Studio empty/valid/error, Vaults,
   Requests, Payee, Auditor, and Team states.
5. Responsive screenshots cover the Studio form, boundary map, receipt progress,
   and recovery copy without horizontal overflow.
6. The rendered interface agrees with this document and never upgrades a
   planned/local state into a verified release claim.
