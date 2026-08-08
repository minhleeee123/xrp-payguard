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
negative verifier, stale/mismatched payment, missing proof, or unavailable mint
client cannot become success. `DELAYED` is an explicit checkpoint that resumes
only at the client-provided public `executionAllowedAt` time.

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
