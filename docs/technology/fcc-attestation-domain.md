# FCC attestation signing domain

Status: local cross-language compatibility gate. Registered Coston2 machine
signatures are not yet verified.

## Pinned source behavior

PayGuard targets the official `flare-foundation/tee-node` `v0.0.24` sign-port
behavior pinned by the FCC scaffold. Its `POST /sign` endpoint accepts a Go
`[]byte` JSON field, hashes the decoded message with Keccak-256, and signs the
hash with the TEE identity using the Ethereum signed-message wrapper. The
extension must use the loopback-only sign port; it must never expose that port
or accept a remote replacement endpoint.

The exact PayGuard message is Solidity ABI encoding of:

```text
(bytes32 purposePrefix, uint256 chainId, bytes32 publicDataDigest)
```

The purpose prefixes are right-padded `bytes32` strings:

- `PAYGUARD_POLICY_RECEIPT_V1`
- `PAYGUARD_EVALUATION_V1`

The resulting signature is therefore over:

```text
EthereumSigned(keccak256(abi.encode(prefix, chainId, publicDataDigest)))
```

The receipt data digest continues to bind the complete policy binding, frozen
machine/key identity, submission nonce, receipt nonce, and time window. The
evaluation data digest remains signer-independent so two distinct frozen
machines can sign one identical decision; machine ID, key fingerprint, and
recovered signer are checked against the frozen registry entry before counting.

## Verification rules

- Solidity, Go, and TypeScript derive the same message and attestation digest.
- Solidity and public clients recover through the Ethereum signed-message
  wrapper, not directly against the bare protocol digest.
- The chain ID and purpose prefix are mandatory; raw, wrong-chain, and
  cross-purpose signatures fail closed.
- Signatures must be 65-byte canonical secp256k1 signatures. Zero scalars,
  invalid recovery IDs, and high-S malleable variants are rejected.
- The Go sign-port client accepts only credential-free loopback HTTP, verifies
  the echoed message and recovered configured TEE identity, and bounds the
  response body.

The shared fixture currently pins:

- receipt attestation digest
  `0xb4db269c442958dbc3f7cf73e0bdb66eb379991aa2e905aa25d7cc1f51cb3edd`;
- evaluation attestation digest
  `0x9796e29e8db9aaaaf54d4f39deef1a9ee8024ef846a9a342f5445fc5cd9fd590`.

These local checks establish byte compatibility with the pinned sign-port
implementation. They do not establish a PayGuard extension ID, code/image hash,
registered machine identity, stable origin, custody receipt, or live Coston2
result. Those remain release gates.
