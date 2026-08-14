# XRP PayGuard submission draft

> Prepared 2026-08-09 and technically refreshed through 2026-08-14. The owner
> confirmed submission of [BUIDL 47777](https://dorahacks.io/buidl/47777) to
> Interoperable Asset Products and published the final demo. This is not
> evidence of organizer acceptance, judging outcome, award, or user pilot.

## Project

**Name:** XRP PayGuard

**Selected bounty:** Interoperable Asset Products

The owner confirmed this track selection on 2026-08-09 and submission of
[BUIDL 47777](https://dorahacks.io/buidl/47777) on 2026-08-14. Organizer
acceptance, an independent eligibility determination, judging outcome, and any
award remain unverified.

**One-sentence description:** XRP PayGuard helps XRP-native treasury teams
automate recurring vendor payments without publishing private spending rules or
handing signing keys and authorization control to an automation operator;
execution requires matching results from a frozen FCC machine set and remains
publicly inspectable on Flare.

**Target user:** the primary user is an XRP/Flare treasury or DAO operator that
needs to give an approved vendor a bounded recurring allowance without
publishing the complete authorization policy. Personal subscriptions and wallet
or dApp integrations are secondary use cases.

**Example:** a DAO defines a private recurring-payment policy for a security
vendor. The vendor submits an exact public request without receiving the
policy's internal limits, schedule, or approval conditions. Registered FCC
machines evaluate the policy, and the router executes only after two matching
request-bound results. Amount, recipient, timing, vault accounting, and the
resulting transfer remain public.

## What works now

- Three non-upgradeable PayGuard contracts and their FTestXRP vault wiring are
  deployed and runtime/constructor verified on Coston2.
- One PayGuard-owned path completed validated XRPL Testnet Payment → FDC
  `XRPPayment` request/finality/proof verification → Smart Account direct mint
  → PayGuardVault accounting.
- A separate local Web2Json adapter binds a consumer-managed source allowlist,
  exact public request fields, deterministic jq/tuple-ABI schema, MIC, response,
  source-asserted freshness, replay, and an injected verifier. It has no live
  source, proof, private-policy evaluation, or on-chain consumer claim.
- Public amount and tagged FAssets redemption request/payout/settlement
  observations are recorded separately.
- The policy protocol, contract authorization/accounting state machines,
  stateless relay, and FCC extension pass deterministic local tests.
- Three disposable local `SIMULATED_TEE` containers demonstrate distinct
  identities, ciphertext-only ingress, threshold behavior, restart rotation,
  hardening, and fail-closed errors.
- Three stable Railway A/B/D `SIMULATED_TEE` machines are registered under
  extension `66037` with manager status `2`. Separate live Coston2 evidence
  verifies exact TEE/proxy signatures, all-three encrypted custody receipts,
  two-of-three ALLOW execution and `CAP_EXCEEDED` denial, conservation,
  stop/resume/revoke, supported C→D replacement without frozen-policy identity
  mutation, and complete executor pause/resume with unchanged pending state.
  The stale C identity is now manager status `4` after a separately verified
  pause transaction, leaving A/B/D as the exact active set.
- One separate solution-3 run exercised the deployed Coston2 contracts through
  14 successful transactions using three ephemeral simulated signers. It
  demonstrates two-of-three recurring authorization, cap denial,
  stop/resume/revoke, and vault conservation, but not live FCC custody or
  hardware confidentiality.
- A public Vercel dApp exposes a reviewed 26-entry evidence mirror and a hosted
  V2 candidate path through the Railway relay and registered A/B/D `SIMULATED_TEE`
  machines. The older isolated serverless-actor lifecycle remains historical
  evidence; neither path is hardware-backed or a verified release.
- The hosted V2 lifecycle passed three custody receipts, policy registration,
  two matching `ALLOW` results and execution, two matching `CAP_EXCEEDED`
  results, stop/resume/revoke, and vault conservation with registered status-2
  simulated FCC machines. It is live simulated-FCC evidence, not hardware-backed
  production or verified-release evidence; the older isolated V1 run remains
  simulation-only historical evidence.
- The current repository-only production-corpus audit fetched all 26 hosted
  evidence assets, required HTTP/JSON boundaries, and matched each body
  byte-for-byte to its reviewed local source without recursively publishing
  its own audit. It contains 25 chain-114 records and three explicitly bounded
  simulation records with overlapping categories. Earlier 15-, 23-, and
  25-body audits remain historical evidence for their pinned artifacts.

## How PayGuard uses Flare

1. **FAssets and Smart Accounts:** an XRPL Payment can fund FTestXRP into the
   PayGuard vault through the public Smart Account direct-mint path.
2. **FDC:** the funding path binds the exact XRPL transaction and proof owner,
   derives the round from the mined request, waits for finality, and verifies
   `XRPPayment` on-chain before accepting the public proof commitment.
3. **Web2Json:** a local-only boundary pins source, jq transform, tuple ABI,
   response, replay, and the explicit limitation that an attestation does not
   make the publisher's business assertion true.
4. **FAssets exit:** redemption observations cover the public request and
   settlement semantics; canonical PayGuard consumption/default recovery is
   still limited exactly as the evidence states.
5. **FTSO:** deterministic freshness/value gates and runtime dependency
   resolution exist, but no full live FCC policy lifecycle using an FTSO
   snapshot is claimed.
6. **FCC:** the authorization path freezes three compatible machine identities
   and requires two matching evaluations. The hosted UI now reaches registered
   A/B/D `SIMULATED_TEE` machines through the Railway V2 relay; live private
   custody, threshold evaluation, replacement, and executor recovery pass on
   Coston2. Hardware-backed independent operators and a verified release
   remain post-hackathon.

## Public links

- Application: <https://xrp-payguard.vercel.app/>
- Evidence index: <https://xrp-payguard.vercel.app/evidence/index.json>
- Repository: <https://github.com/minhleeee123/xrp-payguard>
- Demo runbook: [`hackathon-handoff.md`](hackathon-handoff.md)
- Product positioning: [`product/competitive-analysis.md`](product/competitive-analysis.md)
- Architecture: [`technology/architecture.md`](technology/architecture.md)
- Verification matrix: [`technology/verification.md`](technology/verification.md)
- Threat model: [`technology/threat-model.md`](technology/threat-model.md)
- Roadmap: [`../PLAN.md`](../PLAN.md)
- Demo video: <https://www.youtube.com/watch?v=1J21DoN9PuI>
- Submitted BUIDL: <https://dorahacks.io/buidl/47777>

## Coston2 public identifiers

| Component | Address / identifier |
|---|---|
| PayGuardPolicyRegistryV2 | `0xbB89d68Efd3994CD688816c175343511bA5c0E88` |
| V2 PayGuardVault | `0xe8f5b30F9adCea6b8532bFbD65f804E771520214` |
| V2 PayGuardActionRouter | `0x452988f04bE9602EC0CEB0239EBA5Fe60d8988D3` |
| V1 rollback namespace | Registry `0x8DFb…D4A4`; vault `0xFFe7…84dB`; router `0x28A9…a7Da` |
| FCC foundation sender extension | `66037` |
| FCC three-machine dispatcher | `0x18Ea713cEf10ECf5cAC23c08dD25Ac17D2f07e3d` |
| Active simulated FCC machines | A `0x1C911D007f8203484eD4099bC11849d7e9691044`; B `0xff49A99535b8c52345D3c0b76bCf60194De7C29b`; D `0xd871bc2044a75e8cc2CF06aCdeaDC4CBbEef349A` |

The exact deployment transactions, blocks, runtime hashes, constructor/wiring
assertions, machine registration/status, replacement transactions, and live
lifecycle observations are in sanitized repository evidence. The current
hosted public index mirrors those reviewed Railway records, including one
end-to-end UI-compatible relay lifecycle. The historical interactive actor path
is separate and must not be reassigned to the registered machines.
Extension and machine facts remain simulated/testnet observations, not a
hardware-backed release.

## New work and provenance

XRP PayGuard's product model, private/public schema, deterministic codecs,
contracts, FCC policy extension, relay, Flare/XRPL adapters, web experience,
deployment checks, evidence validators, and documentation were built in this
repository. The official FCC scaffold is digest-pinned and used according to
its documented boundary. VeilBid was read-only: its secrets, deployments,
evidence, signatures, extension IDs, and machine identities were not copied.
The complete retrospective new-work classification is in
[`new-work-ledger.md`](new-work-ledger.md). Detailed adaptation provenance is in
[`technology/reuse-inventory.md`](technology/reuse-inventory.md).

## Honest limitations

- Stable A/B/D HTTPS origins, authenticated indexer access, registered
  simulated-machine custody, and signed live results are verified on Coston2.
  No hardware-backed independent machine set or verified release has been produced.
- No live supported Web2Json source, request/proof, private policy evaluation,
  source-truth guarantee, or canonical Web2 consumer has been verified.
- The current Vercel build supports the hosted V2 simulated candidate path. It uses
  registered simulated machines but provides no hardware confidentiality,
  independent operators, permissionless dispatcher, or verified release.
  The older isolated three-actor lifecycle is historical evidence only.
- No verified PayGuard release manifest, external audit, mainnet integration,
  user interview, pilot, revenue, partnership, or traction claim exists.
- On 2026-08-13 the owner confirmed testing every implemented
  submission-boundary surface and flow, and all passed to the owner's
  satisfaction. This is founder acceptance, not independent user validation.
- Ordinary XRP/FXRP transfers expose amount, recipient, timing, and transaction
  graph. PayGuard is not private money or a mixer.

## Roadmap

After the hackathon: replace the simulated A/B/D set with independently operated
hardware-backed FCC machines; finish proxy/RPC/FDC/FTSO/
indexer outage drills and canonical partial/default redemption; promote the
hosted relay and web to the exact verified release; commission independent contract/FCC
reviews; then run a bounded design-partner testnet pilot. Mainnet requires fresh
address resolution, a new audited candidate, disposable canary, strict value
caps, incident coverage, and a verified release manifest.

## Final submission checklist

- [x] Project, bounty, product description, and target user drafted.
- [x] Demo/application, repository, technical docs, Coston2 identifiers, and
  roadmap links prepared.
- [x] Flare integration, new work, provenance, and limitations drafted.
- [x] Recheck the public event page for the exact deadline, published package,
  track direction, existing-project policy, and public form state.
- [x] Owner confirmed the enabled final form/account/bounty selection and
  submitted BUIDL 47777 to Interoperable Asset Products on 2026-08-14.
- [x] Record and locally validate a captioned production demo without showing
  `.env.local`, credentials, keys, raw signatures, or private policy material.
- [x] Complete owner acceptance across every implemented submission-boundary
  surface and flow; all passed to the owner's satisfaction on 2026-08-13.
- [x] Owner-review and accept the final local demo video.
- [x] Upload the demo video and add its public YouTube URL.
- [x] Keep structured external validation as a disclosed post-hackathon target;
  do not relabel owner acceptance or informal feedback as participant evidence.
- [x] Submit from the owner's account and retain the public BUIDL 47777 URL.
