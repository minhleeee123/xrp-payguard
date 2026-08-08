# FCC extension

The Go module contains the PayGuard-specific deterministic protocol codec in
`internal/protocol` and a local ciphertext-only custody/evaluation path in
`internal/ingress`. It matches the TypeScript `POLICY_SCHEMA_V1`, receipt,
request, and evaluation golden vector, signs receipts/results with ephemeral
machine keys in tests, and fails closed on replay/domain/threshold errors.
Production sealed custody through the registered FCC scaffold and Coston2
machine registration remain planned until the machine prerequisites are
available.

Do not copy the VeilBid extension wholesale or reuse its extension ID, code hash,
machine identities, sealed data, or deployment evidence.
