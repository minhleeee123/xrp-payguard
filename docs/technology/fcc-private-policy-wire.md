# FCC private policy wire and TEE identity

Status: local cross-language/ECIES gate. No private Coston2 ingress, registered
PayGuard machine, custody receipt, or live evaluation is claimed yet.

## Machine identity

The production FCC binary no longer accepts a configured application signing
key and no longer starts evaluation with a nil machine. After tee-node v0.0.24
starts, PayGuard calls its loopback-only sign port with the fixed discovery
message `PAYGUARD_TEE_IDENTITY_DISCOVERY_V1`, validates the canonical signature,
and recovers the fresh TEE secp256k1 public key.

PayGuard derives:

- signer: the Ethereum address of the recovered TEE public key;
- machine ID: that address left-padded to `bytes32`;
- key fingerprint: Keccak-256 of the uncompressed public key without its `0x04`
  prefix.

The last 20 bytes of the fingerprint therefore agree with the signer address,
but the full fingerprint remains frozen separately. Live registration must
compare all three values with the same proxy `/info` response and on-chain FCC
machine record. Startup fails closed if sign/decrypt is unavailable.

## Private policy plaintext

Before encryption, `POLICY_SCHEMA_V1` uses one strict lower-camel JSON object.
Every `uint256` and `uint64` is a canonical quoted decimal; bounded small values
remain JSON integers; rule lists must be explicit arrays. Unknown/missing fields,
numeric bigints, duplicate normalized rules, invalid addresses/hashes, and
non-canonical policy semantics are rejected. Go and TypeScript tests prove the
wire round trip preserves the exact ABI policy commitment.

The object includes private salt, submission nonce, caps, schedule, target,
requester, action, and FTSO rules. It must exist only in transient client memory
before encryption and inside the selected TEE after decryption. It is forbidden
from logs, browser persistence, relay, calldata, events, evidence, and public
responses.

## Encryption and decryption

The client encrypts the complete policy independently to each selected TEE
public key using the ECIES secp256k1/AES-128/SHA-256 scheme implemented by the
pinned tee-node. A ciphertext for one identity must fail on either other
identity. Inside the TEE boundary, PayGuard sends that ciphertext only to the
credential-free loopback `POST /decrypt` port, bounds both request and response,
strictly decodes the policy, and clears the plaintext byte buffer after parsing.

The current machine store is in-memory and deliberately fails closed after
identity restart. Authenticated per-machine HTTPS ingress, owner authorization,
sealed rollback/recovery state, three stable origins, and live replacement
evidence are separate gates and must be completed before custody is called live.
