# Repository layout

```text
xrp-payguard/
├── apps/
│   ├── fcc-extension/   Go FCC extension and protocol fixtures
│   ├── relay/           stateless request/result/FDC orchestration
│   └── web/             product and wallet-free evidence application
├── packages/
│   ├── contracts/       Foundry/Solidity contracts, deployment, tests
│   └── bindings/        generated bindings and deterministic codecs
├── tooling/             preflight, deployment, verification, scans, evidence
├── docs/
│   ├── product/         product plan and journeys
│   ├── technology/      architecture, contract, threat, verification
│   ├── lessons/         carried-forward implementation lessons
│   └── reference/       copied supplied/read-only source material
└── evidence/
    ├── coston2/         reviewed public-safe live evidence
    └── local/           ignored generated local evidence
```

No deployment, extension, machine, key, or evidence fact is shared implicitly
with VeilBid. Adapted source must carry provenance and PayGuard-specific tests.
