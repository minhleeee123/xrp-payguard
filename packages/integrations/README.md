# XRP and Flare integration boundaries

This package contains public-only codecs and fail-closed checkpoint gates for
the XRP Payment → FDC `XRPPayment` → Smart Account direct-mint path and FTSO
reference-value conversion. It binds owner, PersonalAccount, destination,
asset, amount, memo, nonce, fee, transaction, ledger, voting round, proof
commitment, and operation hash without accepting an XRPL seed or EVM key.

The FDC verifier and Smart Account client are injected interfaces. An absent or
negative verifier, stale/mismatched payment, missing proof, or unavailable mint
client cannot become success. `DELAYED` is an explicit checkpoint that resumes
only at the client-provided public `executionAllowedAt` time.

No live XRPL Testnet payment, FDC proof, Smart Account transaction, FTSO feed,
FAssets mint, or redemption is claimed by these local tests.
