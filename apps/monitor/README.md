# Production monitor

Independent Railway service for the active Coston2 V2 simulated candidate. It
polls the relay, public RPC, and registered A/B/D origins, retains at most 1,440
aggregate samples in memory, and emits fixed alert/incident kinds only.

`GET /healthz` is a sanitized public liveness summary. `GET /metrics`,
`GET /v1/status`, and `GET /v1/incidents` require a runtime-only bearer token.
No endpoint accepts writes or exposes policy/request/account/machine identifiers,
addresses, hashes, endpoints, decisions, credentials, or private material.

The service verifies operational availability only. It cannot authorize an
action, prove hardware attestation, or promote a verified PayGuard release.
