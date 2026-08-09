# XRP PayGuard submission draft

> Prepared 2026-08-09. This is a copy-ready draft, not evidence that a
> DoraHacks submission, demo video, organizer review, or user pilot occurred.

## Project

**Name:** XRP PayGuard

**Selected bounty:** Interoperable Asset Products

**One-sentence description:** XRP PayGuard lets an XRPL-native user fund a
public Flare vault and define a confidential recurring-payment policy whose
future authorization is designed to require matching results from a frozen FCC
machine set.

**Target user:** XRPL-native individuals and treasury teams that need repeatable
payment controls, explicit failure/recovery states, and public settlement
evidence without publishing the policy rules themselves.

## What works now

- Three non-upgradeable PayGuard contracts and their FTestXRP vault wiring are
  deployed and runtime/constructor verified on Coston2.
- One PayGuard-owned path completed validated XRPL Testnet Payment → FDC
  `XRPPayment` request/finality/proof verification → Smart Account direct mint
  → PayGuardVault accounting.
- Public amount and tagged FAssets redemption request/payout/settlement
  observations are recorded separately.
- The policy protocol, contract authorization/accounting state machines,
  stateless relay, and FCC extension pass deterministic local tests.
- Three disposable local `SIMULATED_TEE` containers demonstrate distinct
  identities, ciphertext-only ingress, threshold behavior, restart rotation,
  hardening, and fail-closed errors.
- A public Vercel product shell exposes a reviewed evidence mirror and labels
  unavailable providers instead of mocking success.

## How PayGuard uses Flare

1. **FAssets and Smart Accounts:** an XRPL Payment can fund FTestXRP into the
   PayGuard vault through the public Smart Account direct-mint path.
2. **FDC:** the funding path binds the exact XRPL transaction and proof owner,
   derives the round from the mined request, waits for finality, and verifies
   `XRPPayment` on-chain before accepting the public proof commitment.
3. **FAssets exit:** redemption observations cover the public request and
   settlement semantics; canonical PayGuard consumption/default recovery is
   still limited exactly as the evidence states.
4. **FTSO:** deterministic freshness/value gates and runtime dependency
   resolution exist, but no full live FCC policy lifecycle using an FTSO
   snapshot is claimed.
5. **FCC:** the intended authorization path freezes three compatible machine
   identities and requires two matching evaluations. The hackathon artifact
   demonstrates this locally in `SIMULATED_TEE` mode only; stable registered
   hardware-backed machines and live policy custody/results are post-hackathon.

## Public links

- Application: <https://xrp-payguard.vercel.app/>
- Evidence index: <https://xrp-payguard.vercel.app/evidence/index.json>
- Repository: <https://github.com/minhleeee123/xrp-payguard>
- Demo runbook: [`hackathon-handoff.md`](hackathon-handoff.md)
- Architecture: [`technology/architecture.md`](technology/architecture.md)
- Verification matrix: [`technology/verification.md`](technology/verification.md)
- Threat model: [`technology/threat-model.md`](technology/threat-model.md)
- Roadmap: [`product/production-readiness-plan.md`](product/production-readiness-plan.md)
- Demo video: **not yet recorded**

## Coston2 public identifiers

| Component | Address / identifier |
|---|---|
| PayGuardPolicyRegistry | `0x8DFb2D7D7a2608Ee7Cd78983fbe28cCE00e1D4A4` |
| PayGuardVault | `0xFFe7522075412B2eBA5b8B91c9aA4E1c2c6f84dB` |
| PayGuardActionRouter | `0x28A969018975Fb40aEd0BfA98f6d1c3023B6a7Da` |
| FCC foundation sender extension | `66037` |

The exact deployment transactions, blocks, runtime hashes, constructor/wiring
assertions, and official runtime dependency observations are in the public
evidence index. Extension `66037` proves only the foundation sender binding;
it is not a registered PayGuard policy machine or a live FCC result.

## New work and provenance

XRP PayGuard's product model, private/public schema, deterministic codecs,
contracts, FCC policy extension, relay, Flare/XRPL adapters, web experience,
deployment checks, evidence validators, and documentation were built in this
repository. The official FCC scaffold is digest-pinned and used according to
its documented boundary. VeilBid was read-only: its secrets, deployments,
evidence, signatures, extension IDs, and machine identities were not copied.
The complete retrospective new-work classification is in
[`new-work-ledger.md`](new-work-ledger.md). Detailed adaptation provenance is in
[`technology/reuse-ledger.md`](technology/reuse-ledger.md) and
[`technology/reuse-inventory.md`](technology/reuse-inventory.md).

## Honest limitations

- No hardware-backed PayGuard FCC machine, stable HTTPS machine origin,
  authenticated FCC indexer, live policy custody, or signed live policy result
  has been verified.
- The Vercel build is a static shell/evidence mirror; wallet, policy provider,
  relay, and live audit providers remain unavailable.
- No verified PayGuard release manifest, external audit, mainnet integration,
  user interview, pilot, revenue, partnership, or traction claim exists.
- Ordinary XRP/FXRP transfers expose amount, recipient, timing, and transaction
  graph. PayGuard is not private money or a mixer.

## Roadmap

After the hackathon: operate three independent hardware-backed FCC machines
with stable origins and authenticated indexers; register and verify exact
machine/code/key domains; run live custody/evaluation/recovery/outage drills;
connect the hosted relay and web; commission independent contract/FCC reviews;
then run a bounded design-partner testnet pilot. Mainnet requires fresh address
resolution, a new audited candidate, disposable canary, strict value caps,
incident coverage, and a verified release manifest.

## Final submission checklist

- [x] Project, bounty, product description, and target user drafted.
- [x] Demo/application, repository, technical docs, Coston2 identifiers, and
  roadmap links prepared.
- [x] Flare integration, new work, provenance, and limitations drafted.
- [x] Recheck the public event page for the exact deadline, published package,
  track direction, existing-project policy, and public form state.
- [ ] Reconfirm the enabled final form fields, account eligibility, and bounty
  selection directly in the owner's DoraHacks session before submitting; the
  public page currently reports its submission form disabled.
- [ ] Record and upload a demo video without showing `.env.local`, credentials,
  keys, raw signatures, or private policy material.
- [ ] Add only user/community/pilot facts that actually occurred; otherwise
  retain the explicit zero-session statement.
- [ ] Submit from the owner's account and save the resulting public submission
  URL or receipt.
