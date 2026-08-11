# Competition requirements and submission truth

## 1. Authority and freshness

The owner-supplied Summer Signal materials are copied under
[`reference/original/`](reference/original/). Their project dates, prize values,
submission fields, and organizer links are preserved as supplied, but must be
reconfirmed with the organizer before any submission. This document converts
the supplied brief into PayGuard engineering gates; it does not assert that an
old date or prize remains current.

On 2026-08-09, the server-rendered public
[DoraHacks event](https://dorahacks.io/hackathon/flaresummersignal) identified
the event as virtual, published a `$12,000` total prize pool, and exposed
`2026-08-14T19:59:00Z` as its JSON-LD end time. It listed two `$6,000` tracks:
Interoperable Asset Products and Confidential Compute Apps, each with `$4,000`
first and `$2,000` second place prizes. The public requirements request the
project name, selected bounty or bounties, product and target-user summaries,
a demo/video/application link, repository or technical material, Flare usage,
a new/ported/integrated/improved-work explanation, applicable deployment facts,
and a short roadmap.

The same 2026-08-09 public payload says existing projects are welcome, multiple
tracks are allowed, and XRP/FXRP/FAssets are priority directions for the
interoperable asset track. It also reports that the public submission and
registration forms were disabled at that check. Those fields are a dated
public-page observation, not proof that the owner's account is eligible, that a
final form will expose identical fields, that PayGuard has been accepted into a
bounty, or that any organizer FCC capacity was granted. Final account/form/
selection checks therefore remain an owner-session Gate 0 item.

The [official FCC overview](https://dev.flare.network/fcc/overview), fetched on
the same date, states that FCC is in the final stages of development and is not
yet a fully public production system. That reinforces the solution-3 boundary;
it does not turn the local simulated FCC path into a live confidential-compute
submission.

## 2. Target bounty strategy

The owner confirmed **Interoperable Asset Products** as PayGuard's selected
hackathon track on 2026-08-09. This records the project decision only; it does
not prove account eligibility, an enabled or submitted form, organizer
acceptance, bounty selection receipt, or an award.

### Interoperable Asset Products — evidence-backed submission target

This is the primary hackathon target under solution 3. PayGuard has its own
sanitized Coston2 evidence for one validated XRPL Testnet Payment, finalized
FDC `XRPPayment` proof and on-chain verification, Smart Account direct mint
into the PayGuard vault, plus public FAssets redemption observations. The
submission must preserve each evidence file's limitations: these facts do not
prove a private-policy authorization or complete release.

The public track text explicitly prioritizes XRP/FXRP/FAssets and names payment
flows, asset-management experiences, and products that make interoperable
assets useful in real applications. This is evidence that PayGuard fits the
published direction, not a final eligibility or award determination.

### Confidential Compute Apps — post-hackathon live gate

PayGuard qualifies only when a registered FCC extension privately stores and
evaluates the canonical payment policy in the real authorization path. A public
smart contract limit plus a decorative TEE call is not sufficient.

Required evidence:

- registered extension, exact code/image version, and machine identities;
- private ingress and machine-signed policy receipts;
- deterministic policy evaluation inside FCC;
- threshold result verification on-chain;
- denial/replay/domain/recovery tests;
- no private policy/ciphertext in public artifacts.

The live Coston2 path now uses three stable registered `SIMULATED_TEE` Railway
machines and independently verifies all-three custody plus a two-of-three
evaluation/execute/deny lifecycle. It is stronger than a local simulation, but
does not satisfy hardware-attestation or verified-release requirements. A live
C→D loss/re-registration/new-policy drill now passes without swapping a frozen
identity; the same live path also remains pending with unchanged vault
accounting during a measured full executor pause, then resumes successfully.
Do not describe the Confidential Compute Apps bounty as
production-complete unless the remaining hardware, V2, full-outage, and release
gates pass.

### Current hackathon delivery boundary

The frozen 2026-08-09 delivery and its evidence remain a credential-free local/
isolated three-machine simulated FCC demo. The current Vercel artifact now also
connects to the hosted Railway relay and registered A/B/D Coston2 machines; a
separate sanitized lifecycle records custody, request-ID-only quorum evaluation,
execution, denial, governance, and conservation. Neither artifact is a
hardware-backed or verified V2 release.

The submission must say `SIMULATED`, `PLANNED`, or `NOT VERIFIED` wherever
hardware TEE confidentiality, V2 release, verified-release promotion, recovery, or
a complete production release would otherwise be implied. Stable FCC servers,
authenticated indexer access, registered simulated custody, and threshold
evaluation are now verified repository facts; they must not be inflated into a
hardware or mainnet claim.

## 3. Expected submission package

- Product name and one-sentence problem/solution.
- Target users and real validation notes.
- Selected bounty or bounties with evidence-backed rationale.
- Public Vercel application/evidence path plus clearly separated Coston2 facts
  and local simulated FCC demo.
- Demo video showing one uninterrupted flagship lifecycle.
- Public repository, setup instructions, architecture, contract/extension facts,
  threat model, verification guide, and roadmap.
- New-work ledger separating copied reference material, adapted utilities, and
  new PayGuard work.
- Independently checked Coston2 testnet contract addresses, transactions,
  blocks, and source commit, explicitly classified as observations rather than
  a verified release; any extension, code/image, machine-policy, or release
  field remains unavailable until its live gate passes.
- Honest limitations, residual trust, testnet status, and next steps.

## 4. Judging gates

### Product usefulness

The private policy must address a validated payment-control problem for an XRPL
user or treasury. A protocol-only dashboard fails this gate.

### Flare integration quality

FCC decides authorization; FDC verifies an external fact; Smart Accounts make
XRPL-native control usable; FAssets provide the XRP-backed asset lifecycle;
FTSO enforces a documented reference-value rule. Each component must be
necessary in the same journey.

### Technical execution

The deployed path must work without mocks, secret leakage, client-supplied
authorization, manual chain-state edits, or unsupported identity restoration.

### Evidence of new work

Every reused or adapted item is recorded. VeilBid artifacts remain historical
references and never become PayGuard evidence by renaming.

### Clarity and future potential

The demo must explain what is public, what remains inside FCC, why the action
was allowed or denied, and how to recover. The roadmap must distinguish shipped
facts from planned audit, mainnet, operator, and product work.

## 5. Pre-submission validation targets

Before submission, target at least:

- five XRPL-user interviews;
- five treasury/DAO interviews;
- five recipient/executor usability sessions;
- one design-partner testnet pilot;
- documented organizer/community technical feedback.

Never invent usage, acquisition, partnership, security, or production claims.
If these sessions have not occurred, retain the explicit zero-session
disclosure and leave the validation gate open. Repository tests cannot replace
participant evidence.
