# Evidence policy

`coston2/` will contain reviewed public-safe PayGuard evidence after live gates.
`local/` is ignored and may contain generated local assertion summaries.

The `coston2/bootstrap-funding*.json` files record only testnet bootstrap
identifiers, balances, transactions, and booleans. They are not PayGuard
deployment, FCC, FDC, Smart Account, FAssets mint, or policy-execution evidence
and cannot satisfy the release gate.

Never store private policies, ciphertext, wallet/XRPL/FCC keys, signatures
forbidden by policy, proxy/indexer credentials, authenticated raw responses, or
private denial details. See `docs/technology/verification.md`.
