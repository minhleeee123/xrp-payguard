# Canonical user journeys

## 1. Policy owner — create and activate

1. Connect an explicit Coston2 wallet or derive the Flare PersonalAccount from
   an XRPL owner address without requesting a seed.
2. Choose a policy template and see which fields will be public versus private.
3. Define private target rules, limits, schedule, occurrence bounds, and expiry.
4. Review public asset, maximum escrow exposure, machine/code policy, and fees.
5. Canonicalize the policy locally, calculate its commitment, and independently
   encrypt it to all three selected FCC machine keys.
6. Send ciphertext only through authenticated private ingress.
7. Verify three machine-signed receipts locally before submitting the public
   commitment/receipts on-chain.
8. Activate the immutable policy version. Any change creates a new version.

Failure expectations:

- Wrong, missing, stale, or incompatible machine keys stop before ingress.
- Any receipt mismatch stops before on-chain commitment.
- No browser persistence retains policy plaintext or ciphertext.
- Refreshing requires the owner to re-enter an uncommitted draft; the app does
  not pretend it recovered private content.

## 2. XRPL owner — fund a PayGuard vault

1. Resolve the owner's PersonalAccount and current nonce from Coston2.
2. Build an exact Smart Account operation for approval and PayGuard deposit.
3. Commit the operation hash in an XRPL Testnet `0xFE` payment/mint flow.
4. Sign only in an XRPL wallet; PayGuard never receives the seed.
5. Record the public XRPL transaction ID and create the FDC attestation request.
6. Wait for finalization, retrieve the proof, and execute the Smart Account path.
7. Confirm the expected PersonalAccount, nonce, asset, amount, vault, and events.

Failure expectations:

- Delayed mint/attestation becomes a resumable public checkpoint.
- Duplicate payment, wrong owner, wrong memo/hash, nonce drift, fee drift, or
  destination drift fails closed.
- A new browser can resume from public identifiers without a secret.

## 3. Owner or executor — request an action

1. Prepare a public request with policy ID, vault, target, asset, amount,
   schedule slot, action type, nonce, attempt, and expiry.
2. Read the canonical spend checkpoint and, if required, capture a fresh FTSO
   value or finalized FDC external trigger.
3. Freeze the request on-chain or through the exact contract-defined dispatch.
4. FCC machines independently read/rebuild the same policy and public state.
5. Machines sign only the exact `ALLOW` or `DENY` result domain.
6. Anyone may submit two matching valid results. `ALLOW` executes atomically;
   `DENY` or expiry changes no balance.

Failure expectations:

- No requester can provide `ALLOW` or a policy evaluation field.
- One unavailable result endpoint is recoverable with the remaining threshold.
- Split decisions do not execute.
- A retry changes only attempt/nonce/expiry as allowed; policy and frozen state
  cannot drift.

## 4. Payee — inspect settlement

The payee sees the public request, amount, asset, expected window, result status,
transaction receipt, and any redemption request. The payee never sees target
rules, aggregate limits, other recipients, internal merchant classifications,
or private denial reasons.

## 5. Policy owner — stop, replace, or withdraw

- Emergency stop prevents new execution immediately under explicit owner or
  preconfigured public governance authority.
- Revocation closes new requests but does not rewrite completed history.
- Replacement creates a new policy commitment/machine/code version and requires
  fresh custody receipts.
- Withdrawal respects reserved/in-flight amounts and cannot race an authorized
  execution.
- If FCC becomes unavailable beyond the defined grace period, the safe recovery
  path returns owner funds without manufacturing an approval.

## 6. Auditor — verify without a wallet

The auditor reads one finalized checkpoint and verifies:

- owner/vault/policy commitment and version;
- extension, code version, machines, key fingerprints, and receipt quorum;
- request hash, nonce, schedule slot, spend root, FDC/FTSO input, and expiry;
- two distinct result signers over one digest;
- exact token transfer and balance/checkpoint conservation;
- no private policy, ciphertext, raw secret, or decryption interface is present.
