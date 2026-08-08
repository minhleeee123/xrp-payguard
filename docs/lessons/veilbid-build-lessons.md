# Lessons carried forward from building VeilBid Flare

This document captures concrete technical, operational, security, product, and
workflow lessons from the VeilBid Flare build. It is a design input for
XRP PayGuard, not proof that PayGuard has already solved these problems.

## 1. Start with release truth, not UI or copied configuration

### What went wrong or was easy to get wrong

- Historical Sepolia/Nox artifacts could look complete enough to be mistaken
  for Flare evidence.
- A copied address or binding could be correct for an earlier Coston2 deployment
  yet stale after a protocol/manager redeploy.
- Source changes and a pushed commit did not guarantee the hosted Vercel app had
  redeployed; production could still serve an older asset bundle.
- A local UI could render a `verified` label based on configuration before the
  full runtime/wiring/machine/signature mapping was checked.

### PayGuard rule

- Define a source-priority hierarchy before code.
- Treat all addresses in copied docs/env/reference manifests as references.
- Generate bindings from PayGuard artifacts and verify deployment/runtime/wiring.
- Smoke the actual hosted commit and asset bundle after every release-facing push.
- Never use a UI label as deployment evidence.

## 2. Pin and verify the complete toolchain early

### Observed problems

- The workspace requires Node 24; using a different system Node can produce
  misleading dependency/build failures.
- Repository-wide checks can stop because Go or Forge is absent even when web
  tests pass. Reporting only the passing web suite as a full root pass would be
  incorrect.
- FCC image, proxy, tee-node, Go module, Solidity/periphery, and generated ABI
  revisions can drift independently.

### PayGuard rule

- Pin Node, pnpm, Go, Foundry, Solidity, Docker/buildx, viem, XRPL, FCC scaffold,
  proxy, tee-node, and Flare packages in Gate 0.
- Add a preflight that reports every missing binary/version before tests.
- Report focused and root validation separately.
- Generate or drift-check every cross-language protocol representation.

## 3. FCC registration has operational prerequisites, not only code

### Observed problems

- The live FCC manager/configuration changed and had to be re-resolved.
- Machine registration required supported tee-node/proxy behavior, the correct
  registration mode, and a stable public HTTPS origin.
- Temporary tunnels are unsuitable for long-lived registered machine URLs.
- One extension needed three distinct registered identities and key fingerprints;
  three URLs pointing to one identity would not create a threshold system.

### PayGuard rule

- Resolve current FCC manager/registry from official organizer/Flare sources.
- Use stable named origins and pin exact images/binary digests.
- Validate on-chain URL, machine status, extension, code version, public key,
  and health binding continuously.
- Prove identities are distinct before accepting any multi-machine claim.

## 4. TEE restart identity is a product constraint

### Observed problem

The supported environment did not justify a same-identity restoration claim.
Restart/replacement can rotate identity and key. A product that freezes machines
for confidential state cannot silently substitute a new machine into an active
domain.

### PayGuard rule

- New registered replacements serve new policy versions.
- Existing policies keep their frozen machine set and either reach the surviving
  result threshold or fail closed into explicit owner recovery.
- Never persist/reinject a TEE private key merely to simulate stable identity.
- Test full rolling replacement and frozen-policy machine-loss behavior.

## 5. Distinguish custody quorum from result threshold

### Observed problem

A two-of-three result threshold is insufficient if different machines received
different private input sets. VeilBid required every bid to receive all three
receipts before it entered the canonical root, then allowed two matching results
after close.

### PayGuard rule

- Require all-three matching policy custody receipts before activation.
- Freeze one policy commitment and machine/key/code set.
- Require two matching evaluation results only after common custody exists.
- Reject partial/mixed receipt sets, duplicate machines, wrong key fingerprints,
  and incompatible code versions.

## 6. Domain binding must be exhaustive

### Observed problems

- A signature can be cryptographically valid but authorize the wrong chain,
  contract, policy/tender, root, attempt, or expiry.
- Retrying asynchronous work can accidentally accept old results if attempt,
  result nonce, and fixed grace period are not explicit.
- A generic signature-prefix assumption can disagree with the live FCC mapping.

### PayGuard rule

- Freeze the exact receipt and result field list before deployment.
- Bind chain, every relevant contract, extension, code, machine, owner, policy,
  request, amount, target, checkpoint, FTSO/FDC input, nonce, attempt, and expiry.
- Verify the current FCC signing prefix/domain and signer registration live.
- Maintain shared digest fixtures across Go, Solidity, and TypeScript.

## 7. Private ciphertext is still sensitive

### Observed problems

- Publishing ciphertext on-chain permanently exposes metadata and creates future
  decryption/correlation risk.
- Browser local storage, analytics, proxy access logs, error bodies, screenshots,
  and evidence can leak private payloads even when the contract does not.
- A helpful retry cache can become a plaintext/ciphertext shadow database.

### PayGuard rule

- Ciphertext-only private transport, but no public calldata/event/storage.
- No browser persistence of plaintext or ciphertext.
- Logs record request IDs/status/timing only; never bodies, keys, signatures, or
  private error context.
- Exact-ciphertext idempotent retry may exist only inside the defined sealed
  boundary; changed payload for an occupied nonce fails.
- Run browser/network/log/image/evidence output scans, not only source scans.

## 8. The chain must be rollback and replay authority

### Observed problem

TEE sealed state alone cannot prove it is the newest state after rollback,
restore, concurrency, or machine divergence. A private ledger outside the chain
can also disagree with public execution.

### PayGuard rule

- Bind evaluation to public policy version, request nonce, occurrence, balance,
  spend checkpoint/root, attempt, and expiry.
- Execute and advance the next checkpoint atomically.
- A stale TEE denies/fails; it never authorizes based on a private shadow total.
- Competing executors and transaction ordering must be in stateful tests.

## 9. Determinism requires shared math and boundary definitions

### Observed problems

- Price normalization, decimals, rounding, overflow, timestamps, and exact ties
  can diverge across Go/Solidity/TypeScript.
- Local timezone or wall-clock scheduling can make recurring logic inconsistent.
- Client-computed outcomes undermine the confidential path.

### PayGuard rule

- Checked integer/fixed-point math only.
- Canonical UTC/chain timestamps and explicit inclusive/exclusive boundaries.
- Document rounding direction for value caps.
- Golden vectors include zero, max, overflow, boundary slot, stale feed,
  permutation, and conflict/deny precedence.
- Browser simulation is informative only and never supplies the decision.

## 10. FTSO input must be frozen and optional by policy

### Observed problems

- A live UI price or client-supplied value is not a canonical policy input.
- Stale/unavailable price handling can accidentally fall back to a manual value.
- Requiring a feed for every action creates unnecessary liveness risk.

### PayGuard rule

- Use FTSO only for policies that need reference-value conversion.
- Freeze feed ID, value, decimals, timestamp, block/checkpoint, freshness, and
  result binding.
- Reject stale, zero, malformed, unavailable, or out-of-range feeds.
- Native-amount policies must not depend on FTSO.

## 11. FDC is a multi-stage workflow

### Observed problems

- FDC request submission, voting-round finalization, DA proof retrieval, and
  on-chain proof verification are separate asynchronous stages.
- A proof endpoint can be temporarily unavailable after payment.
- Restarting with a new quote/nonce/operation can invalidate the original
  payment commitment.
- Web2Json attestation proves the attested response, not the truthfulness of the
  business source.

### PayGuard rule

- Model every FDC stage explicitly and persist only public-safe checkpoints.
- Resume the same payment/request/round/proof domain after restart.
- Reject owner, destination, amount, memo, transaction, confirmation, MIC,
  source/type, freshness, and duplicate-ID mismatch.
- For Web2Json, allowlist URL/transform/schema and disclose semantic trust.

## 12. Smart Account funding must bind exact bytes

### Observed problems

- `0xFE` memo commits an exact packed operation; a visually similar action with
  different nonce, target, fee, or bytes is not interchangeable.
- Direct mint can be delayed, so a browser-only happy path is insufficient.
- The PersonalAccount, owner, operation nonce, executor fee, destination, and
  callback events all need independent verification.

### PayGuard rule

- Build canonical operation bytes once and show a public-safe preview.
- Keep XRPL signing entirely in the XRPL wallet.
- Resume delayed mint from transaction ID and immutable public parameters.
- Verify expected events and final vault funding, not only transaction success.
- Never accept quote/domain drift during resume.

## 13. FAssets settlement and redemption are public and asynchronous

### Observed problems

- Token/AssetManager addresses can change; hardcoding copied testnet addresses
  creates brittle integrations.
- A redemption request creates an obligation/process; it is not proof that XRP
  was instantly paid on XRPL.
- Public token balances, transfers, winner/payee, and amount cannot be described
  as confidential.

### PayGuard rule

- Resolve through supported registry/periphery sources and verify at release.
- Test exact token decimals/behavior and vault conservation.
- Distinguish request, event, agent obligation, and completed underlying payment.
- Use honest public-settlement language everywhere.

## 14. No success fallback after infrastructure failure

### Observed problems

- Mock tenders, winners, prices, proofs, or chain state can make a demo look
  functional while the real dependency is broken.
- Catch-all error handling can convert an unavailable FCC/FDC/RPC call into a
  default response.

### PayGuard rule

- Every dependency has explicit loading, unavailable, retry, and recovery state.
- No mock or local default is reachable in a release path.
- A missing signer/proof/feed/checkpoint returns `unavailable` or `denied`, never
  an authorization.
- Negative live calls are release evidence, not only unit tests.

## 15. Conservation and terminal-state tests catch real fund bugs

### Observed problem

Testing a single happy payout is insufficient. Award/refund/cancellation,
duplicate finalization, token callbacks, and partial failure can violate escrow
conservation even when the basic path works.

### PayGuard rule

- Define conservation algebra before contract code.
- Add stateful multi-vault/multi-policy invariant harnesses.
- Cover execute, deny, expiry, stop, revoke, supersede, withdrawal, refund,
  callback, reentrancy, and competing executor outcomes.
- Every request has one terminal outcome and every unit is accounted exactly once.

## 16. UI structure must match the product journey

### Observed problems

- Mixing landing content and operational workspaces made the product hierarchy
  confusing.
- Disabled controls copied from the historical product (`wrap/unwrap`) looked
  like broken functionality on Flare.
- Duplicate wallet, refresh, treasury, and redemption controls added noise.
- New forms initially inherited raw/default HTML because their CSS surface had
  not been reviewed in real browser screenshots.
- Role-route screenshot timing/scroll restoration could hide the header and
  create misleading visual evidence.

### PayGuard rule

- Separate landing, application, docs, and historical/reference surfaces.
- Only show controls with a real action in the current product/network.
- One owner for wallet, refresh, navigation, and contextual actions.
- Capture every laptop workspace after implementation; inspect real empty,
  loading, error, connected, and disconnected states.
- Use isolated browser profiles, reset scroll, and tie screenshots to deployed
  source when creating evidence.

## 17. Product language must not outrun implementation

### Observed problems

- Terms such as private settlement, anonymous bidder, verified delivery,
  production security, and full audit would exceed the actual trust model.
- A broad list of Flare protocol logos can look decorative if the user journey
  does not require them.

### PayGuard rule

- Say private **policy**, public **action/settlement**.
- Explain TEE/common-mode/provider trust and non-ZK boundary.
- Use one flagship journey in which each Flare primitive is necessary.
- Keep planned, target, verified, testnet, simulated/hardware, and production
  statuses explicit and mechanically checked where possible.

## 18. Evidence hygiene is part of engineering

### Observed problems

- Secret scans can regenerate timestamp/source fields in a tracked evidence
  file, creating unrelated diffs that need deliberate handling.
- Screenshots and raw responses can contain more than intended.
- Current source can be clean while Git history still contains a secret.
- A production smoke from an old deployment can contradict the local build.

### PayGuard rule

- Separate local generated evidence from canonical release evidence.
- Review every evidence diff and redact by construction, not after publication.
- Scan current files and history.
- Store screenshot digests/public metadata in evidence; keep raw captures local
  unless manually reviewed.
- Record the exact source commit and hosted asset/deployment in production smoke.

## 19. Workspace and secret handling

### Observed problems

- Private keys may omit a `0x` prefix; blindly passing them to libraries fails.
- Printing `.env`, shell expansion, command history, process arguments, or error
  objects can expose secrets.
- Reusing an old wallet confuses fund/evidence ownership across products.

### PayGuard rule

- Use a dedicated PayGuard testnet wallet and `.env.local` mode `0600`.
- Normalize/validate keys only in memory; never print the value.
- `.env*` is ignored except a placeholder `.env.example`.
- Public address/balance/transaction hashes may be logged; secrets may not.
- Fund budgets deliberately and keep enough C2FLR for gas/recovery.

## 20. Build a vertical slice first, but plan the whole product

### Observed tension

A full product needs personal/team/treasury/SDK/recovery surfaces, but building
all UI before proving FCC/FDC/Smart Account constraints creates expensive rework.
Conversely, a protocol-only vertical slice does not prove usefulness.

### PayGuard rule

- Maintain the complete product plan from day one.
- Implement phase gates in dependency order: foundation, private path,
  deterministic protocol, contracts, XRP-native funding, then full application.
- Validate with users before and during implementation.
- Never call the vertical slice the complete product, and never skip it on the
  way to a polished interface.
