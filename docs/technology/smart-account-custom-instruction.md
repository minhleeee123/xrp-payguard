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

The codec validates non-zero EVM addresses, uint bounds, call/data limits,
wallet ID, and executor fee. It returns only public bytes, hashes, nonce, and
the sum of call values. It never accepts an XRPL seed, signs a Payment, calls
FDC, submits a transaction, or decides authorization. The Master Account
Controller address must be resolved from the current Flare Contract Registry;
it is not copied into the codec.

The local tests cover deterministic encoding, malformed/overflow rejection,
PersonalAccount/nonce read failures, exact memo length, and strict FDC request
fields. A live PersonalAccount lookup, XRPL Payment, FDC request/proof,
executor submission, and PayGuard vault funding remain unverified.

Official references:

- [Smart Accounts overview](https://dev.flare.network/smart-accounts/overview)
- [Custom instruction guide](https://dev.flare.network/smart-accounts/guides/typescript-viem/custom-instruction-ts)
- [Master Account Controller reference](https://dev.flare.network/smart-accounts/reference/IMasterAccountController)
