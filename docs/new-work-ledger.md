# XRP PayGuard new-work and provenance ledger

> Snapshot basis: repository history through `1a9a6a1`, 2026-08-09. This is a
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
| Official Flare FCE scaffold at `ffb6c4ca7c160c49be59e00fe537e24d2477b000` | `THIRD_PARTY` pattern/dependency | Container and instruction-routing contract inspected read-only. The pinned checkout had no license file, so no source file was copied wholesale. PayGuard has its own commands, domains, ingress, policy logic, images, deployment, and evidence. |
| Official Flare contracts, registries, documentation, `tee-node`, and `go-flare-common` | `THIRD_PARTY` protocol/dependencies | Used through pinned packages, supported registry discovery, and runtime verification. A documentation or reference address does not become a PayGuard release fact. |
| User-directed encrypted-terminal/editorial visual brief | `ADAPTED` design direction | Canonicalized in `DESIGN.md`; React/CSS, product information architecture, motion, dotted graphics, and mascot SVGs are PayGuard implementation. No zkPass code, logo, screenshot, deployment, or asset was imported. |
| Node/pnpm/Go/Foundry/Solidity, React/Vite/Vitest, viem, xrpl.js, Noble, and transitive packages | `THIRD_PARTY` | Exact direct versions and toolchain constraints live in manifests, lockfiles, `go.mod`, and `tooling/versions.json`. They are not counted as PayGuard-authored work. |

## 3. PayGuard implementation record

| Area | Classification | Paths | Representative history | What is independently checked |
|---|---|---|---|---|
| Product, policy model, privacy map, threat model, journeys, and competition boundary | `NEW`, excluding the separately classified reference/lesson/reuse records | `README.md`, `PLAN.md`, `DESIGN.md`, canonical product and technology docs | `329f2f1`, `3441244`, `40c37c4`, `1a9a6a1` | Required-doc links, explicit non-claims, solution-3 boundary, and public competition freshness. Interviews, pilots, organizer acceptance, and external review remain unverified. |
| Deterministic policy protocol and cross-language fixtures | `NEW` | `packages/protocol/`, `apps/fcc-extension/internal/protocol/`, contract math libraries | `225e63d`, `04cfab4`, `a402dd6`, `a7f0308` | TypeScript/Go/Solidity vectors, composition, schedule/window arithmetic, range/overflow, replay, and domain-negative tests. |
| Policy registry, vault, router, foundation sender, and atomic XRPL FDC consumer contracts | `NEW` | `packages/contracts/` | `2443d9d`, `607113e`, `1cfe44b`, `17ff0bc`, `67f21bb`, `4bc6cd8` | Foundry unit/fuzz/invariant/security tests, generated binding drift, Coston2 runtime/constructor/wiring verification, official FDC selector and cross-language input-commitment vector. The consumer deployment is verified separately; live proof consumption, private FDC evaluation, external audit, and a full release remain open. |
| FCC private-policy extension | `ADAPTED` infrastructure boundary; `NEW` PayGuard schema and logic | `apps/fcc-extension/`, related FCC tooling | `e47f0bd`, `ed6ac4d`, `3b002b9`, `f02ccc8`, `af05706` | Ciphertext-only ingress, owner signature, fresh identity, sealed local store, custody receipts, deterministic evaluation, Go tests, reproducible image, and local three-machine smoke. Hardware TEE custody and live registered-machine results are not verified. |
| Stateless threshold relay/executor core | `NEW` | `apps/relay/` | `916f140`, `1a8c6f0`, `4101e56`, `987db37` | Threshold/domain/replay/split/outage, idempotency, rate limit, public recovery, competing executor, health, and aggregate-private observability tests. No hosted relay is claimed. |
| XRPL, FDC, FTSO, Smart Account, FAssets, roles, notifications, and redemption adapters | `NEW` against `THIRD_PARTY` official interfaces | `packages/integrations/` | `9312e4c`, `332a2fe`, `fa19d0e`, `abb803f`, `f2abcc7` | Bounded codecs, proof/owner/nonce/domain bindings, runtime dependency resolution, fail-closed provider behavior, direct-mint and redemption checkpoints. Live facts are limited to their individual sanitized evidence records. |
| Generated consumer bindings | `NEW` generated output from PayGuard artifacts | `packages/bindings/`, `tooling/generate-bindings.mjs` | `545b14d`, `11ba0b1` | Deterministic regeneration and binding-drift gate. They are not a verified release binding set until the release manifest passes. |
| Web application and landing | `NEW` implementation from the adapted visual direction | `apps/web/`, `DESIGN.md` | `81f4797`, `8383d18`, `d597036`, `6cc99c2`, `5e15726` | Unit/type/build, desktop/mobile/keyboard/reduced-motion smoke, reviewed evidence decoding, Lighthouse, no browser persistence, and Vercel asset reachability. The hosted artifact is a static shell, not a live policy provider. |
| Deployment, recovery, security, release, and public-evidence tooling | `NEW` with official protocol dependencies | `tooling/`, `releases/`, `.github/` | `fc2069e`, `f1a1d85`, `17ff0bc`, `7927fdd`, `4e589a0`, `aa75eda` | Pinned toolchain, guarded broadcast, runtime/wiring reads, restart journals, secret/privacy/evidence scans, release rejection, public historical funding reconstruction, and atomic-consumer deployment verification. Live writers require explicit PayGuard-local credentials and do not emit them. |
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
- Hardware confidentiality or registered FCC custody/results inferred from the
  local `SIMULATED_TEE` stack.

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
