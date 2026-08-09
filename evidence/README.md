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

`coston2/xrp-fdc-smart-account-funding-2026-08-09.json` records one
successful PayGuard-owned Coston2 testnet flow: a validated XRPL Testnet
payment, FDC request/finalized round/proof commitment, direct mint receipt, and
verified FTestXRP deposit accounting. It contains no raw proof, memo payload,
wallet seed, API key, or private policy, and it is not a complete release claim.

`coston2/fassets-redemption-2026-08-09.json` records one public amount-based
FXRP redemption request, the validated XRPL payout with matching payment
reference, and the Coston2 `RedemptionPerformed` receipt. It deliberately marks
PayGuard canonical event consumption, destination-tag redemption, and default
recovery as open for that amount-based run; it is not a complete release claim.

`coston2/fassets-tagged-redemption-2026-08-09.json` records a separate public
`redeemWithTag` request, the validated XRPL payout with `DestinationTag=424242`,
and its matching `RedemptionPerformed` receipt. Partial fulfillment, default
recovery, and canonical PayGuard event consumption remain open.

`coston2/coston2-direct-mint-runtime-observation.json` records a credential-free
read-only AssetManagerFXRP/Contract Registry lookup, the runtime FAsset and
Core Vault payment address, and an integer direct-mint quote. It does not submit
an XRP payment, FDC request, or mint transaction.

`coston2/coston2-public-endpoint-reachability.json` records only
credential-free Coston2 RPC, Explorer/API, and faucet page reachability. It
does not represent a faucet grant, FCC indexer access, or a PayGuard release.

Never store private policies, ciphertext, wallet/XRPL/FCC keys, signatures
forbidden by policy, proxy/indexer credentials, authenticated raw responses, or
private denial details. See `docs/technology/verification.md`.
