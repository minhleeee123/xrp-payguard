# PayGuard Coston2 release manifest

`releases/coston2.release.json` is authoritative only when it is a verified
PayGuard release. Until then, the repository must keep the file absent and the
release check reports `planned`. A candidate may be kept outside that path with
`verified: false`; it must never drive browser, relay, ingress, or write flows.

The verified manifest must contain:

- `status: "verified"`, `verified: true`, `network.name: "flare-coston2"`, and
  `network.chainId: 114`;
- a 40-hex `sourceCommit` and at least the three non-upgradeable PayGuard
  contracts, each with a non-zero address, runtime bytecode hash, deployment
  block, and deployment transaction hash;
- `fcc.extensionId`, `fcc.codeVersion`, exactly three distinct machine IDs,
  key fingerprints, and signer addresses, each with a credential-free HTTPS
  origin; custody is `3-of-3` and evaluation is `2-of-3`;
- a generated-binding digest under `bindings.digest`;
- `evidence.publicOnly: true` and boolean-only `evidence.assertions`.

The checker rejects private keys, seeds, ciphertext, policy plaintext,
credentials, bearer tokens, credential-bearing machine URLs, wrong networks,
weak quorums, duplicate machine identities, missing runtime hashes, and
non-public evidence. The manifest records only public addresses, hashes,
blocks, transaction IDs, machine fingerprints, timings, and assertion booleans.
