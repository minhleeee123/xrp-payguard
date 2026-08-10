import {
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  bytesToHex,
  concatHex,
  encodePacked,
  getAddress,
  hexToBytes,
  keccak256,
  recoverMessageAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  evaluatePolicy,
  evaluationAttestationDigest,
  evaluationDigest,
  parsePrivatePolicyV1,
  policyBindingDigest,
  policyIngressAuthorizationDigest,
  policyReceiptAttestationDigest,
  policyReceiptDigest,
  type ActionRequestV1,
  type PolicyBindingV1,
  type SpendHistoryEntryV1,
} from "@xrp-payguard/protocol";
import {
  INTERACTIVE_DEMO_MODE,
  demoBalanceCheckpointV1,
  demoPolicyBindingV1,
  parseDemoActorRequest,
  validateDemoConfig,
  type DemoAccounting,
  type DemoActorDescriptor,
  type DemoActorRequest,
  type DemoCustodyEnvelope,
  type DemoDomainConfig,
  type DemoEvaluationEnvelope,
} from "./index.js";

const MAX_AUTHORIZATION_WINDOW_SECONDS = 3_600n;
const MAX_CLOCK_SKEW_SECONDS = 60n;
const RECEIPT_LIFETIME_SECONDS = 900n;
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

export interface DemoCanonicalEvaluationState {
  binding: PolicyBindingV1;
  policyStatus: 1 | 2 | 3;
  request: ActionRequestV1;
  accounting: DemoAccounting;
  history: SpendHistoryEntryV1[];
  occurrenceCount: number;
  lastAccountingAt: bigint;
  spendCheckpoint: Hex;
  finalizedAt: bigint;
}

export interface DemoStateReader {
  load(requestId: Hex, policyCommitment: Hex): Promise<DemoCanonicalEvaluationState>;
}

export interface ProcessDemoActorOptions {
  actor: 1 | 2 | 3;
  privateKey: Hex;
  config: DemoDomainConfig;
  request: unknown;
  stateReader?: DemoStateReader;
  now?: () => bigint;
}

export function createDemoActorDescriptor(actor: 1 | 2 | 3, privateKey: Hex, endpoint: string): DemoActorDescriptor {
  const account = demoAccount(privateKey);
  const publicKey = secp256k1.getPublicKey(hexToBytes(privateKey), false);
  const x = bytesToHex(publicKey.slice(1, 33));
  const y = bytesToHex(publicKey.slice(33, 65));
  const keyFingerprint = keccak256(concatHex([x, y]));
  const machineId = keccak256(encodePacked(
    ["string", "uint8", "address", "bytes32"],
    ["PAYGUARD_INTERACTIVE_DEMO_MACHINE_V1", actor, account.address, keyFingerprint],
  ));
  return { actor, machineId, keyFingerprint, signer: getAddress(account.address), publicKey: { x, y }, endpoint };
}

export async function processDemoActorRequest(options: ProcessDemoActorOptions): Promise<DemoCustodyEnvelope | DemoEvaluationEnvelope> {
  validateDemoConfig(options.config);
  const request = parseDemoActorRequest(options.request);
  const descriptor = options.config.actors[options.actor - 1];
  if (!descriptor) throw new Error("demo actor descriptor is unavailable");
  const expectedDescriptor = createDemoActorDescriptor(options.actor, options.privateKey, descriptor.endpoint);
  if (descriptor.machineId.toLowerCase() !== expectedDescriptor.machineId.toLowerCase()
    || descriptor.keyFingerprint.toLowerCase() !== expectedDescriptor.keyFingerprint.toLowerCase()
    || getAddress(descriptor.signer) !== getAddress(expectedDescriptor.signer)
    || descriptor.publicKey.x.toLowerCase() !== expectedDescriptor.publicKey.x.toLowerCase()
    || descriptor.publicKey.y.toLowerCase() !== expectedDescriptor.publicKey.y.toLowerCase()) {
    throw new Error("actor key does not match the public demo descriptor");
  }

  const plaintext = decryptDemoCiphertext(request.ciphertext, options.privateKey);
  try {
    const policy = parsePrivatePolicyV1(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
    const binding = demoPolicyBindingV1(policy, options.config);
    const now = options.now?.() ?? BigInt(Math.floor(Date.now() / 1000));
    await verifyIngressAuthorization(request, binding, descriptor, policy.submissionNonce, now);
    if (request.operation === "CUSTODY") {
      const expiry = minimum(request.authorization.expiry, now + RECEIPT_LIFETIME_SECONDS);
      const receipt = {
        binding,
        machineId: descriptor.machineId,
        keyFingerprint: descriptor.keyFingerprint,
        submissionNonce: policy.submissionNonce,
        receiptNonce: binding.policyNonce,
        issuedAt: now,
        expiry,
      };
      const digest = policyReceiptDigest(receipt);
      const signature = await demoAccount(options.privateKey).signMessage({
        message: { raw: policyReceiptAttestationDigest(receipt) },
      });
      return {
        mode: INTERACTIVE_DEMO_MODE,
        actor: options.actor,
        binding,
        receipt,
        digest,
        signer: descriptor.signer,
        signature,
        assertions: options.config.assertions,
      };
    }

    if (!options.stateReader || !request.requestId) throw new Error("canonical demo state reader is unavailable");
    const canonical = await options.stateReader.load(request.requestId, binding.policyCommitment);
    if (canonical.policyStatus !== 1) throw new Error("demo policy is not active");
    if (canonical.request.createdAt > canonical.finalizedAt || canonical.finalizedAt > canonical.request.expiry) {
      throw new Error("canonical demo request time is invalid or expired");
    }
    if (policyBindingDigest(canonical.binding).toLowerCase() !== policyBindingDigest(binding).toLowerCase()) {
      throw new Error("on-chain demo policy binding does not match ciphertext");
    }
    if (canonical.request.requestId.toLowerCase() !== request.requestId.toLowerCase()
      || canonical.request.policyCommitment.toLowerCase() !== binding.policyCommitment.toLowerCase()) {
      throw new Error("canonical demo request binding is invalid");
    }
    const balanceCheckpoint = demoBalanceCheckpointV1(binding.owner, canonical.request.asset, canonical.accounting);
    if (canonical.request.balanceCheckpoint.toLowerCase() !== balanceCheckpoint.toLowerCase()) {
      throw new Error("demo request balance checkpoint is stale");
    }
    const base = evaluatePolicy(policy, canonical.request, {
      availableBalance: canonical.accounting.available,
      history: canonical.history,
      occurrenceCount: canonical.occurrenceCount,
      lastAccountingAt: canonical.lastAccountingAt,
      spendCheckpoint: canonical.spendCheckpoint,
      balanceCheckpoint,
      // The request creation timestamp is already domain-bound on chain. Using
      // it as the evaluation instant gives all independently invoked actors the
      // same signed result while the finalized read above still enforces live
      // expiry and active-policy checks.
      now: canonical.request.createdAt,
    });
    const result = { ...base, machineId: descriptor.machineId, keyFingerprint: descriptor.keyFingerprint };
    const digest = evaluationDigest(result);
    const signature = await demoAccount(options.privateKey).signMessage({
      message: { raw: evaluationAttestationDigest(result) },
    });
    return {
      mode: INTERACTIVE_DEMO_MODE,
      actor: options.actor,
      result,
      digest,
      signer: descriptor.signer,
      signature,
      assertions: options.config.assertions,
    };
  } finally {
    plaintext.fill(0);
  }
}

export function decryptDemoCiphertext(ciphertext: Hex, privateKey: Hex): Uint8Array {
  demoAccount(privateKey);
  const wire = hexToBytes(ciphertext);
  if (wire.length < 114 || wire.length > 64 * 1024 || wire[0] !== 4) throw new Error("demo ciphertext has an invalid size or key format");
  const ephemeral = wire.slice(0, 65);
  const iv = wire.slice(65, 81);
  const encrypted = wire.slice(81, -32);
  const tag = wire.slice(-32);
  let shared: Uint8Array | undefined;
  let derived: Buffer | undefined;
  let macKey: Buffer | undefined;
  try {
    secp256k1.ProjectivePoint.fromHex(ephemeral);
    shared = secp256k1.getSharedSecret(hexToBytes(privateKey), ephemeral, false);
    derived = sha256(Buffer.concat([Buffer.from([0, 0, 0, 1]), Buffer.from(shared.slice(1, 33))]));
    macKey = sha256(derived.subarray(16, 32));
    const authenticated = Buffer.concat([Buffer.from(iv), Buffer.from(encrypted)]);
    const expected = createHmac("sha256", macKey).update(authenticated).digest();
    if (tag.length !== expected.length || !timingSafeEqual(Buffer.from(tag), expected)) throw new Error("demo ciphertext authentication failed");
    const decipher = createDecipheriv("aes-128-ctr", derived.subarray(0, 16), iv);
    return new Uint8Array(Buffer.concat([decipher.update(encrypted), decipher.final()]));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("demo ciphertext")) throw error;
    throw new Error("demo ciphertext decryption failed");
  } finally {
    shared?.fill(0);
    derived?.fill(0);
    macKey?.fill(0);
  }
}

async function verifyIngressAuthorization(
  request: DemoActorRequest,
  binding: PolicyBindingV1,
  descriptor: DemoActorDescriptor,
  submissionNonce: Hex,
  now: bigint,
): Promise<void> {
  const { issuedAt, expiry, signature } = request.authorization;
  if (issuedAt > now + MAX_CLOCK_SKEW_SECONDS || now > expiry
    || expiry <= issuedAt || expiry - issuedAt > MAX_AUTHORIZATION_WINDOW_SECONDS
    || now > issuedAt + MAX_AUTHORIZATION_WINDOW_SECONDS) {
    throw new Error("demo ingress authorization is stale or outside its bounded window");
  }
  const digest = policyIngressAuthorizationDigest({
    binding,
    submissionNonce,
    issuedAt,
    expiry,
    ciphertextHash: keccak256(request.ciphertext),
    machineId: descriptor.machineId,
    keyFingerprint: descriptor.keyFingerprint,
  });
  const recovered = await recoverMessageAddress({ message: { raw: digest }, signature });
  if (getAddress(recovered) !== getAddress(binding.owner)) throw new Error("demo ingress owner authorization is invalid");
}

function demoAccount(privateKey: Hex) {
  if (!PRIVATE_KEY.test(privateKey) || !secp256k1.utils.isValidPrivateKey(hexToBytes(privateKey))) {
    throw new Error("demo actor key is missing or malformed");
  }
  return privateKeyToAccount(privateKey);
}

function sha256(value: Buffer): Buffer { return createHash("sha256").update(value).digest(); }
function minimum(left: bigint, right: bigint): bigint { return left < right ? left : right; }
