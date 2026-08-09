# Competition requirements and submission truth

## 1. Authority and freshness

The owner-supplied Summer Signal materials are copied under
[`reference/original/`](reference/original/). Their project dates, prize values,
submission fields, and organizer links are preserved as supplied, but must be
reconfirmed with the organizer before any submission. This document converts
the supplied brief into PayGuard engineering gates; it does not assert that an
old date or prize remains current.

## 2. Target bounty strategy

### Confidential Compute Apps — primary target

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

### Interoperable Asset Products — conditional secondary target

Select this bounty only after a real XRP-native journey is essential to the
product: XRPL Payment, FDC proof, Smart Account execution, FAssets mint/funding,
PayGuard vault/action, and supported redemption. Address display or an unused
FAssets call does not qualify.

### Current hackathon delivery boundary

The 2026-08-09 delivery decision uses the credential-free local
three-machine simulated FCC stack for the hackathon demo. Public Coston2
contracts, XRP/FDC/Smart Account funding observations, the Vercel shell, and
the public-safe evidence mirror remain real testnet/public artifacts. The FCC
custody/evaluation segment remains a local deterministic simulation.

The submission must therefore say `LOCAL`, `SIMULATED`, `PLANNED`, or
`NOT VERIFIED` wherever a registered machine, TEE confidentiality, signed live
FCC result, hosted relay/proxy, or complete release would otherwise be implied.
It must not claim that the current artifact has passed the Confidential Compute
Apps live-authorization gate. Stable FCC servers, authenticated indexer access,
production registration, and the complete hosted lifecycle are post-hackathon
roadmap work.

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
- Verified contract addresses, transactions, blocks, and source commit; any
  extension, code/image, machine-policy, or release field remains explicitly
  unavailable until its live gate passes.
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

## 5. Distribution evidence

Before submission, target at least:

- five XRPL-user interviews;
- five treasury/DAO interviews;
- five recipient/executor usability sessions;
- one design-partner testnet pilot;
- documented organizer/community technical feedback.

Never invent usage, acquisition, partnership, security, or production claims.
