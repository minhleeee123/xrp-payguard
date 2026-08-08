# FCC extension

The Go module now contains the PayGuard-specific deterministic protocol codec in
`internal/protocol`. It matches the TypeScript `POLICY_SCHEMA_V1`, receipt,
request, and evaluation golden vector. Sealed custody, private ingress, and FCC
registration remain planned until the pinned official scaffold is adapted and
the Coston2 machine prerequisites are available.

Do not copy the VeilBid extension wholesale or reuse its extension ID, code hash,
machine identities, sealed data, or deployment evidence.
