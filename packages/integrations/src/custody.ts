import {
  POLICY_SCHEMA_V1,
  policyReceiptDigest,
  type Hex,
  type PolicyBindingV1,
  type PolicyReceiptV1,
} from "@xrp-payguard/protocol";
import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  isHex,
  keccak256,
  recoverAddress,
  stringToHex,
  zeroAddress,
  zeroHash,
} from "viem";

const MAX_UINT8 = (1n << 8n) - 1n;
const MAX_UINT32 = (1n << 32n) - 1n;
const MAX_UINT64 = (1n << 64n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

export const POLICY_CUSTODY_BUNDLE_V1 = keccak256(stringToHex("POLICY_CUSTODY_BUNDLE_V1"));

export interface PublicPolicyBindingWireV1 {
  chainId: string;
  registry: string;
  vault: string;
  router: string;
  owner: string;
  policyId: Hex;
  policyVersion: string;
  policyCommitment: Hex;
  schema: Hex;
  extensionId: Hex;
  codeVersion: Hex;
  machineIds: [Hex, Hex, Hex];
  keyFingerprints: [Hex, Hex, Hex];
  custodyThreshold: string;
  resultThreshold: string;
  policyNonce: string;
}

export interface PublicPolicyReceiptV1 {
  machineId: Hex;
  keyFingerprint: Hex;
  submissionNonce: Hex;
  receiptNonce: bigint;
  issuedAt: bigint;
  expiry: bigint;
  digest: Hex;
  signer: Hex;
  signature: Hex;
}

export interface PublicPolicyReceiptWireV1 {
  machineId: Hex;
  keyFingerprint: Hex;
  submissionNonce: Hex;
  receiptNonce: string;
  issuedAt: string;
  expiry: string;
  digest: Hex;
  signer: Hex;
  signature: Hex;
}

export interface PublicPolicyCustodyBundleV1 {
  binding: PolicyBindingV1;
  receipts: [PublicPolicyReceiptV1, PublicPolicyReceiptV1, PublicPolicyReceiptV1];
  bundleHash: Hex;
}

export interface PublicPolicyCustodyBundleWireV1 {
  binding: PublicPolicyBindingWireV1;
  receipts: [PublicPolicyReceiptWireV1, PublicPolicyReceiptWireV1, PublicPolicyReceiptWireV1];
  bundleHash: Hex;
}

export type PolicyCustodyUnavailableReason = "RPC_UNCONFIGURED" | "RPC_UNAVAILABLE" | "CUSTODY_UNFINALIZED" | "CUSTODY_INVALID";

export interface PublicPolicyCustodyAvailableState {
  status: "READY";
  bundle: PublicPolicyCustodyBundleV1;
  publicFacts: true;
}

export interface PublicPolicyCustodyUnavailableState {
  status: "UNAVAILABLE";
  reason: PolicyCustodyUnavailableReason;
  publicFacts: false;
}

export type PublicPolicyCustodyReadState = PublicPolicyCustodyAvailableState | PublicPolicyCustodyUnavailableState;

const BINDING_FIELDS = new Set<keyof PublicPolicyBindingWireV1>([
  "chainId", "registry", "vault", "router", "owner", "policyId", "policyVersion", "policyCommitment", "schema", "extensionId", "codeVersion",
  "machineIds", "keyFingerprints", "custodyThreshold", "resultThreshold", "policyNonce",
]);
const RECEIPT_FIELDS = new Set<keyof PublicPolicyReceiptWireV1>([
  "machineId", "keyFingerprint", "submissionNonce", "receiptNonce", "issuedAt", "expiry", "digest", "signer", "signature",
]);
const BUNDLE_FIELDS = new Set<keyof PublicPolicyCustodyBundleWireV1>(["binding", "receipts", "bundleHash"]);

export function policyCustodyBundleHash(bundle: Omit<PublicPolicyCustodyBundleV1, "bundleHash">): Hex {
  const binding = normalizeBinding(bundle.binding);
  const receipts = bundle.receipts.map((receipt, index) => validateReceipt(receipt, binding, index));
  assertReceiptSet(receipts, binding);
  const receiptDigests = receipts.map((receipt) => receipt.digest) as [Hex, Hex, Hex];
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32[3]" }],
    [POLICY_CUSTODY_BUNDLE_V1, receiptDigests],
  ));
}

export async function decodePublicPolicyCustodyBundle(value: unknown): Promise<PublicPolicyCustodyBundleV1> {
  const record = objectWithFields(value, BUNDLE_FIELDS, "policy custody bundle");
  const binding = decodeBinding(record.binding);
  if (!Array.isArray(record.receipts) || record.receipts.length !== 3) throw new Error("policy custody requires three receipts");
  const receipts = record.receipts.map((receipt, index) => decodeReceipt(receipt, binding, index)) as [PublicPolicyReceiptV1, PublicPolicyReceiptV1, PublicPolicyReceiptV1];
  assertReceiptSet(receipts, binding);
  for (let index = 0; index < receipts.length; index += 1) await validateReceiptSignature(receipts[index]!, index);
  const bundleHash = nonZeroBytes32(record.bundleHash, "bundleHash");
  const expectedHash = policyCustodyBundleHash({ binding, receipts });
  if (bundleHash !== expectedHash) throw new Error("policy custody bundle hash mismatch");
  return { binding, receipts, bundleHash };
}

export async function encodePublicPolicyCustodyBundle(bundle: PublicPolicyCustodyBundleV1): Promise<PublicPolicyCustodyBundleWireV1> {
  const canonical = await decodePublicPolicyCustodyBundle({
    binding: encodeBinding(bundle.binding),
    receipts: bundle.receipts.map(encodeReceipt),
    bundleHash: bundle.bundleHash,
  });
  return {
    binding: encodeBinding(canonical.binding),
    receipts: canonical.receipts.map(encodeReceipt) as [PublicPolicyReceiptWireV1, PublicPolicyReceiptWireV1, PublicPolicyReceiptWireV1],
    bundleHash: canonical.bundleHash,
  };
}

export async function publicPolicyCustodyReadState(bundle: PublicPolicyCustodyBundleV1): Promise<PublicPolicyCustodyAvailableState> {
  return { status: "READY", bundle: await decodePublicPolicyCustodyBundle(await encodePublicPolicyCustodyBundle(bundle)), publicFacts: true };
}

export function unavailablePolicyCustodyState(reason: PolicyCustodyUnavailableReason = "RPC_UNCONFIGURED"): PublicPolicyCustodyUnavailableState {
  return { status: "UNAVAILABLE", reason, publicFacts: false };
}

function decodeBinding(value: unknown): PolicyBindingV1 {
  const record = objectWithFields(value, BINDING_FIELDS, "policy binding");
  return normalizeBinding({
    chainId: quotedUint(record.chainId, "binding.chainId", MAX_UINT256),
    registry: publicAddress(record.registry, "binding.registry"),
    vault: publicAddress(record.vault, "binding.vault"),
    router: publicAddress(record.router, "binding.router"),
    owner: publicAddress(record.owner, "binding.owner"),
    policyId: nonZeroBytes32(record.policyId, "binding.policyId"),
    policyVersion: Number(quotedUint(record.policyVersion, "binding.policyVersion", MAX_UINT32)),
    policyCommitment: nonZeroBytes32(record.policyCommitment, "binding.policyCommitment"),
    schema: nonZeroBytes32(record.schema, "binding.schema"),
    extensionId: nonZeroBytes32(record.extensionId, "binding.extensionId"),
    codeVersion: nonZeroBytes32(record.codeVersion, "binding.codeVersion"),
    machineIds: tupleBytes32(record.machineIds, "binding.machineIds"),
    keyFingerprints: tupleBytes32(record.keyFingerprints, "binding.keyFingerprints"),
    custodyThreshold: Number(quotedUint(record.custodyThreshold, "binding.custodyThreshold", MAX_UINT8)),
    resultThreshold: Number(quotedUint(record.resultThreshold, "binding.resultThreshold", MAX_UINT8)),
    policyNonce: quotedUint(record.policyNonce, "binding.policyNonce", MAX_UINT64),
  });
}

function encodeBinding(binding: PolicyBindingV1): PublicPolicyBindingWireV1 {
  const canonical = normalizeBinding(binding);
  return {
    chainId: canonical.chainId.toString(), registry: canonical.registry, vault: canonical.vault, router: canonical.router, owner: canonical.owner,
    policyId: canonical.policyId, policyVersion: canonical.policyVersion.toString(), policyCommitment: canonical.policyCommitment, schema: canonical.schema,
    extensionId: canonical.extensionId, codeVersion: canonical.codeVersion, machineIds: canonical.machineIds, keyFingerprints: canonical.keyFingerprints,
    custodyThreshold: canonical.custodyThreshold.toString(), resultThreshold: canonical.resultThreshold.toString(), policyNonce: canonical.policyNonce.toString(),
  };
}

function normalizeBinding(binding: PolicyBindingV1): PolicyBindingV1 {
  if (binding.chainId <= 0n || binding.chainId > MAX_UINT256) throw new Error("binding chainId is out of range");
  const normalized: PolicyBindingV1 = {
    chainId: binding.chainId,
    registry: publicAddress(binding.registry, "binding.registry"),
    vault: publicAddress(binding.vault, "binding.vault"),
    router: publicAddress(binding.router, "binding.router"),
    owner: publicAddress(binding.owner, "binding.owner"),
    policyId: nonZeroBytes32(binding.policyId, "binding.policyId"),
    policyVersion: boundedNumber(binding.policyVersion, MAX_UINT32, "binding.policyVersion"),
    policyCommitment: nonZeroBytes32(binding.policyCommitment, "binding.policyCommitment"),
    schema: nonZeroBytes32(binding.schema, "binding.schema"),
    extensionId: nonZeroBytes32(binding.extensionId, "binding.extensionId"),
    codeVersion: nonZeroBytes32(binding.codeVersion, "binding.codeVersion"),
    machineIds: tupleBytes32(binding.machineIds, "binding.machineIds"),
    keyFingerprints: tupleBytes32(binding.keyFingerprints, "binding.keyFingerprints"),
    custodyThreshold: boundedNumber(binding.custodyThreshold, MAX_UINT8, "binding.custodyThreshold"),
    resultThreshold: boundedNumber(binding.resultThreshold, MAX_UINT8, "binding.resultThreshold"),
    policyNonce: binding.policyNonce,
  };
  if (normalized.schema !== POLICY_SCHEMA_V1) throw new Error("unsupported policy binding schema");
  if (normalized.policyVersion === 0 || normalized.policyNonce === 0n || normalized.policyNonce > MAX_UINT64) throw new Error("binding version/nonce is invalid");
  if (normalized.custodyThreshold !== 3 || normalized.resultThreshold !== 2) throw new Error("binding thresholds must be 3-of-3 custody and 2-of-3 result");
  if (new Set(normalized.machineIds).size !== 3 || new Set(normalized.keyFingerprints).size !== 3) throw new Error("binding machine/key identities must be distinct");
  return normalized;
}

function decodeReceipt(value: unknown, binding: PolicyBindingV1, index: number): PublicPolicyReceiptV1 {
  const record = objectWithFields(value, RECEIPT_FIELDS, `policy receipt ${index}`);
  return validateReceipt({
    machineId: nonZeroBytes32(record.machineId, `receipts[${index}].machineId`),
    keyFingerprint: nonZeroBytes32(record.keyFingerprint, `receipts[${index}].keyFingerprint`),
    submissionNonce: nonZeroBytes32(record.submissionNonce, `receipts[${index}].submissionNonce`),
    receiptNonce: quotedUint(record.receiptNonce, `receipts[${index}].receiptNonce`, MAX_UINT64),
    issuedAt: quotedUint(record.issuedAt, `receipts[${index}].issuedAt`, MAX_UINT64),
    expiry: quotedUint(record.expiry, `receipts[${index}].expiry`, MAX_UINT64),
    digest: nonZeroBytes32(record.digest, `receipts[${index}].digest`),
    signer: publicAddress(record.signer, `receipts[${index}].signer`),
    signature: signatureValue(record.signature, `receipts[${index}].signature`),
  }, binding, index);
}

function encodeReceipt(receipt: PublicPolicyReceiptV1): PublicPolicyReceiptWireV1 {
  return {
    machineId: receipt.machineId, keyFingerprint: receipt.keyFingerprint, submissionNonce: receipt.submissionNonce,
    receiptNonce: receipt.receiptNonce.toString(), issuedAt: receipt.issuedAt.toString(), expiry: receipt.expiry.toString(),
    digest: receipt.digest, signer: receipt.signer, signature: receipt.signature,
  };
}

function validateReceipt(receipt: PublicPolicyReceiptV1, binding: PolicyBindingV1, index: number): PublicPolicyReceiptV1 {
  const machineId = nonZeroBytes32(receipt.machineId, `receipts[${index}].machineId`);
  const keyFingerprint = nonZeroBytes32(receipt.keyFingerprint, `receipts[${index}].keyFingerprint`);
  if (machineId !== binding.machineIds[index] || keyFingerprint !== binding.keyFingerprints[index]) throw new Error(`receipt ${index} does not match frozen machine order`);
  if (receipt.receiptNonce !== binding.policyNonce || receipt.issuedAt >= receipt.expiry || receipt.expiry > MAX_UINT64) throw new Error(`receipt ${index} time/nonce is invalid`);
  const submissionNonce = nonZeroBytes32(receipt.submissionNonce, `receipts[${index}].submissionNonce`);
  const protocolReceipt: PolicyReceiptV1 = { binding, machineId, keyFingerprint, submissionNonce, receiptNonce: receipt.receiptNonce, issuedAt: receipt.issuedAt, expiry: receipt.expiry };
  const digest = policyReceiptDigest(protocolReceipt);
  const providedDigest = nonZeroBytes32(receipt.digest, `receipts[${index}].digest`);
  if (providedDigest !== digest) throw new Error(`receipt ${index} digest mismatch`);
  return { ...receipt, machineId, keyFingerprint, submissionNonce, digest, signer: getAddress(receipt.signer) as Hex };
}

async function validateReceiptSignature(receipt: PublicPolicyReceiptV1, index: number): Promise<void> {
  if (getAddress(await recoverAddress({ hash: receipt.digest, signature: receipt.signature })) !== getAddress(receipt.signer)) {
    throw new Error(`receipt ${index} signature mismatch`);
  }
}

function assertReceiptSet(receipts: readonly PublicPolicyReceiptV1[], binding: PolicyBindingV1): void {
  if (receipts.length !== 3) throw new Error("policy custody requires three receipts");
  const submissionNonce = receipts[0]!.submissionNonce;
  const issuedAt = receipts[0]!.issuedAt;
  const expiry = receipts[0]!.expiry;
  for (let index = 0; index < receipts.length; index += 1) {
    const receipt = receipts[index]!;
    if (receipt.machineId !== binding.machineIds[index] || receipt.keyFingerprint !== binding.keyFingerprints[index]) {
      throw new Error(`receipt ${index} does not match frozen machine order`);
    }
    if (receipt.submissionNonce !== submissionNonce || receipt.issuedAt !== issuedAt || receipt.expiry !== expiry) {
      throw new Error("custody receipts must share one submission nonce and time window");
    }
  }
}

function signatureValue(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !isHex(value) || value.length !== 132) throw new Error(`${label} must be a 65-byte signature`);
  return value.toLowerCase() as Hex;
}

function objectWithFields(value: unknown, allowed: ReadonlySet<string>, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new Error(`unknown public ${label} field: ${key}`);
  for (const key of allowed) if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`missing public ${label} field: ${key}`);
  return record;
}

function quotedUint(value: unknown, label: string, max: bigint): bigint {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new Error(`${label} must be a quoted unsigned decimal`);
  const parsed = BigInt(value);
  if (parsed > max) throw new Error(`${label} exceeds supported range`);
  return parsed;
}

function boundedNumber(value: number, max: bigint, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || BigInt(value) > max) throw new Error(`${label} is out of range`);
  return value;
}

function bytes32(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !HEX32.test(value)) throw new Error(`${label} must be bytes32`);
  return value.toLowerCase() as Hex;
}

function nonZeroBytes32(value: unknown, label: string): Hex {
  const parsed = bytes32(value, label);
  if (parsed === zeroHash) throw new Error(`${label} must be non-zero bytes32`);
  return parsed;
}

function tupleBytes32(value: unknown, label: string): [Hex, Hex, Hex] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must contain three bytes32 values`);
  return [nonZeroBytes32(value[0], `${label}[0]`), nonZeroBytes32(value[1], `${label}[1]`), nonZeroBytes32(value[2], `${label}[2]`)];
}

function publicAddress(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) throw new Error(`${label} must be a non-zero address`);
  return getAddress(value) as Hex;
}
