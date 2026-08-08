# Smart Account `0xFE` public codec

The integrations package now contains a public-only TypeScript codec for the
Flare Smart Accounts custom instruction. It can:

- resolve a deterministic `PersonalAccount` from a classic XRPL owner through
  the registry-resolved `MasterAccountController`;
- read the current public memo-instruction nonce; and
- encode the `PackedUserOperation` for `PersonalAccount.executeUserOp`, then
  commit its hash in the fixed 42-byte `0xFE` memo header.

The integrations package also builds the public FDC `XRPPayment` prepare
request with the official `XRPPayment` attestation type, `testXRP`/`XRP` source
ID, transaction ID, and exact non-zero executor `proofOwner`. The verifier
service, not this codec, computes the message-integrity code and asynchronous
proof state.

Given that verifier-supplied non-zero MIC, the package can also ABI-encode the
official `IXRPPayment.Request` for a future `FdcHub.requestAttestation` call.
This is an encoding boundary only; it never derives the MIC, pays the FDC fee,
broadcasts a transaction, or retrieves a proof.

For Coston2, the package also exposes a strict prepare client pinned to
`https://fdc-verifiers-testnet.flare.network`. The API key is runtime-only;
the client checks the JSON content type, `VALID` status, bounded response, and
all static ABI words before returning the prepared request. It does not submit
to `FdcHub` or treat a prepare response as a proof.

The package also has a bounded Coston2 Data Availability reader for the
prepared XRPPayment request. It posts only the public voting round and ABI
request bytes to the fixed DA endpoint, checks the response/request/owner/round
and timestamp bindings, and parses the XRPL response fields and Merkle nodes
without logging the runtime key. Its `AVAILABLE` envelope means DA retrieval
only; on-chain round finality and Merkle verification remain separate gates.
It does not submit, sign, or treat a retrieved envelope as a verified payment.

The finality boundary separately resolves `fdcProtocolId` and the bound relay
from the runtime `FdcVerification` address, then reads
`isFinalized(protocolId, votingRoundId)` and (only after finality) the non-zero
Merkle root. A pending round remains an explicit checkpoint; no proof leaf is
accepted until a later verifier binds the DA envelope to that root.

The round boundary derives `votingRoundId` from the timestamp of the mined FDC
request block by calling the runtime Relay `getVotingRoundId` method. It does
not use the local wall clock or a copied 90-second formula, and it rejects an
unavailable, zero, or out-of-range round. The request receipt block timestamp
is therefore a required public checkpoint before finality polling.

The proof boundary converts the parsed envelope to the official
`IXRPPayment.Proof` tuple and calls `IFdcVerification.verifyXRPPayment` at the
runtime registry-resolved address. It accepts only an explicit `true` result
with a matching finalized round, `testXRP` source, non-zero proof owner, and
successful payment status; a DA envelope by itself is never a proof.

The public flow composer then links the fee intent, mined request receipt,
Relay-derived round, finality checkpoint, DA envelope, verifier result, and
direct-mint calldata. It accepts the receipt as an external checkpoint and
does not sign, broadcast, retry, or persist an FDC credential.

The submission boundary reads the current request fee via the runtime
`FdcHub.fdcRequestFeeConfigurations()` address and builds exact
`requestAttestation(bytes)` calldata plus the payable wei value. It is an
intent codec only: no EVM key, signing, broadcast, retry, or submitted-state
claim is present.

The direct-mint boundary then encodes a parsed successful XRPPayment and a
finalized round into `executeDirectMinting` or the `0xFE`
`executeDirectMintingWithData` call. It checks public type/source/round/owner
and status bindings, but deliberately leaves Merkle verification, signing,
broadcast, receipt matching, and the with-data `msg.value` relationship to the
caller/executor checkpoint.

The codec validates non-zero EVM addresses, uint bounds, call/data limits,
wallet ID, and executor fee. It returns only public bytes, hashes, nonce, and
the sum of call values. It never accepts an XRPL seed, signs a Payment, calls
FDC, submits a transaction, or decides authorization. The Master Account
Controller address must be resolved from the current Flare Contract Registry;
it is not copied into the codec.

The same package now contains an integer-only direct-mint quote boundary. It
reads the three official AssetManager settings through an injected reader and
computes the UBA payment as net mint amount plus the larger of the proportional
fee (floor division by 10,000 BIPS) and minimum fee, plus the direct executor
fee. It is a quote/checkpoint helper only: settings can drift, and no quote is
treated as a payment, proof, or mint receipt.

It also resolves the official `directMintingPaymentAddress()` getter at runtime
and validates the returned Core Vault address as an XRPL classic address. The
address is never copied from a reference deployment or promoted to a release
fact.

The package also has an injected, read-only XRPL API v2 boundary for validated
`account_info`, `ledger`, and native-XRP `tx` responses. It is limited to public
checkpoints, checks ledger/hash/account/payment consistency, caps memo data and
search ranges, and never accepts a seed or submit/signing method.

The local tests cover deterministic encoding, malformed/overflow rejection,
PersonalAccount/nonce read failures, exact memo length, and strict FDC request
fields. A live PersonalAccount lookup, XRPL Payment, FDC request/proof,
executor submission, and PayGuard vault funding remain unverified.

Official references:

- [Smart Accounts overview](https://dev.flare.network/smart-accounts/overview)
- [Custom instruction guide](https://dev.flare.network/smart-accounts/guides/typescript-viem/custom-instruction-ts)
- [Master Account Controller reference](https://dev.flare.network/smart-accounts/reference/IMasterAccountController)
- [FAssets direct mint guide](https://dev.flare.network/fassets/developer-guides/fassets-direct-minting)
- [FAssets AssetManager reference](https://dev.flare.network/fassets/reference/IAssetManager)
- [XRPL request formatting](https://xrpl.org/docs/references/http-websocket-apis/api-conventions/request-formatting)
- [XRPL `tx` method](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/tx)
- [XRPL ledger method](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/ledger-methods/ledger)
- [FDC getting started](https://dev.flare.network/fdc/getting-started)
- [FDC by hand](https://dev.flare.network/fdc/guides/fdc-by-hand)
- [IRelay `getVotingRoundId`](https://dev.flare.network/network/fsp/solidity-reference/IRelay)
- [FDC `IFdcVerification` reference](https://dev.flare.network/fdc/reference/IFdcVerification)
- [Official `IXRPPaymentVerification.sol`](https://raw.githubusercontent.com/flare-foundation/flare-smart-contracts-v2/main/contracts/userInterfaces/fdc/IXRPPaymentVerification.sol)
- [FDC `IXRPPayment` reference](https://dev.flare.network/fdc/reference/IXRPPayment)
- [FDC `IFdcVerification` reference](https://dev.flare.network/fdc/reference/IFdcVerification)
- [FDC `IFdcHub` reference](https://dev.flare.network/fdc/reference/IFdcHub)
- [FDC request fee configuration reference](https://dev.flare.network/fdc/reference/IFdcRequestFeeConfigurations/)
- [FAssets direct minting guide](https://dev.flare.network/fassets/developer-guides/fassets-direct-minting)
