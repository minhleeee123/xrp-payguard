# XRP PayGuard SDK examples

These compile-tested examples show the public integration boundary for an XRPL
wallet and a Flare dApp. They are intentionally `private` workspace code while
PayGuard has no verified release manifest.

- `prepareXrplWalletFdcPreview` consumes only a public XRPL transaction ID and
  EVM proof owner. It prepares an FDC request but does not accept a seed,
  authenticate to a verifier, derive a MIC, submit, or retrieve a proof.
- `prepareFlareSmartAccountPreview` encodes the public `0xFE` Smart Account
  instruction. It does not accept a private key, sign, broadcast, or make a
  policy decision.

Every successful return value carries an explicit incomplete state and the
next required gate. Invalid public input throws before any side effect.

Run the examples' checks with:

```sh
pnpm --filter @xrp-payguard/sdk-examples typecheck
pnpm --filter @xrp-payguard/sdk-examples test
```

See [`../../docs/integration-guide.md`](../../docs/integration-guide.md) for
the complete boundary and adoption checklist.
