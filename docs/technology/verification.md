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
| E — Threshold execution | two distinct exact results authorize one atomic action | LOCAL PASS / CONTRACTS DEPLOYED / FCC EXECUTION OPEN |
| F — Vault conservation | deposits/reservations/spend/refund and adversarial invariants | LOCAL PASS / VAULT DEPLOYED / LIVE FAssets REQUEST/PAYOUT OBSERVED / CANONICAL SETTLEMENT + DEFAULT RECOVERY OPEN |
| G — XRP-native funding | XRPL payment, FDC proof, Smart Account deposit | PASS — live PayGuard-owned Coston2 evidence in [`evidence/coston2/xrp-fdc-smart-account-funding-2026-08-09.json`](../../evidence/coston2/xrp-fdc-smart-account-funding-2026-08-09.json) covers validated XRPL Testnet payment, FDC request/finalized round/proof commitment, on-chain `verifyXRPPayment`, `executeDirectMintingWithData`, and verified PayGuardVault accounting. FCC/private-policy/hosted release gates remain open. |
| H — Product release | full roles, recovery, accessibility, live deployment | LOCAL SHELL + LANDING + RESPONSIVE BROWSER SMOKE + CONTRACT DEPLOYMENT / HOSTED PRIVATE LIFECYCLE OPEN |
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
- Fresh/stale/unavailable/negative FTSO value.
- Direct mint success, delayed mint, callback/event mismatch, quote drift.
- FAssets approve/transfer/redeem request and non-instant exit semantics.

### Product

- Wallet-free public evidence.
- Owner, team, payee, executor, and auditor journeys.
- Laptop/mobile, keyboard, screen-reader names, reduced motion.
- Refresh/reload/fresh-process recovery at every asynchronous checkpoint.
- Explicit dependency-unavailable and no-provider states.
- Production deploy smoke tied to exact source commit.

The local Vite browser smoke run on 2026-08-09 covered the landing page and all
seven application views at 1440px and 390px. It found no horizontal overflow;
the mobile shell exposed five primary destinations plus a three-item secondary
menu. This is local UX validation only, not hosted deployment or release
evidence.

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

Do not call PayGuard complete when only a local demo works. Release requires a
real Coston2 lifecycle, live failure/recovery evidence, generated bindings,
public-safe hosted smoke, secret/privacy scans, user testing, and documentation
whose claims exactly match the deployed state.
