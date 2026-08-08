# Evidence policy

`coston2/` will contain reviewed public-safe PayGuard evidence after live gates.
`local/` is ignored and may contain generated local assertion summaries.

The existing `coston2/bootstrap-funding.json` records only testnet bootstrap
identifiers and booleans. It is not PayGuard deployment, FCC, FDC, Smart
Account, or policy-execution evidence and cannot satisfy the release gate.

Never store private policies, ciphertext, wallet/XRPL/FCC keys, signatures
forbidden by policy, proxy/indexer credentials, authenticated raw responses, or
private denial details. See `docs/technology/verification.md`.
