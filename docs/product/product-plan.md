# XRP PayGuard product plan

## 1. Product identity

- Product: XRP PayGuard
- Category: confidential payment-policy and execution infrastructure
- Development network: Flare Testnet Coston2 (`114`)
- Primary asset journey: XRPL XRP → FDC/Smart Account → FTestXRP/FXRP vault →
  policy-authorized public action → supported redemption
- Confidential compute target: three fixed FCC machines with all-three policy
  custody receipts and two matching evaluation results

## 2. Product thesis

XRPL users can move value efficiently, but programmable spending often requires
public rules, a custodial service, or repeated manual approvals. Public rules
reveal internal limits, vendors, schedules, and operational policy; custodial
automation asks an operator to hold keys and decide whether a payment is valid.

PayGuard separates control from custody. The owner funds a public vault and
commits to a private deterministic policy held by registered FCC machines. A
public request executes only after threshold machines evaluate the same sealed
policy against the same canonical spend state. PayGuard never receives an XRPL
seed or EVM private key and never claims to hide the resulting token transfer.

## 3. Users

### Primary

- XRPL-native individuals managing subscriptions and delegated allowances.
- XRP/Flare treasury teams controlling recurring operational spend.
- DAOs paying contributors, services, grants, and infrastructure providers.

### Secondary

- Payees checking expected public execution and settlement status.
- Permissionless executors advancing scheduled or attested requests.
- Auditors verifying policy commitment, code/machine binding, result threshold,
  public spend state, and conservation without policy access.
- Wallet and dApp developers integrating reusable policy templates.

## 4. Core capabilities

### Policy Studio

- Versioned private policy authoring with deterministic local validation.
- Exact public/private preview before encryption.
- Independent encryption to tender-like fixed machine public keys.
- All-three machine receipt progress and commitment activation.
- Explicit replacement version; an active policy never mutates silently.

### Policy primitives

- Fixed and reference-currency public amount caps.
- Calendar and rolling-window budgets.
- Recurring schedule slots and occurrence limits.
- Target/merchant allowlist and denylist.
- Delegated spender/action classes.
- Start, end, grace, cooldown, and expiry rules.
- Deny precedence and emergency stop.

### Vault and funding

- Public FTestXRP/FXRP deposits and withdrawals.
- XRP-native funding through FDC and Smart Accounts.
- Multiple public budgets/vaults per owner.
- Exact balance, reserved amount, spent amount, and refund conservation.
- Official redemption exit where supported.

### Request and execution

- Owner-initiated, scheduled, and FDC-attested request types.
- Canonical request hash and spend checkpoint.
- FTSO-bound value input when required by policy.
- Two matching FCC decisions and one atomic execution.
- Explicit denied, expired, dependency-unavailable, and recovery states.

### Evidence and operations

- Wallet-free public action dossier.
- Machine/key/code version and threshold display.
- Policy commitment without policy content.
- FDC/FTSO checkpoint, decision digest, execution receipt, and conservation.
- Stateless executor recovery and public-safe notifications.

## 5. Product editions

### Personal

Simple templates, one owner, a small number of vaults, subscriptions,
allowances, emergency stop, and clear wallet-first recovery.

### Team

Policy proposal/activation roles, multiple budgets, recipient directory,
exports, notifications, and optional public multisig governance.

### Treasury

Large policy catalogs, strict role separation, custom adapters, operational
health, audit exports, change management, and bounded-value incident controls.

### Developer

Typed SDK, policy codec, simulation, action adapters, verification CLI, and
public evidence APIs.

## 6. Business and distribution model

Potential models are roadmap hypotheses, not current claims:

- free personal testnet/basic policies;
- per-vault or per-executed-policy fee;
- team subscription for templates, alerts, exports, and role management;
- treasury support/integration agreements;
- developer fees for managed execution/notification infrastructure.

On-chain authorization must remain usable if optional hosted UI or notification
services disappear. PayGuard may charge for services but must not become the
sole correctness authority.

## 7. Success metrics

- Policy creation and activation completion rate.
- Median time from XRPL funding to usable vault.
- Scheduled action execution and recovery success rate.
- Denial comprehension: users can explain why an action did not execute without
  exposing the private rule.
- Zero duplicate executions and exact public conservation.
- Policy-author confidence and payee confidence in public evidence.
- Real testnet repeat usage, not page views alone.

## 8. Non-goals and non-claims

- Hidden amount, recipient, timing, participation, or transaction graph.
- Custodial XRPL/EVM wallet, seed recovery, or key escrow.
- AI-generated canonical authorization.
- Arbitrary unrestricted smart-contract calls in the first release.
- Legal/compliance approval, fraud guarantee, chargeback, or dispute arbitration.
- Mainnet readiness, production-value custody, formal audit, SLA, or perfect
  confidentiality before separate evidence exists.

## 9. Product acceptance

The complete Coston2 release must demonstrate personal recurring payment,
treasury cap enforcement, owner denial, emergency stop, recovery, XRP-native
funding, and redemption. It must remain usable under a fresh browser/relay,
fail closed under every mandatory dependency outage, and expose sufficient
public evidence for an independent reviewer without revealing policy content.
