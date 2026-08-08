# XRP PayGuard

XRP PayGuard is a confidential policy engine for XRPL-native users and treasury
teams. A user funds a Flare account or vault from XRPL, keeps spending rules
inside a fixed Flare Confidential Compute machine set, and permits an on-chain
action only after a threshold of registered machines evaluates the exact same
policy and request.

The long-term product covers recurring payments, value caps, merchant/target
allowlists, emergency stops, recovery, auditable public execution receipts,
and reusable policy templates. It does **not** claim private token transfers:
ordinary asset, amount, recipient, timing, and transaction graph remain public.

## Current status

Foundation pins and source checks are now scaffolded. No PayGuard contract, FCC
extension, deployment, mainnet integration, user traction, or production-security
claim exists yet. Coston2 is the development target.

## Start here

1. [`AGENTS.md`](AGENTS.md) — mandatory engineering and privacy rules.
2. [`PLAN.md`](PLAN.md) — full product roadmap and phase gates.
3. [`docs/README.md`](docs/README.md) — documentation index and provenance.
4. [`docs/product/product-plan.md`](docs/product/product-plan.md) — users,
   product surface, and acceptance criteria.
5. [`docs/technology/architecture.md`](docs/technology/architecture.md) —
   target architecture and trust boundaries.
6. [`docs/lessons/veilbid-build-lessons.md`](docs/lessons/veilbid-build-lessons.md)
   — concrete failure modes and lessons carried forward.

## Repository direction

```text
apps/fcc-extension/       confidential policy storage and evaluation
apps/web/                 policy owner, payee, executor, and public evidence UI
apps/relay/               stateless request/result orchestration
packages/contracts/       Coston2 policy registry, vault, and action router
packages/bindings/        generated consumer bindings and protocol codecs
tooling/                  deployment, recovery, verification, and evidence tools
docs/                     canonical product, security, and competition material
evidence/coston2/         public-safe evidence only
```

The existing VeilBid repositories are read-only sources of lessons and
reviewed implementation patterns. Their deployments, keys, evidence,
extension IDs, machine identities, and product claims are not PayGuard facts.
