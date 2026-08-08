# FCC extension

The Go module contains the PayGuard-specific deterministic protocol codec in
`internal/protocol` and a local ciphertext-only custody/evaluation path in
`internal/ingress`. It matches the TypeScript `POLICY_SCHEMA_V1`, receipt,
request, and evaluation golden vector, signs receipts/results with ephemeral
machine keys in tests, and fails closed on replay/domain/threshold errors.
Local replacement tests prove that a new machine set can custody only a new
policy version: replacement machines cannot evaluate an old commitment, old
machines cannot evaluate the replacement commitment, and loss of the old
threshold is not repaired by an unrelated available set.
Production sealed custody through the registered FCC scaffold and Coston2
machine registration remain planned until the machine prerequisites are
available.

Do not copy the VeilBid extension wholesale or reuse its extension ID, code hash,
machine identities, sealed data, or deployment evidence.
