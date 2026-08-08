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

`computeDirectMintingPaymentQuote` and `readDirectMintingPaymentQuote` cover the
official FAssets direct-mint amount boundary. They use integer UBA values and
the AssetManager getters `getDirectMintingFeeBIPS`,
`getDirectMintingMinimumFeeUBA`, and `getDirectMintingExecutorFeeUBA` to derive
`netMintAmountUBA + max(proportionalFeeUBA, minimumFeeUBA) + executorFeeUBA`.
The reader is injected and the calculator performs no RPC, signing, XRPL
payment, FDC proof retrieval, or mint execution. A live quote can drift before
execution and must be re-read and bound to the eventual public receipt.

`readValidatedXrplAccountInfo`, `readValidatedXrplLedger`, and
`readValidatedXrplPayment` expose a narrow XRPL JSON-RPC API v2 read boundary.
They request only validated public state, reject unvalidated/RPC-error
responses, enforce classic addresses/native-XRP amounts/ledger bounds, and cap
memo/search inputs. The transport is injected so the package never creates a
client, stores an endpoint credential, signs, or submits a transaction.
