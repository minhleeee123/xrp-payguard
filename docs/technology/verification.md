# Verification and evidence plan

## 1. Evidence policy

Allowed public evidence:

- public addresses, extension IDs, code/image hashes, key fingerprints;
- transactions, blocks, statuses, gas, timings, checkpoint/result commitments;
- public policy/request fields and assertion booleans;
- sanitized dependency/version/source mappings.

Forbidden evidence:

- private policy plaintext or ciphertext;
- wallet/XRPL/FCC keys, seeds, signatures forbidden by policy, API credentials;
- proxy/indexer tokens, authenticated raw responses, private denial reasons;
- browser storage/network captures containing confidential payloads.

## 2. Gates

| Gate | Required proof | Status |
|---|---|---|
| 0 — Foundations | pinned supported tools, registries, services, three machine capacity | PARTIAL — FUNDING + CONTRACTS + CONTRACT REGISTRY DEPENDENCIES + FCC MANAGER SOURCE + PUBLIC RPC/EXPLORER API/FAUCET REACHABILITY + REGISTERED FOUNDATION SENDER + LOCAL REPRO IMAGE/3 IDs PASS / STABLE LIVE MACHINES AND AUTHENTICATED FCC INDEXER OPEN |
| A — FCC result | registered extension result verified on Coston2 | REGISTERED SENDER + LOCAL TYPED HANDLER/GOLDEN VECTOR PASS + PRODUCTION ADMISSION/CODE-VERSION/MACHINE-REGISTRATION OPERATIONS IMPLEMENTED/LOCALLY TESTED / LIVE CODE VERSION + MACHINE + RESULT NOT VERIFIED |
| B — Private policy ingress | sealed policy, three receipts, replay/domain negatives | LOCAL AUTH/ECIES PASS / SEALED LIVE NOT VERIFIED |
| C — Common custody | all-three matching policy availability and commitment | NOT STARTED |
| D — Deterministic evaluation | cross-language vectors and private policy result | LOCAL PASS / LIVE NOT VERIFIED |
| E — Threshold execution | two distinct exact results authorize one atomic action | LOCAL PASS + SOLUTION-3 COSTON2 SIMULATED-SIGNER LIFECYCLE PASS / CONTRACTS DEPLOYED / LIVE FCC EXECUTION OPEN |
| F — Vault conservation | deposits/reservations/spend/refund and adversarial invariants | LOCAL PASS / VAULT DEPLOYED / LIVE FAssets REQUEST/PAYOUT OBSERVED / CANONICAL SETTLEMENT + DEFAULT RECOVERY OPEN |
| G — XRP-native funding | XRPL payment, FDC proof, Smart Account deposit | PASS — live PayGuard-owned Coston2 evidence in [`evidence/coston2/xrp-fdc-smart-account-funding-2026-08-09.json`](../../evidence/coston2/xrp-fdc-smart-account-funding-2026-08-09.json) covers validated XRPL Testnet payment, FDC request/finalized round/proof commitment, on-chain `verifyXRPPayment`, `executeDirectMintingWithData`, and verified PayGuardVault accounting. The credential-free [`coston2-funding-resume-audit-2026-08-09.json`](../../evidence/coston2/coston2-funding-resume-audit-2026-08-09.json) reconstructs that completed public checkpoint, re-verifies the historical proof and current runtime bindings, and proves injected drift rejection; no actual delayed-event resubmission is claimed. FCC/private-policy/hosted release gates remain open. |
| H — Product release | full roles, recovery, accessibility, live deployment | STATIC VERCEL SHELL + PUBLIC-SAFE `/evidence/index.json` + LANDING + DESKTOP/MOBILE/KEYBOARD BROWSER SMOKE + CONTRACT DEPLOYMENT / HOSTED PRIVATE LIFECYCLE, RELAY, FCC, AND RELEASE MANIFEST OPEN |
| I — User validation | interviews, usability, and design-partner pilot | NOT STARTED |

## 3. Test matrix

### Protocol/model

- Golden vectors in Go, Solidity, and TypeScript.
- Schema malformed/unknown/oversized/boundary cases.
- Fixed/rolling/calendar cap boundaries and deterministic UTC slots.
- Reference conversion decimals, rounding, zero, overflow, and stale feed.
- Allow/deny precedence, action/target classes, delegated allowances.

### Contracts

- Unit/fuzz/invariant/stateful tests.
- Vault adversarial coverage includes reentrant callbacks, fee-on-transfer and
  false-return rollback, plus conservation/reservation/token-balance invariants.
- Receipt/signature/domain/machine/code/threshold negatives.
- Request replay, duplicate occurrence, attempt/expiry/grace behavior.
- Conservation across execute, deny, expire, stop, revoke, withdraw, refund.
- Reentrancy, malicious token, callback, adapter, and partial failure.
- Competing executors/finalizers and transaction-order races.

### FCC/private path

- Two byte-identical no-cache image builds, pinned base/frontend digests, and
  secret-free build context.
- Three fresh local container identities, startup sign/decrypt readiness,
  hardening, malformed-ingress failure, cleanup, and restart rotation.
- Wrong key/owner/policy/request/nonce/commitment/schema/code/machine rejection.
- Foundation result ABI, action ID/status/version/domain/binding checks plus
  canonical TEE and proxy signatures over their distinct pinned FCC domains.
- No plaintext/ciphertext in chain, logs, browser persistence, evidence, or output.
- Sealed restart behavior, rollback check, one-machine result outage.
- Replacement registration and frozen-policy failure/recovery.
- Split decisions and wrong result field rejection.

### Relay/executor

- Exact chain/registry/vault/router health and request-domain binding.
- Direct-client rate limits, bounded concurrency/body sizes, and owned timeout budgets.
- Identical in-flight evaluation/submission coalescing without durable private state.
- Competing executor, split-result, one-/two-machine outage, and restart-safe retry behavior.

### FDC/FTSO/Smart Account/FAssets

- Correct and wrong XRPL payment, destination, memo, owner, amount, fee, nonce.
- FDC request/finalization/DA proof/checkpoint resume and duplicate transaction.
- XRPL FDC consumer golden commitment, payment/memo/owner/freshness,
  runtime-verifier drift, transaction/proof replay, and verifier/router atomic
  rollback against both a rejecting mock and the real local router.
- Fresh/stale/unavailable/negative FTSO value.
- Direct mint success, delayed mint, callback/event mismatch, quote drift.
- FAssets approve/transfer/redeem request and non-instant exit semantics.
- Runtime direct-mint AssetManager/FAsset/payment-address lookup and integer
  quote observation without transaction submission.

### Product

- Wallet-free public evidence.
- Owner, team, payee, executor, and auditor journeys.
- Laptop/mobile, keyboard, screen-reader names, reduced motion.
- Refresh/reload/fresh-process recovery at every asynchronous checkpoint.
- Explicit dependency-unavailable and no-provider states.
- Production deploy smoke tied to exact source commit.
- Public web evidence build allowlist, metadata index, and absence of forbidden
  policy/key fields.

The local Vite browser smoke run on 2026-08-09 covered the landing page and all
seven application views at 1440px and 390px. It found no horizontal overflow;
the mobile shell exposed five primary destinations plus a three-item secondary
menu. The separate Vercel evidence record covers public HTML/JS/CSS and evidence
reachability, desktop/mobile Chrome captures, and Enter-key activation from the
landing page to the Overview view. Neither run is a live FCC or release smoke.

Separate Lighthouse 13.0.1 lab runs against the production landing and Overview
route scored 98 performance and 100 accessibility, best practices, and SEO for
both routes. The landing measured FCP/LCP 1,951 ms, TBT 37 ms, and CLS 0; the
Overview measured FCP 1,951 ms, LCP 1,987 ms, TBT 23 ms, and CLS 0. The specific
visible-label/accessibility-name mismatch and color-contrast audits both have
zero remaining nodes after aligning the brand name and raising the canonical
muted-text token to `#a0a0a0`. Lighthouse still estimates 94,516 landing and
97,582 Overview bytes of unused first-load JavaScript, so code splitting remains
an explicit performance optimization rather than a completed claim. This audit
covers the landing and Overview routes, not every authenticated or
provider-bound application state.

The production evidence-corpus audit recorded on 2026-08-09 fetched the pinned
Vercel origin, required JSON content types and HTTP 200, and matched the
metadata-only index plus all 13 listed bodies byte-for-byte with the reviewed
local sources. It reran recursive public-field checks and both simulation
boundaries. The repository-only result is
[`public-evidence-deployment-audit-2026-08-09.json`](../../evidence/web/public-evidence-deployment-audit-2026-08-09.json);
it is intentionally excluded from the hosted index and does not upgrade the
static shell or FCC/release claims.

## 4. Release manifest

A future `coston2.release.json` becomes authoritative only after it records and
verifies:

- network/chain and deployment block;
- contract addresses, runtime hashes, constructor/wiring, ownership/governance;
- extension ID, code/image version/hash;
- machine IDs, URLs, key fingerprints, status, and signer mapping;
- official protocol discovery sources/addresses;
- deployment and verification transactions;
- source commit and generated binding digest;
- evidence files and pass/fail assertions.

## 5. Release acceptance

The hackathon acceptance boundary is narrower than release acceptance: a
credential-free local three-machine simulation, public Coston2 facts, and the
Vercel public shell/evidence mirror may be demonstrated only with explicit
simulation and availability labels. Production FCC servers and the hosted
private lifecycle are post-hackathon work.

One separate solution-3 record now proves the deployed Coston2 registry,
router, and vault path with three ephemeral simulated signers, two matching
allow results, cap denial, stop/resume/revoke, and conservation. It is stored
under `evidence/simulation/`, asserts `hardwareTeeVerified: false` and
`registeredMachinesVerified: false`, and does not satisfy Gate A, B, C, or the
live portion of Gate E.

Do not call PayGuard complete when only a local demo works. Release requires a
real Coston2 lifecycle, live failure/recovery evidence, generated bindings,
public-safe hosted smoke, secret/privacy scans, user testing, and documentation
whose claims exactly match the deployed state.
