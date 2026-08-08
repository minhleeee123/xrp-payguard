# FCC extension

The Go module contains the PayGuard-specific deterministic protocol codec in
`internal/protocol` and a local ciphertext-only custody/evaluation path in
`internal/ingress`. It matches the TypeScript `POLICY_SCHEMA_V1`, receipt,
request, and evaluation golden vector, signs receipts/results with ephemeral
machine keys in tests, and fails closed on replay/domain/threshold errors. The
same fixture now covers the pinned tee-node `v0.0.24` sign-port convention:
purpose-separated ABI message, Coston2 chain ID, Keccak-256, and the Ethereum
signed-message wrapper. A bounded loopback-only sign-port client verifies the
echoed message, canonical signature, and configured TEE identity.
The production entrypoint discovers the fresh TEE identity rather than loading
an application key, fails closed unless both `/sign` and `/decrypt` are ready,
and ECIES-decrypts the strict private policy wire only through loopback. Policy
plaintext bytes are cleared after parsing. The internal port `7703` accepts only
canonical, bounded, machine-specific ciphertext requests authorized by the
policy owner's Ethereum signed-message signature over the full public binding.
It returns a receipt only; the former unauthenticated coordinator HTTP surface
is not present. A stable TLS proxy/origin, proxy rate limits, and sealed restart
recovery remain live gates; this adapter alone is not custody evidence.
The public Go/TypeScript HTTP boundary uses lower-camel field names, named
decision/reason enums, and quoted unsigned decimal strings for every bigint or
`uint64`; numeric JSON bigints and unknown enums are rejected before hashing.
Local replacement tests prove that a new machine set can custody only a new
policy version: replacement machines cannot evaluate an old commitment, old
machines cannot evaluate the replacement commitment, and loss of the old
threshold is not repaired by an unrelated available set.
Production sealed custody through the registered FCC scaffold and Coston2
machine registration remain planned until the machine prerequisites are
available.

`PING_V1` is a separate public-safe foundation path. Its Solidity sender
constructs a canonical ABI tuple bound to Coston2, the exact sender and
registry-assigned extension ID, `0.1.0-payguard`, a nonce, and a payload hash.
The handler returns those fields plus the shared binding hash. This local path
cannot evaluate a policy or authorize payment, and it is not live FCC evidence.

`internal/admission` and `cmd/machine-preflight` provide the read-only gate for
a future production machine. They verify the pinned Google Confidential Space
PKI token and workload claims, FCC machine/proxy signature domains, Coston2,
extension `66037`, owner, image ID, platform, governance, and freshness. The
client accepts only a public HTTPS origin and emits no raw token or signature.
Run it through `pnpm fcc:machine:preflight`; passing it does not replace the
official code-version, FDC promotion, registry, or live-result gates.

## Container gates

From the repository root:

```bash
pnpm fcc:image:repro
pnpm fcc:container:smoke
```

The first command requires two byte-identical no-cache `linux/amd64` builds.
The second starts three disposable simulated machines, verifies distinct fresh
identities and container hardening, exercises fail-closed malformed ingress,
checks identity rotation on restart, then removes all test resources. The image
defaults to production attestation; only `compose.local.yaml` opts into
simulation. See `docs/technology/fcc-container-build.md` for the exact boundary.

Do not copy the VeilBid extension wholesale or reuse its extension ID, code hash,
machine identities, sealed data, or deployment evidence.
