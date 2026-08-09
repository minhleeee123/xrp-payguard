# Privacy-preserving observability

## Implemented local boundary

The relay includes aggregate Prometheus telemetry with a closed label set. The
metrics endpoint is disabled by default and requires a runtime-only bearer
token when enabled. It reports only process-wide counters and active evaluation
count. No API permits dynamic labels, log attributes, or request payloads.

Allowed metrics are aggregate threshold/split/unavailable/error outcomes,
pre-dispatch invalid/capacity rejections, valid/failed machine-result counts,
coalesced work, and submission success/error/not-ready counts.

Forbidden telemetry includes policy plaintext or ciphertext, policy-derived
descriptions, `ALLOW`/`DENY`, request/policy/account/machine identifiers,
addresses, hashes, endpoints, signatures, credentials, transaction-specific
timing, and request bodies. Tests assert that rendered metrics contain none of
these values and that the bearer token never appears in health, errors, or the
metrics body.

## Production gate

The local implementation is not deployed monitoring evidence. A production
release must additionally keep `/metrics` on an operator-only network path,
source its credential from a managed runtime secret, terminate authenticated
transport, restrict scraper and dashboard access, define aggregate retention,
and verify proxy/access/application logs are bodyless and credential-free.

Alerts may indicate capacity, aggregate unavailability, split outcomes, or
submission errors. They must link to public-safe runbooks and canonical chain
checkpoints rather than copying private requests into tickets or chat systems.
Observability never authorizes an action or substitutes for FCC/FDC/FTSO/FAssets
verification. Missing monitoring fails operational readiness, not policy rules.
