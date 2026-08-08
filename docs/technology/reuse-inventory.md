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

## 5. Reuse acceptance checklist

Before adapting a component:

1. Record source file/commit and license/provenance.
2. Identify VeilBid-specific assumptions and confidential fields.
3. Write PayGuard requirements and negative tests first.
4. Rename domains/types only after semantics actually change.
5. Generate new bindings from new PayGuard artifacts.
6. Run secret/privacy scans on the adapted diff.
7. Record the component as `adapted`, not `new`, in the future new-work ledger.
