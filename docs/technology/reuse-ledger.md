# PayGuard reuse ledger

Status: current adaptation record. Deployment facts come only from PayGuard's
separate sanitized Coston2 evidence, never from the referenced scaffold or
VeilBid.

The official Flare FCE scaffold was inspected read-only at commit
`ffb6c4ca7c160c49be59e00fe537e24d2477b000`.

Adapted patterns:

- `POST /action`/`GET /state` wire routing and `DataFixed` decoding follow the
  scaffold's documented container contract and official Go imports.
- `cmd/docker` starts the pinned `tee-node` extension server using the official
  `StartServerExtension` entry point.
- The official scaffold image/compose layout was used as a pattern, then reduced
  to PayGuard's static binary and private-ingress boundary. All frontend/base
  images are pinned by `linux/amd64` digest, production mode is the image
  default, and new PayGuard scripts verify byte-identical builds plus three
  disposable identities. The pinned scaffold checkout contained no license
  file, so no source file was copied wholesale.
- Browser encryption follows the interoperable ECIES construction reviewed in
  VeilBid commit `fcc61b731ddb1a2818fa447ad797c328fd8f5cfe`, under its MIT license.
  The PayGuard implementation has a different plaintext schema and ingress
  authorization domain, bounds ciphertext to 64 KiB, wipes transient key/plaintext
  buffers, and is independently checked by a TypeScript ciphertext that the
  Go/tee-node primitive decrypts.
- The foundation sender's official `TeeInstructionParams`/registry call shape
  follows the pinned Flare scaffold. Constant-time explicit extension-ID
  binding and typed ABI response patterns were reviewed in read-only VeilBid
  sources at commits `6fbdd18579dad8b6e95815028fd76f6175a4abee`,
  `da757a0c8a6897be8abd3f132b5c73617f768be2`, and
  `b2d23422138c7730e16a104d91842d6c78f40b14` under MIT. PayGuard changes the
  command/domain/schema, binds sender + extension + code, constructs immutable
  fields on-chain, rejects non-canonical Go wire, and has independent Solidity
  and Go tests. No VeilBid deployment fact or secret was reused.
- PayGuard handlers, command names, state, policy ingress, receipt/result
  domains, and tests are new code under this repository.

Nothing from either source's keys, `.env` values, extension IDs, machine IDs,
deployment addresses, evidence, ciphertext, or sealed state was copied. The
production command now refuses to start until it discovers the fresh tee-node
identity and both loopback sign/decrypt operations are usable. Its per-machine
ingress requires the policy owner's canonical signature over the complete
binding and ciphertext domain. New PayGuard-owned A/B/D infrastructure now has
registered simulated machines and live Coston2 `PING_V1`/`EVALUATE_V1`
evidence. Those facts do not originate in either reference source and do not
establish hardware attestation or a verified release.
