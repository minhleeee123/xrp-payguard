# Coston2 interactive simulated-FCC demo

> Status: implementation plan. Nothing in this document is a production FCC,
> hardware TEE, registered-machine, or verified-release claim.

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
   spend-history state, evaluates the private policy, and signs the result.
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
