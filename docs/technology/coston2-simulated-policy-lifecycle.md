# Coston2 simulated-policy lifecycle

Status: guarded solution-3 demonstration tooling; no live FCC claim.

## Purpose

The hackathon boundary uses three local `SIMULATED_TEE` machines because stable
hardware-backed FCC origins and the authenticated indexer are unavailable. The
guarded lifecycle runner extends that boundary onto the already verified
PayGuard Coston2 contracts without pretending that locally generated signers are
official FCC machines.

The runner uses the committed PayGuard protocol evaluator, three ephemeral
signers held only in process memory, and the deployment owner's ignored local
testnet key. It can register the ephemeral public identities in
`PayGuardPolicyRegistry`, register one commitment, execute one bounded recurring
FTestXRP transfer after two matching simulated evaluations, record a matching
cap denial, and exercise stop, resume, and revoke. It writes evidence only after
all receipts, state reads, fail-closed probes, and vault conservation checks
pass.

## Safety boundary

- The command targets chain `114`, the verified PayGuard registry/vault/router,
  the supported FTestXRP asset, and a fixed `10,000` UBA test amount.
- It requires a clean Git tree, the deployment owner, at least one C2FLR, an
  unreserved vault balance, `--broadcast`, and
  `--confirm-simulated-tee-onchain`.
- The private policy and three generated keys exist only in memory. No policy
  plaintext, ciphertext, raw signature, private key, or credential is logged or
  written to evidence.
- The generated identities are registered only in PayGuard's internal policy
  registry. They are not registered in the official FCC machine manager, do not
  have TEE attestation, stable HTTPS origins, or an authenticated FCC indexer,
  and cannot close a live FCC/release gate.
- An interrupted run can leave public simulated machine entries. Because their
  keys are deliberately not persisted, a later run creates a fresh isolated
  set; no unsupported identity is restored.

## Commands

The read-only preflight needs no key:

```sh
pnpm coston2:simulated-lifecycle:plan
```

The writer requires the dedicated PayGuard Coston2 variables already stored in
the ignored `.env.local`:

```sh
set -a
. ./.env.local
set +a
pnpm coston2:simulated-lifecycle:run
```

Successful evidence belongs under `evidence/simulation/`, even though its
transactions are real Coston2 transactions. The public web evidence validator
requires `SIMULATED_TEE_ONCHAIN`, false hardware/official-machine assertions,
and explicit non-release claims before it will publish this class of record.

## Recorded run

The guarded run completed on 2026-08-09 and produced
[`coston2-simulated-policy-lifecycle-2026-08-09.json`](../../evidence/simulation/coston2-simulated-policy-lifecycle-2026-08-09.json).
It contains 14 unique successful Coston2 transactions across blocks `33811935`
through `33811981`. A separate credential-free RPC read rechecked every receipt
and the canonical final state:

- all three PayGuard-local machine entries match their recorded public signer
  and key fingerprint;
- policy status is revoked (`3`), the recurring request is executed (`4`), and
  the cap-exceeded request is denied (`3`);
- vault accounting is `1,000,000` deposited, `990,000` available, `10,000`
  spent, and zero reserved, withdrawn, or refunded.

The run generated and discarded the private policy and signer keys in memory.
Its three identities are not official FCC machine-manager registrations, so
this record closes only the solution-3 on-chain simulation checkpoint. Live
hardware custody, stable origins, authenticated indexers, and signed FCC
results remain unverified.
