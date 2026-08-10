# User-validation protocol (planned)

This protocol prepares, but does not claim completion of, PayGuard user
validation. As of 2026-08-10 there are no qualifying sessions in this
repository, so the release-candidate blocker remains open.

## Participants and consent

Recruit at least five XRPL-native prospective personal users, five prospective
treasury/DAO policy users, and five prospective payment recipients or
executors: at least 15 qualifying sessions across the three required cohorts.
Obtain informed consent before observation. Keep consent records, participant
contact details, recordings, and raw notes in access-controlled research
storage outside this repository. Assign random research identifiers; do not use
wallet addresses as participant identifiers.

Never ask a participant to provide an XRPL seed, EVM key, production wallet,
private policy, FCC credential, or real funds. Use an isolated test account and
an explicitly non-release environment until a verified Coston2 release exists.

## Moderated tasks

Each participant attempts the same six tasks without coaching on the intended
answer:

1. Create a policy and explain why three machine receipts are required before
   freeze.
2. Identify which request fields are public and confirm that policy content is
   not public.
3. Submit an allowed request and trace its public state.
4. Interpret a denied or dependency-unavailable request and explain why it did
   not execute.
5. Stop, resume, and revoke a policy while distinguishing policy-owner actions
   from global emergency pause.
6. Trace settlement through an official FAssets redemption request to either a
   validated XRPL payout or the canonical default path.

Record completion, time on task, observed errors, and comprehension checks.
Do not record policy text, ciphertext, credentials, signatures, or sensitive
free-form participant details.

## Acceptance and reporting

The study is complete only when every cohort minimum is met, every task was
attempted by every participant, and findings have an owner and disposition.
Aggregate comprehension rates for the privacy boundary, fail-closed behavior,
and redemption semantics. A low result is valid research evidence; it must not
be hidden or converted into a pass.

Only the anonymized aggregate shape is eligible for public evidence. Start
from [`user-validation-aggregate.template.json`](user-validation-aggregate.template.json)
in private research storage and validate the completed aggregate with:

```sh
pnpm candidate:user-validation:verify -- /absolute/path/to/aggregate-report.json
```

Passing the validator checks structure and privacy boundaries; it does not
prove the sessions occurred. The release operator must independently verify
consent, provenance, and study conduct before promotion.
