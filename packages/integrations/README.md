# XRP and Flare integration boundaries

This package contains public-only codecs and fail-closed checkpoint gates for
the XRP Payment → FDC `XRPPayment` → Smart Account direct-mint path and FTSO
reference-value conversion. It binds owner, PersonalAccount, destination,
asset, amount, memo, nonce, fee, transaction, ledger, voting round, proof
commitment, and operation hash without accepting an XRPL seed or EVM key.
Every state transition recomputes separate domain hashes for the Smart Account
operation and expected XRPL payment, then seals the public state fields in a
domain-separated checkpoint hash. Direct mint accepts success only when the
public receipt matches owner, PersonalAccount, destination, asset, amount,
executor fee, nonce, operation hash, and a non-zero transaction hash. Delayed
resume revalidates the same immutable fields and the accepted FDC proof
commitment, so a mutated in-memory checkpoint fails closed.

The external-trigger adapters model the official `EVMTransaction` and
`XRPPayment` request/response fields. They require an injected verifier to
return a canonical proof commitment, bind exact transaction, owner/address,
amount/value, memo/input/event, status, round, block, and freshness fields, cap
dynamic byte inputs, and recompute the public input commitment after the async
verification call. The replay sets are preflight guards only: a live consumer
must atomically consume the transaction and input commitment in canonical
on-chain state. Web2Json is intentionally absent.

The FAssets exit model binds `redeemAmount`/`redeemWithTag` intent to the exact
Asset Manager receipt and every public `RedemptionRequested` leg. It preserves
partial fulfillment and multi-agent obligations, and labels a leg as underlying
paid or collateral-defaulted only after an injected canonical-event verifier
returns a non-zero receipt commitment. Request creation alone remains pending;
it is never described as an XRP payout.

The FDC verifier and Smart Account client are injected interfaces. An absent or
negative verifier, stale/mismatched payment, mismatched `proofOwner`, missing
proof, or unavailable mint client cannot become success. `DELAYED` is an
explicit checkpoint that resumes only at the client-provided public
`executionAllowedAt` time.

Policy Studio custody bundles verify the exact public binding, frozen machine
and key order, shared submission nonce/time window, three receipt digests, and
three machine signatures. A missing, reordered, drifted, or unverifiable receipt
cannot become activation evidence; the browser still has no authorization path.

No live XRPL Testnet payment, FDC proof or trigger, Smart Account transaction,
FTSO feed, FAssets mint, or redemption is claimed by these local tests.

`resolveCoston2Dependencies` reads the official Flare Contract Registry at its
canonical registry address for FDC, FTSO, FAssets, Smart Account, and related
protocol addresses. It rejects RPC failures, zero/invalid addresses, duplicate
requests, and unsupported names. The returned addresses are a runtime lookup,
not a PayGuard deployment manifest or release assertion.

The `smart-account.ts` module resolves a registry-provided
`MasterAccountController`, reads a public `PersonalAccount` and memo nonce, and
encodes the official `0xFE` custom-instruction `PackedUserOperation`. It emits
no XRPL seed, signature, Payment, FDC request, or authorization decision. Live
Smart Account/FDC execution remains an external gate.

`buildXrplPaymentPrepareRequest` creates the exact public FDC `XRPPayment`
prepare body for `testXRP` or `XRP`, including the transaction ID and the
non-zero executor `proofOwner`. It does not compute a MIC, pay an FDC fee, or
retrieve a proof.

`buildXrplPaymentAbiEncodedRequest` adds the verifier-supplied non-zero MIC and
ABI-encodes the official `IXRPPayment.Request` for an eventual `FdcHub`
submission. It still does not derive the MIC, pay the request fee, broadcast a
transaction, or retrieve a proof.

`prepareCoston2XrplPaymentRequest` is a fail-closed authenticated prepare
client for the official Coston2 verifier origin. It accepts the API key only at
runtime, sends the public request body, bounds the JSON response, and checks
the returned `VALID` ABI words against the exact transaction/proof-owner
binding. It never emits the key, logs the response, submits to `FdcHub`, or
claims a proof.

`fetchCoston2XrplPaymentProof` is the matching bounded Coston2 Data
Availability read boundary. It sends only the public voting round and ABI
request bytes to the fixed DA endpoint, accepts the API key only at runtime,
and parses the returned `response`/`proof` envelope against the exact
attestation, `testXRP` source, transaction, `proofOwner`, round, timestamp,
XRPL response bounds, and Merkle-node shape. `AVAILABLE` means that the DA
service returned an envelope; it is not an on-chain finality or Merkle
verification claim. The helper never submits an FDC request, verifies the
Merkle root, signs, or logs credentials. The public DA service is rate-limited;
production must use an appropriately controlled DA service.

`readCoston2FdcRoundFinality` is the public on-chain finality checkpoint. It
resolves `fdcProtocolId` and the bound `relay` from the supplied
`FdcVerification` address, reads `isFinalized(protocolId, votingRoundId)`, and
reads a non-zero `merkleRoots` value only after finality is reported. A pending
round returns `merkleRoot: null`; the reader does not submit, verify a proof
leaf, or treat a DA envelope as authorized payment evidence.

`deriveCoston2FdcVotingRound` derives `votingRoundId` from the timestamp of the
mined request block by calling the runtime Relay `getVotingRoundId` method. It
requires the receipt block timestamp, rejects zero or malformed rounds, and
never substitutes a wall-clock timestamp or hard-coded 90-second formula.

`verifyCoston2XrplPaymentProof` is the cryptographic verification boundary. It
converts a parsed `XRPPayment` envelope to the official `IXRPPayment.Proof`,
requires the matching finalized Relay checkpoint, `testXRP` source, non-zero
owner, and successful status, then calls the runtime
`IFdcVerification.verifyXRPPayment` view. Only an explicit `true` result yields
a public proof commitment; a DA response alone never does.

`prepareCoston2FdcSubmission` reads the current `getRequestFee` through the
runtime `FdcHub.fdcRequestFeeConfigurations()` address and returns a bounded,
public submission intent for `requestAttestation(bytes)`: exact calldata,
request bytes, and payable fee in wei. It never signs, broadcasts, retries a
request, or treats a prepared call as a submitted attestation.

`buildCoston2DirectMintCall` turns a parsed, successful Coston2 `XRPPayment`
envelope plus a finalized-round checkpoint into exact
`executeDirectMinting` or `executeDirectMintingWithData` calldata. It checks
the testXRP/type/round/proof-owner/status bindings and exposes the caller's
explicit `msg.value`; it does not compute a Merkle leaf, verify the proof,
sign, broadcast, or claim that FXRP was minted. The with-data value must be
bound by the caller to the Smart Account operation's public call-value sum.

`computeDirectMintingPaymentQuote` and `readDirectMintingPaymentQuote` cover the
official FAssets direct-mint amount boundary. They use integer UBA values and
the AssetManager getters `getDirectMintingFeeBIPS`,
`getDirectMintingMinimumFeeUBA`, and `getDirectMintingExecutorFeeUBA` to derive
`netMintAmountUBA + max(proportionalFeeUBA, minimumFeeUBA) + executorFeeUBA`.
The reader is injected and the calculator performs no RPC, signing, XRPL
payment, FDC proof retrieval, or mint execution. A live quote can drift before
execution and must be re-read and bound to the eventual public receipt.

`readDirectMintingPaymentAddress` reads the official
`directMintingPaymentAddress()` getter at runtime and accepts only a valid XRPL
classic address. It never hard-codes or copies a Core Vault address; an
unavailable or malformed result fails closed.

`readValidatedXrplAccountInfo`, `readValidatedXrplLedger`, and
`readValidatedXrplPayment` expose a narrow XRPL JSON-RPC API v2 read boundary.
They request only validated public state, reject unvalidated/RPC-error
responses, enforce classic addresses/native-XRP amounts/ledger bounds, and cap
memo/search inputs. The transport is injected so the package never creates a
client, stores an endpoint credential, signs, or submits a transaction.
