# PayGuard reuse ledger

Status: current local adaptation record; no FCC deployment claim.

The official Flare FCE scaffold was inspected read-only at commit
`ffb6c4ca7c160c49be59e00fe537e24d2477b000`.

Adapted patterns:

- `POST /action`/`GET /state` wire routing and `DataFixed` decoding follow the
  scaffold's documented container contract and official Go imports.
- `cmd/docker` starts the pinned `tee-node` extension server using the official
  `StartServerExtension` entry point.
- Browser encryption follows the interoperable ECIES construction reviewed in
  VeilBid commit `fcc61b731ddb1a2818fa447ad797c328fd8f5cfe`, under its MIT license.
  The PayGuard implementation has a different plaintext schema and ingress
  authorization domain, bounds ciphertext to 64 KiB, wipes transient key/plaintext
  buffers, and is independently checked by a TypeScript ciphertext that the
  Go/tee-node primitive decrypts.
- PayGuard handlers, command names, state, policy ingress, receipt/result
  domains, and tests are new code under this repository.

Nothing from either source's keys, `.env` values, extension IDs, machine IDs,
deployment addresses, evidence, ciphertext, or sealed state was copied. The
production command now refuses to start until it discovers the fresh tee-node
identity and both loopback sign/decrypt operations are usable. Its per-machine
ingress requires the policy owner's canonical signature over the complete
binding and ciphertext domain. Registered FCC machines and a live Coston2
`PING_V1`/`EVALUATE_V1` result remain planned until new PayGuard infrastructure
is available.
