# Release manifests

`coston2.release.json` is intentionally absent until PayGuard contracts, FCC
extension/machines, runtime bytecode, signer mapping, and sanitized evidence
are verified together. `pnpm release:check` reports `planned` while it is
absent. Reference addresses, bootstrap funding, and local artifacts are not a
release manifest.

`candidates/coston2-v2.plan.json` is the non-authoritative V2 preparation plan.
It is deliberately `planned`, `verified: false`, and lists every live blocker.
`pnpm candidate:build` creates only an ignored local build record; neither that
record nor the plan may be copied to the authoritative manifest path. Release
acceptance remains defined in the
[verification plan](../docs/technology/verification.md#5-release-acceptance).
