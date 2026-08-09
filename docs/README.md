# XRP PayGuard documentation

## Canonical documents

- [`../DESIGN.md`](../DESIGN.md): canonical visual and interaction system for
  the landing, application, and public-safe evidence surfaces.
- [`competition.md`](competition.md): supplied competition requirements and
  claim boundaries.
- [`hackathon-handoff.md`](hackathon-handoff.md): solution-3 demo runbook,
  validation results, pushed commits, and exact verified-versus-limited claims.
- [`submission-draft.md`](submission-draft.md): copy-ready Interoperable Asset
  Products submission facts, public identifiers, limitations, and owner-only
  completion steps.
- [`product/product-plan.md`](product/product-plan.md): complete product vision,
  users, capabilities, and acceptance criteria.
- [`product/discovery.md`](product/discovery.md): frozen first problem,
  one-sentence demo, data map, and explicit zero-session validation record.
- [`product/production-readiness-plan.md`](product/production-readiness-plan.md):
  planned audit, FCC liveness incentives, pricing, support, and gated mainnet
  adoption without production-readiness claims.
- [`product/user-journeys.md`](product/user-journeys.md): end-to-end journeys
  for policy owner, payee, executor, and auditor.
- [`technology/requirements.md`](technology/requirements.md): required Flare
  primitives and current official sources.
- [`technology/coston2-dependency-resolution.md`](technology/coston2-dependency-resolution.md):
  timestamped official-registry lookup observation, explicitly not a PayGuard release.
- [`technology/coston2-public-endpoints.md`](technology/coston2-public-endpoints.md):
  credential-free Coston2 RPC, Explorer API, Explorer, and faucet reachability observation.
- [`technology/smart-account-custom-instruction.md`](technology/smart-account-custom-instruction.md):
  public `PersonalAccount`/nonce resolver, `0xFE` `PackedUserOperation` codec,
  and direct-mint quote boundary.
- [`technology/coston2-contract-deployment.md`](technology/coston2-contract-deployment.md):
  fail-closed, resumable contract deployment and independent runtime/wiring checks.
- [`technology/fcc-attestation-domain.md`](technology/fcc-attestation-domain.md):
  pinned tee-node sign-port behavior and PayGuard cross-language signature domain.
- [`technology/fcc-private-policy-wire.md`](technology/fcc-private-policy-wire.md):
  canonical encrypted policy wire, fresh TEE identity derivation, and loopback decryption.
- [`technology/fcc-container-build.md`](technology/fcc-container-build.md):
  pinned reproducible image and disposable local three-machine smoke boundary.
- [`technology/fcc-foundation-deployment.md`](technology/fcc-foundation-deployment.md):
  fail-closed official-manager resolution and resumable sender registration.
- [`technology/release-manifest.md`](technology/release-manifest.md): canonical
  public-safe Coston2 release-manifest shape and verification gate.
- [`technology/foundations.md`](technology/foundations.md): pinned local
  toolchain, official source map, and external Gate 0/1 blockers.
- [`technology/reuse-ledger.md`](technology/reuse-ledger.md): PayGuard-specific
  adaptation record for the read-only official FCC scaffold.
- [`../packages/integrations/README.md`](../packages/integrations/README.md):
  public-only XRP/FDC/FTSO/Smart Account checkpoint boundaries.
- [`integration-guide.md`](integration-guide.md): compile-tested XRPL-wallet
  and Flare-dApp examples plus the fail-closed adoption checklist.
- [`technology/architecture.md`](technology/architecture.md): component model,
  public/private data, trust, and recovery.
- [`technology/contract-spec.md`](technology/contract-spec.md): V1 schemas,
  local state machines, and live signature-domain requirements.
- [`technology/threat-model.md`](technology/threat-model.md): attacker model,
  mitigations, residual risk, and non-claims.
- [`technology/verification.md`](technology/verification.md): evidence gates and
  release acceptance.
- [`technology/reuse-inventory.md`](technology/reuse-inventory.md): what may and
  may not be adapted from VeilBid.
- [`technology/repository-layout.md`](technology/repository-layout.md): planned
  workspace ownership and boundaries.
- [`lessons/veilbid-build-lessons.md`](lessons/veilbid-build-lessons.md): failure
  modes and implementation lessons.

## Supplied and reference material

- `reference/original/` is a byte-for-byte working copy of the owner-supplied
  Summer Signal source material from the VeilBid workspace.
- `reference/hackathon-brief.supplied.md` is the prior project's translation of
  that supplied brief. Dates and prize figures must be reconfirmed externally.
- [`reference/SOURCE-PROVENANCE.md`](reference/SOURCE-PROVENANCE.md) records the
  source commit and hashes of copied owner-supplied material.
- Files ending in `.reference.md` under `technology/` are read-only VeilBid
  references. They are not PayGuard architecture or deployment claims.

When canonical PayGuard docs disagree with a copied reference, canonical
PayGuard docs control the product direction; official Flare sources and a
future verified PayGuard release control live protocol facts.
