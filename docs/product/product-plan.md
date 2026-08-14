# XRP PayGuard product plan

## 1. Product identity

- Product: XRP PayGuard
- Category: treasury-first confidential payment-policy and execution
  infrastructure
- Development network: Flare Testnet Coston2 (`114`)
- Primary asset journey: XRPL XRP → FDC/Smart Account → FTestXRP/FXRP vault →
  policy-authorized public action → supported redemption
- Confidential compute target: three fixed FCC machines with all-three policy
  custody receipts and two matching evaluation results

## 2. Product thesis

XRP-native treasury teams can move value efficiently, but recurring vendor
payments often require public rules, a custodial service, or repeated manual
approvals. Public rules reveal internal limits, vendor relationships, schedules,
and operating conditions; custodial automation asks an operator to hold signing
authority or decide whether a payment is valid.

PayGuard separates policy confidentiality from transaction privacy. The
treasury funds a public vault and commits to a private deterministic policy held
by registered FCC machines. A vendor's public request executes only after two
machines evaluate the same sealed policy against the same canonical spend
state and sign the same result. PayGuard never receives an XRPL seed or EVM
private key and never claims to hide the resulting token transfer.

### Primary case study

A DAO creates a recurring-payment policy for a security vendor. The vendor can
submit an exact payment request without receiving the policy's internal limits,
schedule, or approval conditions. The request still reveals its recipient,
asset, amount, and timing. FCC results bind those public fields to the policy,
contracts, canonical spend state, nonce, and expiry; the router executes only
after the result threshold passes. Treasury members can inspect the public
request, threshold evidence, resulting transfer, and vault accounting without
access to policy plaintext.

This is an intended product workflow supported by the current testnet artifact,
not evidence of a DAO deployment, design partner, pilot, or market adoption.

## 3. Users and jobs to be done

### Primary

- **User and buyer:** an XRP/Flare treasury or DAO that controls recurring
  operational spend.
- **Core job:** let an approved vendor request bounded recurring payments
  without publishing the complete authorization policy or handing an
  automation operator signing keys and approval discretion.

### Roles in the flagship workflow

| Role | Job to be done | Canonical actions |
| --- | --- | --- |
| Treasury operator | Define and control the allowance | Create policy, verify custody receipts, fund, stop, resume, revoke, withdraw |
| Vendor/requester | Request an eligible payment without receiving the complete policy | Create the exact public request, authorize request-bound FCC evaluation, inspect result |
| Treasury member/auditor | Verify that the configured threshold authorized the public action | Inspect commitment, request, result signers, execution, and conservation |
| Executor | Advance an eligible public checkpoint without authorization discretion | Dispatch/submit matching results and execute an already allowed request |

### Secondary

- XRP-native individuals managing personal subscriptions and delegated
  allowances.
- DAOs using bounded grant, contributor, or infrastructure-provider policies.
- Wallet and dApp developers integrating reusable policy templates.

## 4. Core capabilities

### Policy Studio

- Versioned private policy authoring with deterministic local validation.
- Exact public/private preview before encryption.
- Independent encryption to the three fixed registered machine public keys.
- All-three machine receipt progress and commitment activation.
- Self-service ownership: every connected wallet can authorize custody,
  register its own commitment, fund its vault, and privately designate a
  requester/payee without signing each later payment request.
- Explicit replacement version; an active policy never mutates silently.

### Policy primitives

- Fixed and reference-currency public amount caps.
- Calendar and rolling-window budgets.
- Recurring schedule slots and occurrence limits.
- Target/merchant allowlist and denylist.
- Delegated spender/action classes.
- Start, end, grace, cooldown, and expiry rules.
- Deny precedence and emergency stop.

### Initial product templates

1. **Recurring vendor allowance (primary):** one approved requester/payee,
   bounded amount, schedule, occurrence limit, expiry, and emergency stop.
2. **DAO grant or contributor budget:** delegated requester, fixed or rolling
   cap, approved target class, explicit policy version, and public audit trail.
3. **Personal subscription (secondary):** recurring slot, merchant rule,
   occurrence cap, expiry, and owner recovery.

### Vault and funding

- Public FTestXRP/FXRP deposits and withdrawals.
- Human-unit amount entry throughout the UI; base-unit conversion is internal.
- One deposit intent that transparently sequences an exact approval only when
  finalized allowance is insufficient, while retaining separate wallet
  confirmations and receipt/postcondition checks.
- XRP-native funding through FDC and Smart Accounts.
- Multiple public budgets/vaults per owner.
- Exact balance, reserved amount, spent amount, and refund conservation.
- Official redemption exit where supported.

### Request and execution

- Owner-initiated, delegated-requester, scheduled, and FDC-attested request
  types.
- Shareable public policy commitment; the authorized requester creates and
  signs its own request while private requester/payee rules remain in FCC.
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

### Treasury

Large policy catalogs, strict role separation, custom adapters, operational
health, audit exports, change management, and bounded-value incident controls.

### Team

Policy proposal/activation roles, multiple budgets, recipient directory,
exports, notifications, and optional public multisig governance.

### Personal

Simple templates, one owner, a small number of vaults, subscriptions,
allowances, emergency stop, and clear wallet-first recovery.

### Developer

Typed SDK, policy codec, simulation, action adapters, verification CLI, and
public evidence APIs.

## 6. Business and distribution model

Potential models are roadmap hypotheses, not current claims:

- treasury support/integration agreements;
- team subscription for templates, alerts, exports, and role management;
- per-vault or per-executed-policy fee;
- free personal testnet/basic policies;
- developer fees for managed execution/notification infrastructure.

On-chain authorization must remain usable if optional hosted UI or notification
services disappear. PayGuard may charge for services but must not become the
sole correctness authority.

## 7. Success metrics

- Treasury-to-vendor journey completion without a per-payment owner signature.
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
- Independent FCC operators in the current Coston2 candidate; A/B/D are
  registered `SIMULATED_TEE` machines, not a hardware-backed multi-operator
  release.

The [operating-model comparison](competitive-analysis.md) explains the intended
differentiation and its assumptions. It is product analysis, not user research,
market-share evidence, or a claim that every alternative has identical
properties.

## 9. Product acceptance

The complete Coston2 release must demonstrate personal recurring payment,
treasury cap enforcement, owner denial, emergency stop, recovery, XRP-native
funding, and redemption. It must remain usable under a fresh browser/relay,
fail closed under every mandatory dependency outage, and expose sufficient
public evidence for an independent reviewer without revealing policy content.
