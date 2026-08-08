# Generated bindings

The TypeScript bindings are generated only from the local Foundry artifacts in
`packages/contracts/out`; VeilBid artifacts and deployment files are never a
source. Regenerate after a contract build:

```sh
PATH="$PWD/.local/toolchains/bin:$PATH" forge build --root packages/contracts
pnpm bindings:generate
```

These are ABI bindings, not a deployment claim. Contract addresses and live
runtime bytecode remain absent until a verified Coston2 release manifest.
