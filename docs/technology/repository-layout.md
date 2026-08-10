# Repository layout

This is the current workspace layout, not a proposed future structure.

```text
xrp-payguard/
├── api/
│   └── demo/                  thin Vercel function adapters; no policy engine
├── apps/
│   ├── web/                   Vite product, wallet views, Demo, Auditor, evidence UI
│   ├── demo-api/              HTTP boundary for the three isolated demo actors
│   ├── relay/                 stateless threshold/result orchestration
│   └── fcc-extension/         Go FCC ingress, evaluator, admission, ciphertext store
├── packages/
│   ├── protocol/              canonical schemas, codecs, hashes, policy math/evaluator
│   ├── contracts/             Solidity registry, vault, router, FCC/FDC consumers, tests
│   ├── bindings/              deterministic generated contract ABIs
│   ├── integrations/          XRPL, FDC, FTSO, Smart Accounts, FAssets, Web2Json
│   ├── demo/                  shared simulated lifecycle and actor implementation
│   └── sdk-examples/          compile-tested wallet and dApp integration examples
├── evidence/
│   ├── coston2/               reviewed public-safe live testnet observations
│   ├── simulation/            explicitly simulated FCC/lifecycle records
│   ├── web/                   deployment, browser, and public-corpus audits
│   └── local/                 ignored generated local records
├── releases/
│   └── candidates/            planned V2 inputs; never an authoritative manifest
├── tooling/                   build, deployment, FCC, evidence, release, and safety gates
├── docs/
│   ├── product/               product plans, journeys, readiness, user validation
│   ├── technology/            architecture, contracts, security, verification, runbooks
│   ├── lessons/               implementation lessons carried into PayGuard
│   └── reference/             supplied/read-only material; not release authority
├── .github/workflows/         pinned release CI
├── README.md                  reviewer entry point and current evidence boundary
├── PLAN.md                    phase gates and remaining work
├── DESIGN.md                  canonical product visual/interaction system
└── AGENTS.md                  mandatory contributor privacy and release invariants
```

The three similarly named demo paths are separate by design:

- `api/demo/` adapts requests to Vercel functions and contains no evaluator;
- `apps/demo-api/` validates the public HTTP boundary; and
- `packages/demo/` contains the shared deterministic simulated actors and
  lifecycle implementation.

Operational tooling remains flat so commands are searchable by boundary:
`coston2-*` covers testnet observations, `fcc-*` covers confidential-compute
operations, `candidate-*`/`check-release*` cover future release promotion, and
`check-*`/`scan-*` cover repository safety. Transaction-writing commands require
explicit broadcast capability; ordinary validation and planning commands are
read-only.

No deployment, extension, machine, key, or evidence fact is shared implicitly
with VeilBid. Adapted source must carry provenance and PayGuard-specific tests.
