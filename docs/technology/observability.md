# Privacy-preserving observability

## Implemented telemetry boundary

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

## Deployed Coston2 monitoring boundary

An independent Railway monitor is deployed at
<https://payguard-monitor-production.up.railway.app> from source
`b8512decc0b77acb3669a4d45804a5d07ba3ae03`, deployment
`89ff04bb-3bbb-4248-acc0-1f2254c66c81`. The reviewed record in
[`../../evidence/coston2/production-monitoring.json`](../../evidence/coston2/production-monitoring.json)
verifies five aggregate dependency probes for the relay, Coston2 RPC, and
active A/B/D machine set; origin-bound public health; managed bearer protection
for metrics/status/incidents; 1,440-sample and 128-incident retention bounds;
fixed alerts; and credential-free runtime-log checks. The observed snapshot had
all five dependencies ready and zero active alerts.

This closes the hackathon deployment-monitoring row for the simulated Coston2
candidate. It is not an SLA, dependency-outage drill, security audit, hardware
attestation, verified release, or mainnet-readiness claim. A production release
must still review operator-network isolation, scraper/dashboard access,
longer-lived log behavior, and release-bound incident operation.

Alerts may indicate capacity, aggregate unavailability, split outcomes, or
submission errors. They must link to public-safe runbooks and canonical chain
checkpoints rather than copying private requests into tickets or chat systems.
Observability never authorizes an action or substitutes for FCC/FDC/FTSO/FAssets
verification. Missing monitoring fails operational readiness, not policy rules.
