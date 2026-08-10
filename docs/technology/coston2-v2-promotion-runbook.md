# Coston2 V2 release-candidate promotion runbook (planned)

This runbook prepares a future `PayGuardPolicyRegistryV2` Coston2 release. It
does not authorize deployment, register FCC machines, submit transactions, or
create a verified release manifest. The tracked candidate plan remains
`planned` and every live dependency remains `blocked` until independently
observed.

## Two artifacts that must never be confused

- `releases/candidates/coston2-v2.plan.json` is a checked-in preparation plan.
  It contains no deployment fact and must always have `verified: false`.
- `releases/coston2.release.json` is the future authoritative manifest. It must
  remain absent until every gate below passes against one clean source commit.

`pnpm candidate:build` compiles V2 and writes an ignored local build record at
`.local/release-candidate/coston2-v2.build.json`. That record contains source
and bytecode digests, but it is not deployable evidence and is never promoted.

## Gate A — freeze the candidate

1. Use the pinned Node, pnpm, Go, Foundry, Solidity, and dependency versions.
2. Start from a reviewed clean commit; run `pnpm candidate:build`.
3. Run `pnpm check`, workspace typechecks, the web production build, all Go
   tests, the full Forge suite, and the disposable three-machine smoke check.
4. Review V2 constructor values, owner/admin boundaries, manager lookup, code
   binding, machine/signature mapping, and result-time manager recheck.
5. Compare generated bindings and local digests. A dirty-tree local record may
   aid development but may not be the source of a release.

## Gate B — obtain external FCC authority

Resolve the official Coston2 TeeManager through a supported Flare source and
record its source digest. Obtain three real, distinct, non-simulated FCC
machines running the exact reviewed extension/code hash. For each machine,
verify production status, supported platform, non-disabled state, initial TEE
identity, proxy mapping, TEE signer, key fingerprint, and credential-free HTTPS
origin directly against the official manager.

Private ingress must return a machine-signed receipt before freeze. All three
machines must durably retain the encrypted policy. Credentials, policy content,
ciphertext, signatures, and machine keys stay outside source and evidence.

## Gate C — deploy and independently re-observe

Use the existing plan commands before any broadcast. Broadcasting requires the
release owner to supply keys through ignored local environment files and give
the explicit broadcast flags already enforced by the deployment tools.

After deployment, independently read chain ID, runtime bytecode, constructor
bindings, ownership, pause state, router/vault/registry wiring, TeeManager
binding, extension ID, code hash, machine state, and signer mapping. Record
public addresses, hashes, blocks, transaction IDs, booleans, and timings only.
A locally compiled or copied reference address is not verification.

## Gate D — canonical live evidence

Collect candidate evidence first in an ignored, access-controlled operator
workspace. These validators are read-only and do not broadcast:

```sh
pnpm candidate:lifecycle:plan
pnpm candidate:lifecycle:verify -- /absolute/path/to/lifecycle.json
pnpm candidate:outage:plan
pnpm candidate:outage:verify -- /absolute/path/to/outage-drills.json
pnpm candidate:redemption:plan
pnpm candidate:redemption:verify -- /absolute/path/to/redemption.json
pnpm candidate:user-validation:plan
pnpm candidate:user-validation:verify -- /absolute/path/to/user-validation.json
```

The lifecycle binds funding, all-three custody, ALLOW, DENY, policy-owner
stop/resume/revoke, and separately verified redemption to the same release and
policy. The outage suite exercises every required dependency and FCC identity
failure without mock success. Redemption uses an official FAssets redemption
request and reconciles either the XRPL payout or canonical default path. A
normal token transfer is not redemption.

The user study follows
[`../product/user-validation-protocol.md`](../product/user-validation-protocol.md).
Validator success checks the public aggregate shape; independent human review
must still confirm consent and provenance.

## Gate E — promotion review

Two reviewers, including one who did not operate the deployment, compare every
artifact to the same clean source commit and live network. They confirm:

- timestamps and checkpoints are internally consistent;
- runtime and generated bindings match reviewed source;
- FCC identities remain registered at freeze and result submission;
- custody is 3-of-3 and matching evaluation is 2-of-3;
- owner-only lifecycle and bounded global pause were exercised;
- replay, expiry, nonce, attempt, domain, recovery, and conservation pass;
- no secret, policy, ciphertext, signature, credential, or personal research
  data is present; and
- no step used simulated FCC, mock price/proof/payment/approval/execution, or a
  copied address as live success.

Only then create `releases/coston2.release.json` from independently observed
facts and run `pnpm release:check`. Do not copy or rename the candidate plan.
Sanitized evidence enters `evidence/coston2/` only after its validator and the
privacy/secret scans pass.

## Abort, rollback, and recovery

Before promotion, any mismatch aborts the release and leaves the authoritative
manifest absent. After deployment, use owner stop/revoke per policy and bounded
admin pause only for a global emergency. Never restore an unsupported FCC
identity after restart. Re-resolve manager state, rerun the affected drill, and
create a new candidate if source, runtime, code, identity, or binding changes.

A revoked or superseded release remains in historical evidence with its status;
history is not rewritten. No rollback may invent approval or replace on-chain
nonce/state authority with an off-chain snapshot.
