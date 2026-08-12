# Canonical user journeys

## 1. Policy owner — create and activate

1. Connect an explicit Coston2 wallet or derive the Flare PersonalAccount from
   an XRPL owner address without requesting a seed.
2. Choose a policy template and see which fields will be public versus private.
3. Define the private authorized requester, target rules, limits, schedule,
   occurrence bounds, and expiry.
4. Review public asset, maximum escrow exposure, machine/code policy, and fees.
5. Canonicalize the policy locally, calculate its commitment, and independently
   encrypt it to all three selected FCC machine keys.
6. Sign three short-lived owner authorizations, one for each exact encrypted
   copy, and send ciphertext only through authenticated private ingress.
7. Verify three machine-signed receipts locally before the connected owner
   submits the public commitment/receipts on-chain.
8. Confirm finalized `ACTIVE` registry state. The connected wallet is the
   canonical owner and is the only account that may stop, resume, or revoke the
   immutable version. Any change creates a new version.

Failure expectations:

- Wrong, missing, stale, or incompatible machine keys stop before ingress.
- Any receipt mismatch stops before on-chain commitment.
- A connected-wallet/binding-owner mismatch requires a fresh commitment; the
  UI cannot silently transfer ownership of an existing commitment.
- No browser persistence retains policy plaintext or ciphertext.
- Refreshing requires the owner to re-enter an uncommitted draft; the app does
  not pretend it recovered private content.

## 2. XRPL owner — fund a PayGuard vault

For the direct Coston2 test-token path, the owner enters a human FTestXRP
amount once and selects **Deposit**. The UI derives the minimum transaction
plan: deposit directly when allowance is sufficient, or request an exact ERC-20
approval followed by the deposit. Both receipts and finalized postconditions
remain independently verified; combining the UI intent never combines the
on-chain transactions or wallet confirmations.

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

## 3. Authorized requester — request and receive a payment

1. Receive only the public policy commitment from the owner; no private rule is
   shared.
2. Connect the exact requester wallet frozen in the private policy and prepare
   a public request with policy ID, vault, target, asset, amount,
   schedule slot, action type, nonce, attempt, and expiry.
3. Read the canonical spend checkpoint and, if required, capture a fresh FTSO
   value or finalized FDC external trigger.
4. Create the request on-chain as the exact requester. The policy owner does not
   sign or approve this payment.
5. Sign a short-lived relay authorization bound to this exact request and
   requester. FCC machines independently rebuild the private policy and
   canonical public state.
6. Machines sign only the exact `ALLOW` or `DENY` result domain.
7. Anyone may submit two matching valid results. After `ALLOW`, the requester
   can execute the transfer to the public payee; `DENY` or expiry changes no
   balance.

Failure expectations:

- No requester can provide `ALLOW` or a policy evaluation field.
- A policy-owner signature cannot replace the exact requester's relay
  authorization.
- A requester or payee outside the private allowlists receives a threshold
  `DENY`; no owner interaction can override it.
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
