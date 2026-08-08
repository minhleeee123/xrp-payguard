import { secp256k1 } from "@noble/curves/secp256k1";
import {
  bytesToHex,
  concatBytes,
  concatHex,
  getAddress,
  hexToBytes,
  keccak256,
  padHex,
  type Hex,
} from "viem";
import { privatePolicyBytesV1 } from "./private-wire.js";
import type { PolicyV1 } from "./types.js";

const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/;
const maxCiphertextBytes = 64 * 1024;
const eciesOverheadBytes = 65 + 16 + 32;

export interface TeePublicKeyV1 {
  x: Hex;
  y: Hex;
}

interface DeterministicEciesEntropy {
  ephemeralPrivateKey: Hex;
  iv: Hex;
}

export interface TeeMachineDescriptorV1 {
  signer: Hex;
  machineId: Hex;
  keyFingerprint: Hex;
}

function validatedPublicKeyBytes(publicKey: TeePublicKeyV1): Uint8Array {
  if (!bytes32Pattern.test(publicKey.x) || !bytes32Pattern.test(publicKey.y)) throw new Error("invalid TEE public key");
  const bytes = concatBytes([new Uint8Array([4]), hexToBytes(publicKey.x), hexToBytes(publicKey.y)]);
  try {
    secp256k1.ProjectivePoint.fromHex(bytes);
  } catch {
    throw new Error("invalid TEE public key");
  }
  return bytes;
}

export function teeMachineDescriptorV1(publicKey: TeePublicKeyV1): TeeMachineDescriptorV1 {
  validatedPublicKeyBytes(publicKey);
  const keyFingerprint = keccak256(concatHex([publicKey.x, publicKey.y]));
  const signer = getAddress(`0x${keyFingerprint.slice(-40)}`) as Hex;
  return { signer, machineId: padHex(signer, { size: 32, dir: "left" }).toLowerCase() as Hex, keyFingerprint };
}

function browserCrypto(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) throw new Error("Web Crypto is unavailable");
  return globalThis.crypto;
}

function bufferSource(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

async function sha256(value: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await browserCrypto().subtle.digest("SHA-256", bufferSource(value)));
}

async function randomPrivateKey(): Promise<Uint8Array> {
  const value = new Uint8Array(32);
  do browserCrypto().getRandomValues(value);
  while (!secp256k1.utils.isValidPrivateKey(value));
  return value;
}

/** tee-node v0.0.24-compatible secp256k1 ECIES_AES128_SHA256 encryption. */
async function encryptForTeeWithEntropyV1(
  plaintext: Uint8Array,
  publicKey: TeePublicKeyV1,
  deterministicEntropy?: DeterministicEciesEntropy,
): Promise<Hex> {
  if (plaintext.length === 0 || plaintext.length > maxCiphertextBytes - eciesOverheadBytes) throw new Error("invalid private policy size");
  const recipient = validatedPublicKeyBytes(publicKey);
  const privateKey = deterministicEntropy ? hexToBytes(deterministicEntropy.ephemeralPrivateKey) : await randomPrivateKey();
  const iv = bufferSource(deterministicEntropy ? hexToBytes(deterministicEntropy.iv) : browserCrypto().getRandomValues(new Uint8Array(16)));
  if (privateKey.length !== 32 || !secp256k1.utils.isValidPrivateKey(privateKey) || iv.length !== 16) throw new Error("invalid ECIES entropy");
  const ephemeral = secp256k1.getPublicKey(privateKey, false);
  const sharedPoint = secp256k1.getSharedSecret(privateKey, recipient, false);
  const sharedX = sharedPoint.slice(1, 33);
  const derived = await sha256(concatBytes([new Uint8Array([0, 0, 0, 1]), sharedX]));
  const encryptionKey = derived.slice(0, 16);
  const macKey = await sha256(derived.slice(16, 32));
  try {
    const importedEncryptionKey = await browserCrypto().subtle.importKey("raw", bufferSource(encryptionKey), "AES-CTR", false, ["encrypt"]);
    const encrypted = new Uint8Array(await browserCrypto().subtle.encrypt(
      { name: "AES-CTR", counter: iv, length: 128 }, importedEncryptionKey, bufferSource(plaintext),
    ));
    const encryptedMessage = concatBytes([iv, encrypted]);
    const importedMacKey = await browserCrypto().subtle.importKey(
      "raw", bufferSource(macKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const tag = new Uint8Array(await browserCrypto().subtle.sign("HMAC", importedMacKey, bufferSource(encryptedMessage)));
    const ciphertext = concatBytes([ephemeral, encryptedMessage, tag]);
    if (ciphertext.length > maxCiphertextBytes) throw new Error("encrypted private policy exceeds limit");
    return bytesToHex(ciphertext);
  } finally {
    privateKey.fill(0); sharedPoint.fill(0); sharedX.fill(0); derived.fill(0);
    encryptionKey.fill(0); macKey.fill(0);
  }
}

export async function encryptForTeeV1(plaintext: Uint8Array, publicKey: TeePublicKeyV1): Promise<Hex> {
  return encryptForTeeWithEntropyV1(plaintext, publicKey);
}

/** Internal deterministic entrypoint for golden-vector tests. Not re-exported by the package. */
export async function testEncryptForTeeV1(
  plaintext: Uint8Array,
  publicKey: TeePublicKeyV1,
  deterministicEntropy: DeterministicEciesEntropy,
): Promise<Hex> {
  return encryptForTeeWithEntropyV1(plaintext, publicKey, deterministicEntropy);
}

export async function encryptPrivatePolicyForTeeV1(
  policy: PolicyV1,
  publicKey: TeePublicKeyV1,
): Promise<Hex> {
  const plaintext = privatePolicyBytesV1(policy);
  try {
    return await encryptForTeeV1(plaintext, publicKey);
  } finally {
    plaintext.fill(0);
  }
}
