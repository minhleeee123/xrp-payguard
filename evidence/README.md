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

`coston2/production-monitoring.json` records the independent Railway monitor,
its exact source/deployment identifiers, five-dependency aggregate healthy
observation, authenticated operator-route checks, bounded retention, and
credential-free runtime-log assertions. It contains no bearer token, endpoint
payload, request identifier, policy, decision, signature, or private key. It is
not an outage-drill result, SLA, security audit, hardware attestation, verified
release, or mainnet-readiness claim.

`coston2/fcc-hosted-relay-lifecycle.json` records the hosted Coston2 V2 path
through the production Railway relay and registered A/B/D `SIMULATED_TEE`
machines. It covers authenticated ciphertext-only ingress, three verified
custody receipts, request-ID-only canonical evaluation, two matching ALLOW and
DENY submissions, execution, governance, and vault conservation. It contains
no policy, ciphertext, authorization, signature, credential, or key and does
not prove hardware attestation, mainnet readiness, or a verified release.

`coston2/fcc-stale-machine-c-pause.json` records the verified Coston2 manager
transaction that moved stale machine C from status `2` to status `4`. It binds
the exact retained A/B/D status-2 set and contains no private key or credential.
It proves cleanup of the simulated testnet machine set, not hardware
attestation or release promotion.

`coston2/fcc-multi-owner-lifecycle.json` records the hosted Coston2 V2
self-service delegated path with fresh owner and requester wallets funded by
the existing testnet source. It covers three custody receipts, owner
registration/funding/governance, requester-created ALLOW execution and receipt,
`REQUESTER_DENIED`, `TARGET_DENIED`, `CAP_EXCEEDED`, owner-as-requester,
wrong-signer/non-owner/stopped/revoked negatives, duplicate evaluation
coalescing, conservation, and return of all remaining test funds. It excludes
keys, policies, ciphertexts, authorizations, signatures, and
credentials, and remains `SIMULATED_TEE` testnet evidence rather than hardware,
mainnet, or verified-release proof.

The current record was rerun on 2026-08-14 after machine A restarted. Its new
identity was registered and promoted, the unreachable A identity was paused,
and B/D retained their existing identities. The fresh record therefore checks
the exact current A/B/D set rather than treating the historical A identity as a
live machine.

`web/github-pages-preview-2026-08-09.json` is a historical record of the
retired public-safe GitHub Pages static-shell deployment and its HTTP
HTML/JS/CSS smoke. The site was removed before the Vercel deployment; the
record does not represent a current URL, hosted relay, FCC origin, policy
provider, wallet flow, or verified PayGuard release.

`web/vercel-preview-2026-08-09.json` records an earlier public-safe Vercel
static-shell deployment and its HTTP HTML/JS/CSS smoke. It does not represent
the current hosted relay/FCC path or a verified PayGuard release. The record
remains repository-only and is not embedded in its own deployment, avoiding a
recursive artifact whose deployment identifier would always be one release
stale.

`web/public-evidence-deployment-audit-2026-08-12.json` is the historical
repository-only audit of the previous 25-entry production corpus. It fetched
the metadata index and every then-listed body, required HTTP 200/JSON, reran
recursive public-safety and simulation-boundary checks, and matched every byte
to the reviewed local source.

`web/public-evidence-deployment-audit-2026-08-13.json` is the current
repository-only audit of the production alias. It matched all 26 hosted bodies
byte-for-byte to reviewed local sources: 25 chain-114 records and three
explicitly bounded simulation records, with overlapping categories. It is
deliberately excluded from the hosted corpus to avoid recursive deployment
claims and does not promote the simulated candidate to a release.

`simulation/fcc-local-three-machine-2026-08-09.json` records the disposable
credential-free three-machine Docker smoke selected for the hackathon demo. It
contains only source/image identifiers and assertion booleans; it explicitly
records the absence of hardware TEE attestation, stable origins, authenticated
indexer access, production registration, and a live private-policy lifecycle.

The Vercel build publishes a 26-entry corpus of reviewed Coston2 and explicitly
labelled simulation JSON files plus the metadata-only
`https://xrp-payguard.vercel.app/evidence/index.json` endpoint. The endpoint is
an evidence mirror, not an authorization endpoint or a release manifest. The
separate hosted relay URL and its limitations are recorded in the lifecycle
evidence above.

Never store private policies, ciphertext, wallet/XRPL/FCC keys, signatures
forbidden by policy, proxy/indexer credentials, authenticated raw responses, or
private denial details. See `docs/technology/verification.md`.
