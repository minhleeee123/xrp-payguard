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
HTTP boundary and never logged. BigInt public fields use decimal JSON strings.
`GET /healthz` is public-safe.

The live FCC action-container transport, FDC checkpoint worker, and Coston2
router client remain integration work until official endpoints and a verified
PayGuard release manifest exist. Local tests cover threshold, outage, split,
signature, duplicate-identity, timeout, and private-output behavior.
