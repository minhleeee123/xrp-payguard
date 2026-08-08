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

Foundation pins and source checks, the deterministic TypeScript/Go protocol,
the local ciphertext-only FCC path, and the Foundry registry/vault/router state
machine are implemented and tested. The three non-upgradeable contracts and
their FTestXRP vault wiring are deployed and independently re-verified on
Coston2 from source commit `17ff0bc1eb135195a94d0d261bc491f006730720`.
No registered PayGuard FCC result, private live lifecycle, mainnet integration,
user traction, production audit, or complete release claim exists yet.

## Start here

1. [`AGENTS.md`](AGENTS.md) — mandatory engineering and privacy rules.
2. [`PLAN.md`](PLAN.md) — full product roadmap and phase gates.
3. [`DESIGN.md`](DESIGN.md) — canonical visual and interaction system.
4. [`docs/README.md`](docs/README.md) — documentation index and provenance.
5. [`docs/product/product-plan.md`](docs/product/product-plan.md) — users,
   product surface, and acceptance criteria.
6. [`docs/technology/architecture.md`](docs/technology/architecture.md) —
   target architecture and trust boundaries.
7. [`docs/lessons/veilbid-build-lessons.md`](docs/lessons/veilbid-build-lessons.md)
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
