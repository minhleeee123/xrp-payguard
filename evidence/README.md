# Evidence policy

`coston2/` will contain reviewed public-safe PayGuard evidence after live gates.
`local/` is ignored and may contain generated local assertion summaries.

The `coston2/bootstrap-funding*.json` files record only testnet bootstrap
identifiers, balances, transactions, and booleans. They are not PayGuard
deployment, FCC, FDC, Smart Account, FAssets mint, or policy-execution evidence
and cannot satisfy the release gate.

`coston2/contracts-deployment.json` records successful public contract and
wiring transactions plus runtime/constructor assertions. It does not prove FCC,
private policy, XRP-native funding, execution, hosted UI, or a complete release.

`coston2/coston2-public-endpoint-reachability.json` records only
credential-free Coston2 RPC, Explorer/API, and faucet page reachability. It
does not represent a faucet grant, FCC indexer access, or a PayGuard release.

Never store private policies, ciphertext, wallet/XRPL/FCC keys, signatures
forbidden by policy, proxy/indexer credentials, authenticated raw responses, or
private denial details. See `docs/technology/verification.md`.
