# Coston2 interactive simulated-FCC demo

> Status: the separate simulation-only registry, vault, router, three actor
> registrations, and Vercel environment bindings were deployed and read back on
> Coston2 on 2026-08-10. Production API/UI lifecycle smoke remains pending.
> Nothing in this document is a production FCC, hardware TEE,
> registered-production-machine, or verified-release claim.

Public simulation evidence:
[`evidence/simulation/coston2-interactive-demo-deployment-2026-08-10.json`](../../evidence/simulation/coston2-interactive-demo-deployment-2026-08-10.json).

| Component | Simulation-only Coston2 identifier |
| --- | --- |
| Registry | `0xc5e18B97ca556B25e41FA0e0F3a6ba05B3Da2a49` |
| Vault | `0xF8e3A4516f63b09c2D3e02E5F1e7188308AA13F4` |
| Router | `0x01c91b3E11D85068A6898876e270bdFA2Fab0c09` |

The evidence records eight successful deployment/wiring/registration
transactions, distinct public actor descriptors, runtime/wiring readbacks, and
all mandatory false production assertions. Actor private keys remain only in
the ignored mode-`0600` local environment and encrypted Vercel Production
environment; they are absent from source and evidence.

## Objective

Let a hackathon reviewer complete the PayGuard policy lifecycle from the
deployed web application with faucet C2FLR and FTestXRP while preserving the
production architecture and its fail-closed security boundary.

The mode label is always:

`SIMULATED FCC · COSTON2 TESTNET · NOT PRODUCTION TEE`

## Isolation model

- Production FCC code and the existing verified public-contract observations
  remain unchanged.
- Interactive demo policies use a separately deployed Coston2 registry, vault,
  and router. Demo machine identities are never registered in the existing
  PayGuard contract namespace.
- Three logical actors expose separate HTTPS routes and use three distinct
  demo-only keys stored in the hosting provider's encrypted environment.
- All actors share one hosting/operator failure domain. Three signatures prove
  protocol threshold behavior only; they do not prove operator independence or
  hardware confidentiality.
- The actors are stateless. They do not claim sealed custody or restart-stable
  TEE identity.

## Private data flow

1. Policy Studio canonicalizes the policy in browser memory.
2. The browser fetches the three public actor descriptors.
3. It encrypts one independent ciphertext to each actor's secp256k1 public key.
4. Each actor decrypts only its addressed ciphertext in memory, checks the exact
   Coston2/demo-contract/machine binding, recomputes the policy commitment, and
   returns a signed public receipt.
5. Plaintext, ciphertext, keys, raw request bodies, and raw signatures are not
   logged, persisted, included in analytics, or published as evidence.
6. Refresh intentionally discards the draft and ciphertexts.

Users must not enter real operational policy material. Vercel/serverless
execution is outside a hardware TEE and therefore supplies transport and
process isolation only, not production confidentiality.

## Public lifecycle

1. Connect an injected wallet on chain `114`.
2. Approve and deposit faucet FTestXRP into the simulation-only vault.
3. Verify three signed custody receipts and register the public policy binding.
4. Create an exact public request from the connected requester.
5. Each actor independently reloads finalized registry, router, vault, and
   spend-history state, rejects a not-yet-created or expired request, evaluates
   the private policy at the request's domain-bound creation timestamp, and
   signs the result. This deterministic timestamp lets actors invoked across
   adjacent finalized blocks produce one matching digest without trusting a
   browser-supplied clock.
6. The client verifies three envelopes and submits two matching results. It
   never supplies the decision.
7. Execute an allowed request, or observe canonical denial without movement.
8. Exercise stop, resume, revoke, cancel, expire, and wallet-free audit reads.

Every write uses an exact preview, injected-wallet signing, receipt/event
verification, finalized readback, and a visible explorer link. Dependency or
quorum failure remains unavailable/denied; no local fallback becomes success.

## Actor request rules

- `POST` only, JSON only, bounded body and time window, no credentials in URLs.
- Exact actor number, machine ID, key fingerprint, public key, chain, registry,
  vault, router, schema, extension and code-version domain.
- Custody accepts encrypted policy wire only and checks commitment/binding.
- Evaluation accepts encrypted policy plus a public request ID. It reconstructs
  state from finalized Coston2 reads rather than accepting a client decision or
  caller-declared totals.
- Unknown schema, malformed ciphertext, wrong actor, stale/expired request,
  RPC failure, history drift, split results, or fewer than two valid results
  fails closed.

## Evidence and release boundary

Public evidence may record the separate demo contract addresses, deployment
transactions, actor machine IDs/key fingerprints/signers, code version,
result commitments, request IDs, blocks, transaction IDs, public amounts,
timings, and assertion booleans. It must not record actor keys, policy data,
ciphertext, raw signatures, request bodies, or private denial details.

Mandatory false assertions are:

- `hardwareTeeVerified: false`
- `registeredProductionMachinesVerified: false`
- `independentOperatorsVerified: false`
- `sealedPersistenceVerified: false`
- `productionFccReleaseVerified: false`

The production roadmap still requires three stable independently operated FCC
origins, authenticated indexer access, registered hardware machines, supported
recovery, external review, and a verified release manifest.
