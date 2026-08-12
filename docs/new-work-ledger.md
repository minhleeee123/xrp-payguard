# XRP PayGuard new-work and provenance ledger

> Snapshot basis: repository history through `bd4337a`, 2026-08-11. This is a
> retrospective ledger prepared before submission. A complete ledger was not
> committed before implementation started, so this document must never be
> described as contemporaneous pre-implementation evidence.

## 1. Classification

| Label | Meaning in this repository |
|---|---|
| `NEW` | PayGuard-specific product, protocol, source, test, tool, UI, or evidence created in this repository. |
| `ADAPTED` | New PayGuard implementation informed by a recorded external or read-only pattern; source, assumptions, and independent checks are named. |
| `THIRD_PARTY` | Pinned external package, protocol ABI, toolchain, or official scaffold used as a dependency or specification. |
| `REFERENCE_ONLY` | Material retained for lessons or competition context and excluded from PayGuard implementation/release evidence. |

The label applies to the implementation described by a row, not to every
transitive dependency in its build graph. Dependency versions are controlled by
the committed manifests and lockfiles; this ledger is not a substitute for an
independent license or supply-chain audit.

## 2. Inputs that pre-date or sit outside PayGuard

| Input | Classification | Exact boundary |
|---|---|---|
| Owner-supplied Summer Signal material under `docs/reference/original/` | `REFERENCE_ONLY` | Copied during bootstrap at `329f2f1`; source workspace commit and SHA-256 values are frozen in [`reference/SOURCE-PROVENANCE.md`](reference/SOURCE-PROVENANCE.md). It supplies context, not implementation or PayGuard evidence. |
| VeilBid workspace at `d28b2d448e8f08f684b55162453dd69b5ba46964` | `REFERENCE_ONLY` with specifically recorded `ADAPTED` patterns | Read-only lessons, ECIES interoperability, domain/relay, and operational patterns. No `.env`, secret, deployment, address, extension ID, machine identity, signature, ciphertext, or evidence is a PayGuard fact. Accepted adaptations are enumerated in [`technology/reuse-inventory.md`](technology/reuse-inventory.md). |
| Official Flare FCE scaffold, initial review `ffb6c4ca7c160c49be59e00fe537e24d2477b000`, current operational pin `e3f587949069780084e2ced8a53c9419ed05c250` | `THIRD_PARTY` pattern/dependency | Container and instruction-routing contract inspected read-only. The pinned checkout had no license file, so no source file was copied wholesale. PayGuard has its own commands, domains, ingress, policy logic, images, deployment, and evidence. |
| Official Flare contracts, registries, documentation, `tee-node`, and `go-flare-common` | `THIRD_PARTY` protocol/dependencies | Used through pinned packages, supported registry discovery, and runtime verification. A documentation or reference address does not become a PayGuard release fact. |
| User-directed encrypted-terminal/editorial visual brief | `ADAPTED` design direction | Canonicalized in `DESIGN.md`; React/CSS, product information architecture, motion, dotted graphics, and mascot SVGs are PayGuard implementation. No zkPass code, logo, screenshot, deployment, or asset was imported. |
| Node/pnpm/Go/Foundry/Solidity, React/Vite/Vitest, viem, xrpl.js, Noble, and transitive packages | `THIRD_PARTY` | Exact direct versions and toolchain constraints live in manifests, lockfiles, `go.mod`, and `tooling/versions.json`. They are not counted as PayGuard-authored work. |

## 3. PayGuard implementation record

| Area | Classification | Paths | Representative history | What is independently checked |
|---|---|---|---|---|
| Product, policy model, privacy map, threat model, journeys, and competition boundary | `NEW`, excluding the separately classified reference/lesson/reuse records | `README.md`, `PLAN.md`, `DESIGN.md`, canonical product and technology docs | `329f2f1`, `3441244`, `40c37c4`, `1a9a6a1` | Required-doc links, explicit non-claims, solution-3 boundary, and public competition freshness. Interviews, pilots, organizer acceptance, and external review remain unverified. |
| Deterministic policy protocol and cross-language fixtures | `NEW` | `packages/protocol/`, `apps/fcc-extension/internal/protocol/`, contract math libraries | `225e63d`, `04cfab4`, `a402dd6`, `a7f0308` | TypeScript/Go/Solidity vectors, composition, schedule/window arithmetic, range/overflow, replay, canonical FDC descriptor/snapshot binding, and domain-negative tests. |
| Policy registry, vault, router, foundation sender, and atomic XRPL FDC consumer contracts | `NEW` | `packages/contracts/` | `2443d9d`, `607113e`, `1cfe44b`, `17ff0bc`, `67f21bb`, `4bc6cd8` | Foundry unit/fuzz/invariant/security tests, generated binding drift, Coston2 runtime/constructor/wiring verification, official FDC selector and cross-language input-commitment vector. One live FDC proof consumption reaches only `Pending`; the hosted V2 registered simulated FCC lifecycle executes independently, while canonical FDC-to-FCC composition, external audit, and a full release remain open. |
| FCC private-policy extension | `ADAPTED` infrastructure boundary; `NEW` PayGuard schema and logic | `apps/fcc-extension/`, related FCC tooling | `e47f0bd`, `ed6ac4d`, `3b002b9`, `f02ccc8`, `af05706`, `7f0563d`, `c2626a2`, `60fd9af` | Ciphertext-only ingress, owner signature, fresh identity, identity-namespaced store, custody receipts, deterministic evaluation, Go tests, reproducible image, local smoke, registered A/B/D simulated machines, live V2 all-three custody/two-of-three results, C→D replacement, and executor-pause recovery. The V2 simulated candidate passes; hardware TEE custody and a verified release remain open. |
| Stateless threshold relay/executor core | `NEW` | `apps/relay/` | `916f140`, `1a8c6f0`, `4101e56`, `987db37`, `a6788a0`, `546c641`, `dbd5f9a`, `85e8fa9` | Threshold/domain/replay/split/outage, idempotency, rate limit, public recovery, competing executor, health, aggregate-private observability, and a hosted authenticated V2 Coston2 candidate path. The route accepts only the exact on-chain requester evaluation signature with requester/IP budgets while keeping the relay as a bounded gas-paying executor; the policy owner cannot substitute for a distinct requester. |
| XRPL, FDC, FTSO, Smart Account, FAssets, roles, notifications, and redemption adapters | `NEW` against `THIRD_PARTY` official interfaces | `packages/integrations/` | `9312e4c`, `332a2fe`, `fa19d0e`, `abb803f`, `f2abcc7` | Bounded codecs, proof/owner/nonce/domain bindings, runtime dependency resolution, fail-closed provider behavior, direct-mint/redemption checkpoints, and local Web2Json source/transform/schema/semantic-trust validation. Live facts are limited to their individual sanitized evidence records; Web2Json has no live source/proof/consumer claim. |
| Generated consumer bindings | `NEW` generated output from PayGuard artifacts | `packages/bindings/`, `tooling/generate-bindings.mjs` | `545b14d`, `11ba0b1` | Deterministic regeneration and binding-drift gate. They are not a verified release binding set until the release manifest passes. |
| Web application and landing | `NEW` implementation from the adapted visual direction | `apps/web/`, `DESIGN.md` | `81f4797`, `8383d18`, `d597036`, `6cc99c2`, `5e15726`, `914a7bb`, `46ac651`, `dbd5f9a` | Unit/type/build, desktop/mobile/keyboard/reduced-motion smoke, reviewed evidence decoding, Lighthouse, no browser persistence, Vercel asset reachability, and hosted V2 FCC custody/evaluation controls. Policy Studio through Requests supports connected-wallet ownership while the bounded relay executor remains separate from policy governance and decisions. |
| Deployment, recovery, security, release, and public-evidence tooling | `NEW` with official protocol dependencies | `tooling/`, `releases/`, `.github/` | `fc2069e`, `f1a1d85`, `17ff0bc`, `7927fdd`, `4e589a0`, `aa75eda`, `7f0563d`, `c2626a2`, `60fd9af` | Pinned toolchain, guarded broadcast, runtime/wiring reads, restart journals, secret/privacy/evidence scans, release rejection, public historical funding reconstruction, atomic-consumer deployment verification, live threshold lifecycle, replacement, and executor recovery. Live writers require explicit PayGuard-local credentials and do not emit them. |
| Coston2 and local simulation evidence | `NEW` PayGuard observations | `evidence/coston2/`, `evidence/simulation/`, `evidence/web/` | `67f21bb`, `146d7d2`, `e769d08`, `f8ae4f9`, `9bfec62`, `de47283` | Allowlisted public fields, assertion booleans, evidence validation, privacy scan, and explicit testnet/simulation markers. No VeilBid evidence was renamed or reused. |
| Integration examples | `NEW` | `packages/sdk-examples/`, `docs/integration-guide.md` | `51b94e2` | Compile-tested wallet and Flare-dApp previews that fail closed without a verified release/provider. No package publication or live write path is claimed. |

Representative hashes locate the introduction or a material verification
checkpoint; they are not an exhaustive authorship list. The complete record is
the repository's Git history and path-level history.

## 4. Explicitly excluded from new-work claims

- Toolchains, package-manager output, third-party packages, official protocol
  behavior, public chain state, and external service responses.
- Files under `docs/reference/original/`, copied `.reference.md` material, and
  lessons derived from VeilBid.
- Any key, credential, account, deployment, signature, machine identity, or
  evidence originating in VeilBid.
- Organizer approval, bounty eligibility, user research, pilots, audits,
  partnerships, traction, production readiness, or mainnet safety that did not
  actually occur.
- Hardware confidentiality, independent-operator assurance, or production
  readiness inferred from registered `SIMULATED_TEE` custody/results.

## 5. Verification and maintenance

Before using this ledger in a submission:

```sh
git status --short
git log --oneline --decorate
pnpm docs:check
pnpm secret:scan
pnpm privacy:scan
pnpm evidence:check
```

Every later adapted component must add its exact source commit/file, license or
missing-license treatment, changed assumptions, independent tests, and excluded
facts to `technology/reuse-inventory.md`, then update this ledger. New evidence
must remain PayGuard-owned, public-safe, and scoped to the assertions it proves.
