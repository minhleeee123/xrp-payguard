# PayGuard reuse ledger

Status: current local adaptation record; no FCC deployment claim.

The official Flare FCE scaffold was inspected read-only at commit
`ffb6c4ca7c160c49be59e00fe537e24d2477b000`.

Adapted patterns:

- `POST /action`/`GET /state` wire routing and `DataFixed` decoding follow the
  scaffold's documented container contract and official Go imports.
- `cmd/docker` starts the pinned `tee-node` extension server using the official
  `StartServerExtension` entry point.
- PayGuard handlers, command names, state, policy ingress, receipt/result
  domains, and tests are new code under this repository.

Nothing from the scaffold's keys, `.env` values, extension IDs, machine IDs,
deployment addresses, evidence, or sealed state was copied. The local command
starts without a machine and therefore returns an unavailable evaluation; it
never manufactures approval. Registered FCC machines and a live Coston2
`PING_V1`/`EVALUATE_V1` result remain planned until external infrastructure is
available.
