# Relay and executor

The local TypeScript relay is stateless orchestration for public request/state
dispatch and FCC result collection. It validates three frozen machine
descriptors, recomputes the shared evaluation digest, verifies each raw
signature against the registered signer metadata, tolerates one machine outage,
and returns `SPLIT`/`UNAVAILABLE` instead of manufacturing an approval. The
router submitter accepts only signed envelopes; there is no decision override
argument.

`POST /v1/evaluate` accepts public request/state plus three HTTPS machine
origins. Private policy, ciphertext, and policy-rule fields are rejected at the
HTTP boundary and never logged. The server is constructed with one exact
Coston2 registry/vault/router domain; requests outside that binding fail before
machine dispatch. BigInt public fields use decimal JSON strings.

`GET /healthz` returns the immutable public domain plus configured timeout,
concurrency, and rate budgets. It reports machine dependencies as `not-probed`,
so process liveness is never presented as FCC readiness. Evaluation requests
are rate-limited by the direct socket address, machine responses are bounded,
and client-supplied proxy headers are not trusted.

`GET /metrics` is disabled unless the process receives a runtime-only bearer
token of at least 32 characters. When enabled it exposes Prometheus counters
and a gauge with fixed labels only: aggregate evaluation outcomes/rejections,
valid/failed machine-result counts, coalescing, and submission outcomes. It
never exports request/account/machine identifiers, endpoints, decisions,
policy material, ciphertext, credentials, signatures, or per-request timing.
The endpoint must still sit behind operator-only network access in production.

Identical concurrent public evaluation/submission work is coalesced in memory.
That map is only a transient load-control mechanism: it stores no private data,
is cleared on completion, and is not a replay or correctness authority. After a
restart the relay safely reconstructs work from public chain checkpoints.

The live FCC action-container transport, FDC checkpoint worker, and Coston2
router client remain integration work until official endpoints and a verified
PayGuard release manifest exist. Local tests cover threshold, outage, split,
signature, duplicate identity/key/signer, enforced timeout, bounded concurrency,
rate limiting, competing executors, domain binding, and private-output behavior.
