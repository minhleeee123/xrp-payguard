# Production monitoring and incident runbook

## Scope

This runbook covers the independent monitor for the active Coston2
`COSTON2_SIMULATED_V2` candidate. It observes the Railway relay, public Coston2
RPC, and registered A/B/D machine origins. It does not authorize requests,
handle private policy material, or prove hardware attestation.

The public `/healthz` route contains only aggregate readiness. Operator-only
`/metrics`, `/v1/status`, and `/v1/incidents` require a Railway-managed bearer
token over HTTPS. Rotate that token through Railway runtime variables; never
place it in source, evidence, shell output, tickets, or chat.

Live testnet monitor: <https://payguard-monitor-production.up.railway.app>.
Only `/healthz` is readable without credentials, and browser CORS is restricted
to the production PayGuard origin. The reviewed deployment observation is
[`production-monitoring.json`](../../evidence/coston2/production-monitoring.json).

## Alert classes

| Alert | Severity | Meaning | Immediate action |
| --- | --- | --- | --- |
| `relay-unavailable` | critical | The active V2 relay did not pass its exact health/profile boundary | Stop operator writes; verify Railway deployment and Coston2 RPC before retrying |
| `rpc-unavailable` | critical | Chain ID/readiness probe failed | Keep evaluation/execution unavailable; check official Coston2 RPC and do not substitute cached state |
| `fcc-quorum-unavailable` | critical | Fewer than two registered origins respond | Do not evaluate or execute; preserve the frozen machine set and follow supported replacement for new policies |
| `fcc-custody-set-degraded` | warning | Two of three machines respond | Existing result quorum may remain possible, but do not activate a new policy without all-three custody |

## Response procedure

1. Confirm the alert through the authenticated status endpoint and Railway
   deployment state. Never paste its bearer token into logs or evidence.
2. Read canonical Coston2 state before taking action. A UI, relay cache, or
   monitor sample is not rollback/replay authority.
3. For relay/RPC failure, leave writes unavailable until exact V2 config and all
   dependency checks recover.
4. For one FCC failure, preserve existing frozen identities. A replacement may
   serve only a newly frozen policy after normal registration/attestation.
5. For two or three FCC failures, no result threshold exists. Deny/unavailable
   is correct; never restore or inject an unsupported TEE identity.
6. Record only start/recovery time, fixed alert kind, public transaction/block
   checkpoint when applicable, and assertion booleans.
7. After recovery, rerun config/health, public evidence, privacy, and relevant
   live-gate verification. Close the incident only when canonical state and
   service health agree.

## Retention and access

The monitor keeps at most 1,440 aggregate samples and 128 fixed-shape incident
transitions in process memory. Restart clears them. Railway access is restricted
to project operators; detailed routes require the separate runtime bearer.
No request, policy, account, machine identity, address, hash, endpoint,
signature, decision, credential, or request-specific timing is retained.

This bounded operational record is not a security audit, hardware release, SLA,
or mainnet-readiness claim.
