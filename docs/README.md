# XRP PayGuard documentation

This directory keeps only the documents that help a judge understand the
product, verify its implementation boundary, or reproduce the public evidence.

## Submission and product

- [`hackathon-handoff.md`](hackathon-handoff.md): current demo boundary,
  validation results, public links, and limitations.
- [`submission-draft.md`](submission-draft.md): copy-ready submission facts and
  owner-only completion steps.
- [`competition.md`](competition.md): selected track, judging requirements, and
  claim boundaries.
- [`new-work-ledger.md`](new-work-ledger.md): new, adapted, third-party, and
  reference-only work classification.
- [`product/product-plan.md`](product/product-plan.md): product thesis, users,
  capabilities, acceptance criteria, and roadmap direction.
- [`product/user-journeys.md`](product/user-journeys.md): owner, requester,
  payee, recovery, and auditor journeys.

## Technical review

- [`technology/requirements.md`](technology/requirements.md): required Flare
  primitives and supported-source rules.
- [`technology/architecture.md`](technology/architecture.md): components,
  public/private data, trust boundaries, recovery, and deployment topology.
- [`technology/contract-spec.md`](technology/contract-spec.md): schemas,
  contract state machines, signature domains, and conservation rules.
- [`technology/threat-model.md`](technology/threat-model.md): adversaries,
  mitigations, residual trust, and explicit non-claims.
- [`technology/verification.md`](technology/verification.md): evidence gates,
  test matrix, current Coston2 observations, and release acceptance.
- [`technology/reuse-inventory.md`](technology/reuse-inventory.md): reviewed
  adaptation provenance and forbidden VeilBid reuse.
- [`integration-guide.md`](integration-guide.md): compile-tested wallet and dApp
  integration examples.

Public-safe runtime evidence is indexed separately under [`../evidence/`](../evidence/).
Historical inputs and removed working notes remain recoverable from Git history;
they are not current PayGuard release authority.
