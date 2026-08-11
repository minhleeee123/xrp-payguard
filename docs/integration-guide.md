# XRPL wallet and Flare dApp integration guide

## Current release boundary

This guide documents compile-tested public codecs, not a live PayGuard SDK or
verified Coston2 release. The production web now connects to a hosted V2 simulated-candidate relay
and stable A/B/D `SIMULATED_TEE` machines; custody/evaluation, replacement, and
executor recovery pass on Coston2. Hardware attestation, V2, permissionless
release wiring, and a verified release manifest remain open. Integrators must
not treat either preview below as a policy approval, FDC proof, signature,
submitted transaction, or successful payment.

The example package is deliberately private until a verified PayGuard release
manifest exists. It accepts no XRPL seed, EVM private key, FCC key, API key, or
private policy. Wallets and signers remain injected external trust boundaries.

## XRPL wallet: prepare the public FDC request

After the wallet has independently signed and submitted an XRPL Payment, pass
only its validated, public transaction ID and the non-zero EVM address that
will own the FDC proof:

```ts
import { prepareXrplWalletFdcPreview } from "@xrp-payguard/sdk-examples";

const preview = prepareXrplWalletFdcPreview({
  network: "testnet",
  transactionId: validatedPublicTransactionId,
  proofOwner: executorAddress,
});

if (preview.status !== "PREPARED_NOT_SUBMITTED") throw new Error("unexpected state");
```

The result is the exact public `XRPPayment` prepare shape and an
`AUTHENTICATED_VERIFIER_PREPARE` next gate. The caller must still use a
controlled authenticated verifier at runtime, obtain and bind the MIC, pay the
on-chain FDC request fee, derive the voting round from the mined request block,
wait for finality, retrieve the proof, and verify it through the runtime
`FdcVerification` contract. A DA response by itself is not proof verification.

Never pass an XRPL seed to this layer. Never put a verifier credential in
source, browser persistence, evidence, or logs.

## Flare dApp: encode the public Smart Account memo

Resolve the official Coston2 dependencies at runtime, resolve the XRPL owner's
`PersonalAccount`, and read its current nonce before encoding:

```ts
import { prepareFlareSmartAccountPreview } from "@xrp-payguard/sdk-examples";

const preview = prepareFlareSmartAccountPreview({
  calls: publicCallsReviewedByTheUser,
  sender: runtimePersonalAccount,
  nonce: runtimeNonce,
  walletId: 0,
  executorFeeUBA: quotedExecutorFeeUBA,
});

if (preview.status !== "ENCODED_NOT_SIGNED") throw new Error("unexpected state");
```

The result contains a deterministic public `0xFE` memo, encoded packed user
operation, operation hash, and total call value. The next gate is
`WALLET_REVIEW_AND_SIGNATURE`. The caller must revalidate runtime addresses,
nonce, fees, call value, and release domain immediately before requesting the
wallet signature. This codec does not decide `ALLOW`; only two matching results
from the frozen registered FCC machine set may satisfy that future on-chain
gate.

## Fail-closed adoption checklist

Before enabling a transaction-writing path, an integrator must verify all of
the following against one release manifest:

1. chain ID, registry, vault, router, runtime bytecode, and constructor wiring;
2. FCC extension ID, code/image hash, three machine identities and key
   fingerprints, signer mapping, and live `PING` results;
3. authenticated verifier/indexer origins and credential handling outside the
   browser bundle;
4. exact policy/request/account/target/amount/schedule/spend/nonce/attempt/
   expiry domain binding;
5. on-chain replay and rollback checkpoints; and
6. sanitized evidence that contains no policy plaintext/ciphertext, key,
   credential, or signature.

If any item is unavailable or drifts, disable writing and present an explicit
unavailable state. Do not substitute simulated FCC output, cached addresses,
mock proof/price/payment data, or client-supplied authorization.

## Validation

Run:

```sh
pnpm --filter @xrp-payguard/sdk-examples typecheck
pnpm --filter @xrp-payguard/sdk-examples test
pnpm --filter @xrp-payguard/integrations test
pnpm secret:scan
pnpm privacy:scan
```

The underlying public codecs and live-boundary adapters are documented in
[`../packages/integrations/README.md`](../packages/integrations/README.md).
