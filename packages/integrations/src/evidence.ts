import {
  POLICY_SCHEMA_V1,
  evaluationDigest,
  type Hex,
  type PublicReasonClass,
} from "@xrp-payguard/protocol";
import { getAddress, isAddress, zeroAddress, zeroHash } from "viem";
import {
  decodePublicRequestSnapshot,
  encodePublicRequestSnapshot,
  type PublicRequestSnapshotV1,
  type PublicRequestSnapshotWireV1,
} from "./requests.js";

const MAX_UINT8 = (1n << 8n) - 1n;
const MAX_UINT32 = (1n << 32n) - 1n;
const MAX_UINT64 = (1n << 64n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

export type AuditInputKind = "NONE" | "FTSO" | "FDC";
export type AuditExecutionStatus = "DENIED" | "NOT_EXECUTED" | "EXECUTED" | "EXPIRED" | "CANCELLED";
export type AuditEvidenceStatus = "VERIFIED";

export interface PublicPolicyEvidenceV1 {
  chainId: bigint;
  registry: string;
  vault: string;
  router: string;
  policyId: Hex;
  policyVersion: number;
  policyCommitment: Hex;
  schema: Hex;
  extensionId: Hex;
  codeVersion: Hex;
  machineIds: [Hex, Hex, Hex];
  keyFingerprints: [Hex, Hex, Hex];
  custodyThreshold: number;
  resultThreshold: number;
  custodyReceiptBitmap: number;
}

export interface PublicConservationEvidenceV1 {
  deposited: bigint;
  available: bigint;
  reserved: bigint;
  spent: bigint;
  withdrawn: bigint;
  refunded: bigint;
  conservationAssertion: true;
}

export interface PublicAuditEvidenceV1 {
  schemaVersion: number;
  evidenceBlock: bigint;
  evidenceTransactionHash: Hex;
  policy: PublicPolicyEvidenceV1;
  request: PublicRequestSnapshotV1;
  decision: "ALLOW" | "DENY";
  publicReasonClass: PublicReasonClass;
  resultDigest: Hex;
  resultNonce: Hex;
  resultAttempt: number;
  resultIssuedAt: bigint;
  resultExpiry: bigint;
  resultingCheckpoint: Hex;
  resultSignerMachineIds: [Hex, Hex];
  inputKind: AuditInputKind;
  inputFinalized: boolean;
  executionStatus: AuditExecutionStatus;
  executionTransactionHash: Hex;
  conservation: PublicConservationEvidenceV1;
}

export interface PublicPolicyEvidenceWireV1 {
  chainId: string;
  registry: string;
  vault: string;
  router: string;
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
  custodyReceiptBitmap: string;
}

export interface PublicConservationEvidenceWireV1 {
  deposited: string;
  available: string;
  reserved: string;
  spent: string;
  withdrawn: string;
  refunded: string;
  conservationAssertion: true;
}

export interface PublicAuditEvidenceWireV1 {
  schemaVersion: string;
  evidenceBlock: string;
  evidenceTransactionHash: Hex;
  policy: PublicPolicyEvidenceWireV1;
  request: PublicRequestSnapshotWireV1;
  decision: "ALLOW" | "DENY";
  publicReasonClass: PublicReasonClass;
  resultDigest: Hex;
  resultNonce: Hex;
  resultAttempt: string;
  resultIssuedAt: string;
  resultExpiry: string;
  resultingCheckpoint: Hex;
  resultSignerMachineIds: [Hex, Hex];
  inputKind: AuditInputKind;
  inputFinalized: boolean;
  executionStatus: AuditExecutionStatus;
  executionTransactionHash: Hex;
  conservation: PublicConservationEvidenceWireV1;
}

export interface PublicAuditAvailableState {
  status: AuditEvidenceStatus;
  evidence: PublicAuditEvidenceV1;
  publicFacts: true;
}

export interface PublicAuditUnavailableState {
  status: "UNAVAILABLE";
  reason: "RPC_UNCONFIGURED" | "RPC_UNAVAILABLE" | "EVIDENCE_UNFINALIZED" | "EVIDENCE_INVALID";
  publicFacts: false;
}

export type PublicAuditReadState = PublicAuditAvailableState | PublicAuditUnavailableState;

const WIRE_FIELDS = new Set<keyof PublicAuditEvidenceWireV1>([
  "schemaVersion", "evidenceBlock", "evidenceTransactionHash", "policy", "request", "decision", "publicReasonClass",
  "resultDigest", "resultNonce", "resultAttempt", "resultIssuedAt", "resultExpiry", "resultingCheckpoint",
  "resultSignerMachineIds", "inputKind", "inputFinalized", "executionStatus", "executionTransactionHash", "conservation",
]);
const POLICY_FIELDS = new Set<keyof PublicPolicyEvidenceWireV1>([
  "chainId", "registry", "vault", "router", "policyId", "policyVersion", "policyCommitment", "schema", "extensionId",
  "codeVersion", "machineIds", "keyFingerprints", "custodyThreshold", "resultThreshold", "custodyReceiptBitmap",
]);
const CONSERVATION_FIELDS = new Set<keyof PublicConservationEvidenceWireV1>([
  "deposited", "available", "reserved", "spent", "withdrawn", "refunded", "conservationAssertion",
]);
const INPUT_KINDS = new Set<AuditInputKind>(["NONE", "FTSO", "FDC"]);
const EXECUTION_STATUSES = new Set<AuditExecutionStatus>(["DENIED", "NOT_EXECUTED", "EXECUTED", "EXPIRED", "CANCELLED"]);
const REASONS = new Set<PublicReasonClass>([
  "OK", "POLICY_DENIED", "MALFORMED", "WRONG_DOMAIN", "STALE_INPUT", "DEPENDENCY_UNAVAILABLE", "EXPIRED", "STOPPED",
  "INSUFFICIENT_BALANCE", "CAP_EXCEEDED", "OCCURRENCE_EXCEEDED", "TARGET_DENIED", "REQUESTER_DENIED", "ACTION_DENIED",
  "FTSO_INVALID", "COOLDOWN", "FDC_INVALID",
]);

export function decodePublicAuditEvidence(value: unknown): PublicAuditEvidenceV1 {
  const record = objectWithFields(value, WIRE_FIELDS, "evidence");
  const schemaVersion = Number(quotedUint(record.schemaVersion, "schemaVersion", 1n));
  if (schemaVersion !== 1) throw new Error("unsupported evidence schema");
  const evidenceBlock = quotedUint(record.evidenceBlock, "evidenceBlock", MAX_UINT64);
  if (evidenceBlock === 0n) throw new Error("evidence block must be non-zero");
  const evidenceTransactionHash = nonZeroBytes32(record.evidenceTransactionHash, "evidenceTransactionHash");
  const policyRecord = objectWithFields(record.policy, POLICY_FIELDS, "policy evidence");
  const policy = decodePolicyEvidence(policyRecord);
  const request = decodePublicRequestSnapshot(record.request);
  if (request.chainId !== policy.chainId || getAddress(request.registry) !== getAddress(policy.registry)
    || getAddress(request.vault) !== getAddress(policy.vault) || getAddress(request.router) !== getAddress(policy.router)
    || request.policyId.toLowerCase() !== policy.policyId.toLowerCase() || request.policyVersion !== policy.policyVersion
    || request.policyCommitment.toLowerCase() !== policy.policyCommitment.toLowerCase()) {
    throw new Error("evidence policy/request domain mismatch");
  }
  if (request.decision === "PENDING") throw new Error("evidence request has no threshold decision");
  const decision = enumValue(record.decision, new Set(["ALLOW", "DENY"] as const), "decision");
  const publicReasonClass = enumValue(record.publicReasonClass, REASONS, "publicReasonClass");
  if (decision !== request.decision || publicReasonClass !== request.publicReasonClass) throw new Error("evidence decision drift");
  const resultDigest = nonZeroBytes32(record.resultDigest, "resultDigest");
  const resultNonce = nonZeroBytes32(record.resultNonce, "resultNonce");
  const resultAttempt = Number(quotedUint(record.resultAttempt, "resultAttempt", MAX_UINT32));
  const resultIssuedAt = quotedUint(record.resultIssuedAt, "resultIssuedAt", MAX_UINT64);
  const resultExpiry = quotedUint(record.resultExpiry, "resultExpiry", MAX_UINT64);
  const resultingCheckpoint = nonZeroBytes32(record.resultingCheckpoint, "resultingCheckpoint");
  if (resultNonce.toLowerCase() !== request.approvedNonce.toLowerCase() || resultAttempt !== request.approvedAttempt
    || resultIssuedAt !== request.approvedIssuedAt || resultExpiry !== request.approvedExpiry
    || resultingCheckpoint.toLowerCase() !== request.approvedCheckpoint.toLowerCase()) throw new Error("evidence result drift");
  const resultSignerMachineIds = pairBytes32(record.resultSignerMachineIds, "resultSignerMachineIds");
  if (resultSignerMachineIds[0].toLowerCase() === resultSignerMachineIds[1].toLowerCase()
    || !policy.machineIds.some((machineId) => machineId.toLowerCase() === resultSignerMachineIds[0].toLowerCase())
    || !policy.machineIds.some((machineId) => machineId.toLowerCase() === resultSignerMachineIds[1].toLowerCase())) {
    throw new Error("result signer set invalid");
  }
  const inputKind = enumValue(record.inputKind, INPUT_KINDS, "inputKind");
  if (typeof record.inputFinalized !== "boolean") throw new Error("inputFinalized must be boolean");
  if ((inputKind === "NONE") !== (request.inputCommitment === zeroHash) || record.inputFinalized !== (inputKind !== "NONE")) {
    throw new Error("input evidence mismatch");
  }
  const executionStatus = enumValue(record.executionStatus, EXECUTION_STATUSES, "executionStatus");
  const executionTransactionHash = bytes32(record.executionTransactionHash, "executionTransactionHash");
  validateExecutionStatus(request, executionStatus, executionTransactionHash);
  const conservation = decodeConservation(record.conservation);
  const digest = evaluationDigest({
    request,
    decision,
    publicReasonClass,
    reservedAmount: request.approvedAmount,
    resultingCheckpoint,
    resultNonce,
    attempt: resultAttempt,
    issuedAt: resultIssuedAt,
    expiry: resultExpiry,
    machineId: resultSignerMachineIds[0],
    keyFingerprint: policy.keyFingerprints[0],
  });
  if (digest.toLowerCase() !== resultDigest.toLowerCase()) throw new Error("evidence result digest mismatch");
  return {
    schemaVersion, evidenceBlock, evidenceTransactionHash, policy, request, decision, publicReasonClass, resultDigest,
    resultNonce, resultAttempt, resultIssuedAt, resultExpiry, resultingCheckpoint, resultSignerMachineIds, inputKind,
    inputFinalized: record.inputFinalized, executionStatus, executionTransactionHash, conservation,
  };
}

export function encodePublicAuditEvidence(evidence: PublicAuditEvidenceV1): PublicAuditEvidenceWireV1 {
  const wire: PublicAuditEvidenceWireV1 = {
    schemaVersion: evidence.schemaVersion.toString(), evidenceBlock: evidence.evidenceBlock.toString(),
    evidenceTransactionHash: evidence.evidenceTransactionHash, policy: encodePolicyEvidence(evidence.policy),
    request: encodePublicRequestSnapshot(evidence.request), decision: evidence.decision, publicReasonClass: evidence.publicReasonClass,
    resultDigest: evidence.resultDigest, resultNonce: evidence.resultNonce, resultAttempt: evidence.resultAttempt.toString(),
    resultIssuedAt: evidence.resultIssuedAt.toString(), resultExpiry: evidence.resultExpiry.toString(), resultingCheckpoint: evidence.resultingCheckpoint,
    resultSignerMachineIds: evidence.resultSignerMachineIds, inputKind: evidence.inputKind, inputFinalized: evidence.inputFinalized,
    executionStatus: evidence.executionStatus, executionTransactionHash: evidence.executionTransactionHash,
    conservation: encodeConservation(evidence.conservation),
  };
  decodePublicAuditEvidence(wire);
  return wire;
}

export function publicAuditReadState(evidence: PublicAuditEvidenceV1): PublicAuditAvailableState {
  const canonical = decodePublicAuditEvidence(encodePublicAuditEvidence(evidence));
  return { status: "VERIFIED", evidence: canonical, publicFacts: true };
}

export function unavailableAuditState(reason: PublicAuditUnavailableState["reason"] = "RPC_UNCONFIGURED"): PublicAuditUnavailableState {
  return { status: "UNAVAILABLE", reason, publicFacts: false };
}

function decodePolicyEvidence(record: Record<string, unknown>): PublicPolicyEvidenceV1 {
  const chainId = quotedUint(record.chainId, "policy.chainId");
  if (chainId === 0n) throw new Error("policy chainId must be non-zero");
  const registry = publicAddress(record.registry, "policy.registry");
  const vault = publicAddress(record.vault, "policy.vault");
  const router = publicAddress(record.router, "policy.router");
  const policyId = nonZeroBytes32(record.policyId, "policy.policyId");
  const policyVersion = Number(quotedUint(record.policyVersion, "policy.policyVersion", MAX_UINT32));
  if (policyVersion === 0) throw new Error("policy version must be non-zero");
  const policyCommitment = nonZeroBytes32(record.policyCommitment, "policy.policyCommitment");
  const schema = nonZeroBytes32(record.schema, "policy.schema");
  if (schema.toLowerCase() !== POLICY_SCHEMA_V1.toLowerCase()) throw new Error("unsupported policy schema");
  const extensionId = nonZeroBytes32(record.extensionId, "policy.extensionId");
  const codeVersion = nonZeroBytes32(record.codeVersion, "policy.codeVersion");
  const machineIds = tupleBytes32(record.machineIds, "policy.machineIds");
  const keyFingerprints = tupleBytes32(record.keyFingerprints, "policy.keyFingerprints");
  if (new Set(machineIds.map((value) => value.toLowerCase())).size !== 3 || new Set(keyFingerprints.map((value) => value.toLowerCase())).size !== 3) {
    throw new Error("policy machine/key set must be distinct");
  }
  const custodyThreshold = Number(quotedUint(record.custodyThreshold, "policy.custodyThreshold", MAX_UINT8));
  const resultThreshold = Number(quotedUint(record.resultThreshold, "policy.resultThreshold", MAX_UINT8));
  const custodyReceiptBitmap = Number(quotedUint(record.custodyReceiptBitmap, "policy.custodyReceiptBitmap", 7n));
  if (custodyThreshold !== 3 || resultThreshold !== 2 || custodyReceiptBitmap !== 7) throw new Error("policy threshold evidence invalid");
  return { chainId, registry, vault, router, policyId, policyVersion, policyCommitment, schema, extensionId, codeVersion,
    machineIds, keyFingerprints, custodyThreshold, resultThreshold, custodyReceiptBitmap };
}

function encodePolicyEvidence(policy: PublicPolicyEvidenceV1): PublicPolicyEvidenceWireV1 {
  return { chainId: policy.chainId.toString(), registry: policy.registry, vault: policy.vault, router: policy.router,
    policyId: policy.policyId, policyVersion: policy.policyVersion.toString(), policyCommitment: policy.policyCommitment,
    schema: policy.schema, extensionId: policy.extensionId, codeVersion: policy.codeVersion, machineIds: policy.machineIds,
    keyFingerprints: policy.keyFingerprints, custodyThreshold: policy.custodyThreshold.toString(), resultThreshold: policy.resultThreshold.toString(),
    custodyReceiptBitmap: policy.custodyReceiptBitmap.toString() };
}

function decodeConservation(value: unknown): PublicConservationEvidenceV1 {
  const record = objectWithFields(value, CONSERVATION_FIELDS, "conservation");
  if (record.conservationAssertion !== true) throw new Error("conservation assertion must be true");
  const deposited = quotedUint(record.deposited, "conservation.deposited");
  const available = quotedUint(record.available, "conservation.available");
  const reserved = quotedUint(record.reserved, "conservation.reserved");
  const spent = quotedUint(record.spent, "conservation.spent");
  const withdrawn = quotedUint(record.withdrawn, "conservation.withdrawn");
  const refunded = quotedUint(record.refunded, "conservation.refunded");
  const accounted = [available, reserved, spent, withdrawn, refunded].reduce((sum, value) => {
    const result = sum + value;
    if (result > MAX_UINT256) throw new Error("conservation sum overflow");
    return result;
  }, 0n);
  if (accounted !== deposited) throw new Error("conservation assertion mismatch");
  return { deposited, available, reserved, spent, withdrawn, refunded, conservationAssertion: true };
}

function encodeConservation(conservation: PublicConservationEvidenceV1): PublicConservationEvidenceWireV1 {
  return { deposited: conservation.deposited.toString(), available: conservation.available.toString(), reserved: conservation.reserved.toString(),
    spent: conservation.spent.toString(), withdrawn: conservation.withdrawn.toString(), refunded: conservation.refunded.toString(), conservationAssertion: true };
}

function validateExecutionStatus(request: PublicRequestSnapshotV1, status: AuditExecutionStatus, transactionHash: Hex): void {
  const executed = transactionHash !== zeroHash;
  if (status === "EXECUTED" && (request.status !== "EXECUTED" || !executed)) throw new Error("execution evidence invalid");
  if (status !== "EXECUTED" && executed) throw new Error("unexpected execution transaction");
  if (status === "DENIED" && request.status !== "DENIED") throw new Error("denied execution status drift");
  if (status === "NOT_EXECUTED" && request.status !== "ALLOWED") throw new Error("pending execution status drift");
  if (status === "EXPIRED" && request.status !== "EXPIRED") throw new Error("expired execution status drift");
  if (status === "CANCELLED" && request.status !== "CANCELLED") throw new Error("cancelled execution status drift");
}

function objectWithFields(value: unknown, allowed: ReadonlySet<string>, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new Error(`unknown public ${label} field: ${key}`);
  for (const key of allowed) if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`missing public ${label} field: ${key}`);
  return record;
}

function quotedUint(value: unknown, label: string, max: bigint = MAX_UINT256): bigint {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new Error(`${label} must be a quoted unsigned decimal`);
  const parsed = BigInt(value);
  if (parsed > max) throw new Error(`${label} exceeds supported range`);
  return parsed;
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

function pairBytes32(value: unknown, label: string): [Hex, Hex] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`${label} must contain two bytes32 values`);
  return [nonZeroBytes32(value[0], `${label}[0]`), nonZeroBytes32(value[1], `${label}[1]`)];
}

function publicAddress(value: unknown, label: string): string {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) throw new Error(`${label} must be a non-zero address`);
  return getAddress(value);
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, label: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) throw new Error(`${label} is unsupported`);
  return value as T;
}
