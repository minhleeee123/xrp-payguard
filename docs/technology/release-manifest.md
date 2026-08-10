# PayGuard Coston2 release manifest

`releases/coston2.release.json` is authoritative only when it is a verified
PayGuard release. Until then, the repository must keep the file absent and the
release check reports `planned`. A candidate may be kept outside that path with
`verified: false`; it must never drive browser, relay, ingress, or write flows.

The checked-in V2 preparation plan is
`releases/candidates/coston2-v2.plan.json`. `pnpm candidate:check` enforces that
it stays non-authoritative, undeployed, unverified, and blocked on every live
input. `pnpm candidate:build` writes source and bytecode digests only to the
ignored `.local/release-candidate/` directory. Neither artifact may be copied
or renamed into `releases/coston2.release.json`; promotion uses independently
observed facts under the
[V2 promotion runbook](coston2-v2-promotion-runbook.md).

The verified manifest must contain:

- `status: "verified"`, `verified: true`, `network.name: "flare-coston2"`, and
  `network.chainId: 114`;
- a 40-hex `sourceCommit` and at least the three non-upgradeable PayGuard
  contracts including `PayGuardPolicyRegistryV2`, each with a non-zero address,
  runtime bytecode hash, deployment block, and deployment transaction hash;
- the official `fcc.teeManager` plus its supported-source digest, exact
  extension and code hash, `registryContract: "PayGuardPolicyRegistryV2"`, and
  `machineAuthorization: "official-manager-live-recheck"`;
- `simulated: false`, `registeredMachinesVerified: true`, and exactly three
  distinct machine IDs, key fingerprints, and signer addresses, each with a
  credential-free HTTPS origin; each machine ID is the left-padded TEE signer
  and each full-key fingerprint ends in that signer address; custody is
  `3-of-3` and evaluation is `2-of-3`;
- a generated-binding digest under `bindings.digest`;
- `evidence.publicOnly: true`, boolean-only `evidence.assertions`, and true
  assertions for official-manager verification, result-time machine recheck,
  owner-only individual policy lifecycle authority, and bounded or renounced
  global-pause governance;
- true assertions and SHA-256-bound public JSON artifacts for the canonical
  live lifecycle, outage drills, canonical redemption, and anonymized user
  validation. `pnpm release:check` re-runs each artifact-specific validator.

The checker rejects private keys, seeds, ciphertext, policy plaintext,
credentials, bearer tokens, credential-bearing machine URLs, wrong networks,
weak quorums, duplicate machine identities, missing runtime hashes, and
non-public evidence. It also rejects V1/local-admin signer authorization,
foreign or unproven manager bindings, simulated machines, and missing
result-time status rechecks. The manifest records only public addresses, hashes,
blocks, transaction IDs, machine fingerprints, timings, and assertion booleans.
