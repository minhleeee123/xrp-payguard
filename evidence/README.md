# Evidence policy

`coston2/` will contain reviewed public-safe PayGuard evidence after live gates.
`local/` is ignored and may contain generated local assertion summaries.
`simulation/` contains reviewed public-safe local demo records whose status and
assertions explicitly prevent them from satisfying a live FCC or release gate.

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

`coston2/coston2-funding-resume-audit-2026-08-09.json` is a separate,
credential-free read-only reconstruction of that completed funding checkpoint.
It obtains the historical proof and PackedUserOperation from public Coston2
calldata, re-verifies the proof on-chain, re-reads the XRPL payment and current
runtime address/fee/nonce/accounting state, and records only hashes, public
identifiers, amounts, and booleans. The source transaction did not emit a
`DirectMintingDelayed` checkpoint, so an actual delayed-event resubmission
remains explicitly open.

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

`web/github-pages-preview-2026-08-09.json` is a historical record of the
retired public-safe GitHub Pages static-shell deployment and its HTTP
HTML/JS/CSS smoke. The site was removed before the Vercel deployment; the
record does not represent a current URL, hosted relay, FCC origin, policy
provider, wallet flow, or verified PayGuard release.

`web/vercel-preview-2026-08-09.json` records the current public-safe Vercel
static-shell deployment and its HTTP HTML/JS/CSS smoke. It is a static preview
only and does not represent a hosted relay, FCC origin, policy provider, wallet
flow, or verified PayGuard release. The record remains repository-only and is
not embedded in its own deployment, avoiding a recursive artifact whose
deployment identifier would always be one release stale.

`simulation/fcc-local-three-machine-2026-08-09.json` records the disposable
credential-free three-machine Docker smoke selected for the hackathon demo. It
contains only source/image identifiers and assertion booleans; it explicitly
records the absence of hardware TEE attestation, stable origins, authenticated
indexer access, production registration, and a live private-policy lifecycle.

The Vercel build publishes the reviewed Coston2 and explicitly labelled
simulation JSON files plus the metadata-only
`https://xrp-payguard.vercel.app/evidence/index.json` endpoint. The endpoint is
an evidence mirror, not a live policy, relay, FCC, or release service.

Never store private policies, ciphertext, wallet/XRPL/FCC keys, signatures
forbidden by policy, proxy/indexer credentials, authenticated raw responses, or
private denial details. See `docs/technology/verification.md`.
