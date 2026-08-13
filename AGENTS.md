# XRP PayGuard — Agent and Contributor Guide

## 1. Product objective

Build a confidential, XRP-native payment-policy product on Flare. XRPL users
must be able to fund or authorize a public Flare action while keeping policy
rules private inside registered FCC machines. On-chain execution requires a
threshold result bound to the exact policy, request, account, chain, contract,
nonce, time window, and code version.

## 2. Read before changing code

1. `README.md`
2. `PLAN.md`
3. `docs/README.md`
4. `docs/competition.md`
5. `docs/product/product-plan.md`
6. `docs/product/user-journeys.md`
7. `docs/technology/requirements.md`
8. `docs/technology/architecture.md`
9. `docs/technology/contract-spec.md`
10. `docs/technology/threat-model.md`
11. `docs/technology/verification.md`
12. `docs/technology/reuse-inventory.md`

## 3. Source priority

1. A verified PayGuard Coston2 release manifest, once created.
2. Generated PayGuard bindings.
3. Sanitized PayGuard Coston2 evidence.
4. PayGuard production source and tests.
5. Official Flare documentation and supported registries/packages.
6. Canonical PayGuard product, architecture, threat-model, and verification docs.
7. Read-only VeilBid references and agent inference.

Until PayGuard has its own verified release, every deployment statement must
say `planned`, `target`, or `not yet verified`.

## 4. Non-negotiable invariants

- Policy plaintext and policy ciphertext must not enter calldata, events,
  public storage, analytics, browser persistence, public evidence, or logs.
- Private ingress must return registered machine-signed policy receipts before
  a policy commitment becomes canonical.
- Every canonical policy must freeze three compatible machine identities and
  key fingerprints. The target is all-three policy custody and two matching
  evaluation results.
- A client, relay, executor, payee, policy owner, or administrator must never
  supply or override `ALLOW`.
- Evaluation binds chain ID, registry, vault, router, policy ID, policy hash,
  machine/code policy, request hash, account, target, asset, public amount,
  schedule slot, spend checkpoint/root, nonce, attempt, and expiry.
- On-chain state is the canonical rollback/replay authority. Restart recovery
  must not silently restore an unsupported TEE identity.
- Ordinary FTestXRP/FXRP transfers reveal amount, recipient, and timing. Never
  market PayGuard as private money or a transaction mixer.
- XRPL seeds, EVM private keys, FCC keys, proxy credentials, signatures, and
  private policies never enter source, evidence, browser persistence, or logs.
- FDC, FTSO, FAssets, Smart Accounts, RPC, FCC, or relay failure must fail
  closed. No mock approval, price, proof, payment, or execution may represent
  success.
- FDC proves the specified external fact; it does not make an allowlisted Web2
  source semantically truthful.
- No AI or natural-language model may decide policy authorization in the
  canonical path.

## 5. Resource and repository boundaries

- The VeilBid repositories are read-only. Reuse requires an explicit inventory,
  provenance, adaptation, tests, and new PayGuard bindings/evidence.
- Never copy `.env*`, keys, deployment manifests, evidence, signatures,
  extension IDs, or machine identities from VeilBid.
- Official protocol addresses must be resolved through supported Flare sources.
  A reference address may not become a release fact by copying it into code.
- Keep local secrets only in ignored `.env.local` files with restrictive
  permissions.

## 6. Development discipline

- Build phase gates in order. A small local scaffold is not a Coston2 pass.
- Add deterministic cross-language fixtures before live deployment.
- Every architecture, privacy, deployment, or claim change updates canonical docs.
- Validate proportionally, then create focused commits. Do not commit failing,
  secret-bearing, or unsupported release claims.
- Record only public-safe evidence: addresses, hashes, blocks, transaction IDs,
  result commitments, timings, and assertion booleans.

## 7. Validation baseline

The final toolchain will pin Node, pnpm, Go, Foundry, Solidity, and official
Flare dependencies. Code changes must run applicable unit, lint/type, build,
privacy-output, secret, binding-drift, and live-gate checks. FCC/contracts also
require replay/domain, threshold, recovery, conservation, and evidence tests.

## 8. Gate reporting convention

- Default progress reports to the owner must count only gates inside the
  current pre-hackathon/submission boundary defined in `PLAN.md`.
- Exclude every explicitly post-hackathon gate from both the completed count
  and the denominator. Do not use the full-product roadmap percentage as the
  headline hackathon progress number.
- Report pre-submission owner actions and pre-submission user-validation
  targets separately when that distinction affects what the owner must do.
- Report full-roadmap totals only when the owner explicitly requests them, and
  label them `full product roadmap`, never `hackathon progress`.
