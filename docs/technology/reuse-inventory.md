# VeilBid resource reuse inventory

## 1. Principle

XRP PayGuard is a new product and must produce its own protocol schemas,
contracts, extension commands, deployment, bindings, UI, evidence, and user
validation. Reuse means adapting reviewed infrastructure patterns with explicit
provenance; it never means relabeling VeilBid artifacts.

Read-only source workspaces:

- `/home/admin/Documents/veilbid-v2`
- the separately cloned historical VeilBid repository, when available

## 2. Candidates for adaptation after review

| Resource | Possible PayGuard use | Required adaptation |
|---|---|---|
| FCC scaffold/image recipes | extension bootstrap | new extension/commands, code hash, images, registration |
| Domain/signature codecs | pattern for threshold results | new policy/request/result domains and golden vectors |
| Private ingress | ciphertext-only transport pattern | new policy schema, authorization, rate limits, receipts |
| Smart Account encoder | XRPL-native vault funding | new target calls, commitments, nonce and event checks |
| FDC executor pattern | payment/trigger proof workflow | new expectations, checkpoint schema, proof domain |
| FAssets helpers | token discovery/redemption | current registry resolution and PayGuard vault integration |
| FTSO reader | reference-value cap | new rounding/freshness/policy bindings |
| Public-market reader | wallet-free evidence pattern | new event model and policy/action dossiers |
| UI primitives | typography, wallet selection, errors | new product structure and PayGuard user research |
| Secret/evidence scanners | release validation | new forbidden outputs and workspace paths |

## 3. Never copy or reuse as PayGuard facts

- Any old or current private key, XRPL seed, API key, proxy credential, or `.env`.
- VeilBid contract addresses, release manifests, extension IDs, TEE identities,
  machine keys, signatures, transactions, blocks, or evidence as proof of PayGuard.
- VeilBid bid plaintext/ciphertext, credentials, sample private data, or logs.
- Sepolia/Nox/Safe/ERC-7984 facts in a Flare/PayGuard release.
- Tender/buyer/vendor/winner product claims without a deliberate PayGuard mapping.
- Hosted deployment state without a new deploy and production smoke against the
  exact PayGuard source commit.

## 4. Accepted adaptation record

| PayGuard component | Read-only source provenance | License | Adaptation and independent verification |
|---|---|---|---|
| Browser-to-tee-node ECIES | VeilBid workspace HEAD `d28b2d448e8f08f684b55162453dd69b5ba46964`; last source commit `fcc61b731ddb1a2818fa447ad797c328fd8f5cfe`; `packages/flare-bindings/src/private-bid.ts` | MIT, Copyright 2026 Hữu Trung | Adapted only the secp256k1 / AES-128-CTR / SHA-256 / HMAC-SHA-256 interoperability pattern. PayGuard adds its own strict policy wire, 64 KiB bound, key wiping, machine descriptor, owner-authorized ingress domain, and deterministic TypeScript-to-Go decrypt vector. No VeilBid key, ciphertext, environment, identity, deployment, or evidence was copied. |
| FCC image/compose layout | Official Flare `fce-extension-scaffold` HEAD `ffb6c4ca7c160c49be59e00fe537e24d2477b000`; last relevant commit `7b64958be7cd793927e6effdb7880a5680776541`; `go/Dockerfile` and `docker-compose.yaml` | No license file was present in the pinned checkout; treated as an official pattern reference, not copied wholesale | PayGuard uses its own module, entrypoint, private ingress, current pinned Go/distroless/frontend digests, production-safe mode default, minimal build context, deterministic two-build check, and credential-free disposable three-machine smoke. No scaffold env, proxy key, extension ID, deployment, or evidence was copied. |
| FCC foundation sender and typed PING | Official Flare scaffold commit `ffb6c4ca7c160c49be59e00fe537e24d2477b000`, `contracts/InstructionSender.sol` and minimal registry interfaces; VeilBid workspace HEAD `d28b2d448e8f08f684b55162453dd69b5ba46964`, source commits `6fbdd18579dad8b6e95815028fd76f6175a4abee`, `da757a0c8a6897be8abd3f132b5c73617f768be2`, and `b2d23422138c7730e16a104d91842d6c78f40b14` | Official pinned scaffold has no license file and was pattern-only; VeilBid is MIT | PayGuard uses its own domain, operation type, request/response schema, code binding, Coston2 constructor guard, caller-restricted inputs, canonical decoding, golden digest, and negative tests. No extension ID, machine, address, action, signature, credential, deployment, or evidence was copied. |
| Production machine admission | Official Flare scaffold commit `ffb6c4ca7c160c49be59e00fe537e24d2477b000`, `tools/pkg/fccutils/{tee_calls,common,registration}.go`; `tee-node v0.0.24` typed machine/TEE domains and root asset; `go-flare-common v1.2.2-0.20260727094511-09a10067e6a4` Google PKI verifier; Google Confidential Space discovery/root endpoints checked 2026-08-09 | Official packages/assets are dependency inputs; no VeilBid source was used | Replaced the scaffold's remote unverified-claim parsing with a PayGuard production-only verifier: pinned root fingerprint, certificate/JWT/nonce/workload checks, explicit bounded CRL inputs, strict HTTPS and response boundary, domain signatures, exact Coston2/extension/owner/image bindings, freshness, governance, and simulated-mode rejection. It emits only public identifiers and booleans and does not register or allow a version. |
| Code-version allowance plan | Official Flare scaffold commit `ffb6c4ca7c160c49be59e00fe537e24d2477b000`, `tools/cmd/allow-tee-version/main.go`; official generated `go-flare-common` extension-manager ABI; verified PayGuard foundation evidence at source commit `f9f550d30bc924c5b5a1ea59fdf96138be7a5c24` | Official scaffold has no license file and was pattern-only; generated package is a pinned dependency; no VeilBid source was used | PayGuard does not trust the scaffold's remote `/info` claims. Its plan consumes only the exact fresh output of the pinned-PKI admission verifier and binds the verified PayGuard extension/owner/sender plus manager platform, disabled, code-hash, version, and platform readbacks. The current unit is pure and cannot broadcast. |

## 5. Reuse acceptance checklist

Before adapting a component:

1. Record source file/commit and license/provenance.
2. Identify VeilBid-specific assumptions and confidential fields.
3. Write PayGuard requirements and negative tests first.
4. Rename domains/types only after semantics actually change.
5. Generate new bindings from new PayGuard artifacts.
6. Run secret/privacy scans on the adapted diff.
7. Record the component as `adapted`, not `new`, in the future new-work ledger.
