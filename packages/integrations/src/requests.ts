import {
  ACTION_FTESTXRP_TRANSFER,
  actionRequestHash,
  ZERO_BYTES32,
  type ActionRequestV1,
  type Hex,
  type PublicReasonClass,
} from "@xrp-payguard/protocol";
import { getAddress, isAddress, zeroAddress, zeroHash } from "viem";

const MAX_UINT32 = (1n << 32n) - 1n;
const MAX_UINT64 = (1n << 64n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

export type PublicRequestStatus = "PENDING" | "ALLOWED" | "DENIED" | "EXECUTED" | "EXPIRED" | "CANCELLED";
export type PublicRequestDecision = "PENDING" | "ALLOW" | "DENY";
export type PublicRequestReadiness =
  | "WAITING_FOR_SLOT"
  | "WAITING_FOR_THRESHOLD"
  | "READY_TO_EXECUTE"
  | "DENIED"
  | "EXECUTED"
  | "EXPIRED"
  | "CANCELLED";

export type RequestUnavailableReason =
  | "RPC_UNCONFIGURED"
  | "RPC_UNAVAILABLE"
  | "SNAPSHOT_UNFINALIZED"
  | "SNAPSHOT_INVALID";

export interface PublicRequestSnapshotV1 {
  chainId: bigint;
  registry: Hex;
  vault: Hex;
  router: Hex;
  policyId: Hex;
  policyVersion: number;
  policyCommitment: Hex;
  requestId: Hex;
  requestNonce: bigint;
  attempt: number;
  requester: Hex;
  target: Hex;
  asset: Hex;
  actionType: Hex;
  amount: bigint;
  scheduleSlot: bigint;
  occurrence: number;
  spendCheckpoint: Hex;
  balanceCheckpoint: Hex;
  inputCommitment: Hex;
  createdAt: bigint;
  graceDeadline: bigint;
  expiry: bigint;
  status: PublicRequestStatus;
  requestHash: Hex;
  approvedDigest: Hex;
  matchingCount: number;
  decision: PublicRequestDecision;
  publicReasonClass: PublicReasonClass | null;
  approvedAmount: bigint;
  approvedCheckpoint: Hex;
  approvedNonce: Hex;
  approvedAttempt: number;
  approvedIssuedAt: bigint;
  approvedExpiry: bigint;
}

export interface PublicRequestSnapshotWireV1 {
  chainId: string;
  registry: string;
  vault: string;
  router: string;
  policyId: Hex;
  policyVersion: string;
  policyCommitment: Hex;
  requestId: Hex;
  requestNonce: string;
  attempt: string;
  requester: string;
  target: string;
  asset: string;
  actionType: Hex;
  amount: string;
  scheduleSlot: string;
  occurrence: string;
  spendCheckpoint: Hex;
  balanceCheckpoint: Hex;
  inputCommitment: Hex;
  createdAt: string;
  graceDeadline: string;
  expiry: string;
  status: PublicRequestStatus;
  requestHash: Hex;
  approvedDigest: Hex;
  matchingCount: string;
  decision: PublicRequestDecision;
  publicReasonClass: PublicReasonClass | null;
  approvedAmount: string;
  approvedCheckpoint: Hex;
  approvedNonce: Hex;
  approvedAttempt: string;
  approvedIssuedAt: string;
  approvedExpiry: string;
}

export interface PublicRequestAvailableState {
  status: PublicRequestStatus;
  readiness: PublicRequestReadiness;
  snapshot: PublicRequestSnapshotV1;
  publicFacts: true;
}

export interface PublicRequestUnavailableState {
  status: "UNAVAILABLE";
  reason: RequestUnavailableReason;
  publicFacts: false;
}

export type PublicRequestReadState = PublicRequestAvailableState | PublicRequestUnavailableState;

const WIRE_FIELDS = new Set<keyof PublicRequestSnapshotWireV1>([
  "chainId", "registry", "vault", "router", "policyId", "policyVersion", "policyCommitment", "requestId",
  "requestNonce", "attempt", "requester", "target", "asset", "actionType", "amount", "scheduleSlot", "occurrence",
  "spendCheckpoint", "balanceCheckpoint", "inputCommitment", "createdAt", "graceDeadline", "expiry", "status", "requestHash",
  "approvedDigest", "matchingCount", "decision", "publicReasonClass", "approvedAmount", "approvedCheckpoint", "approvedNonce",
  "approvedAttempt", "approvedIssuedAt", "approvedExpiry",
]);

const STATUSES = new Set<PublicRequestStatus>(["PENDING", "ALLOWED", "DENIED", "EXECUTED", "EXPIRED", "CANCELLED"]);
const DECISIONS = new Set<PublicRequestDecision>(["PENDING", "ALLOW", "DENY"]);
const REASONS = new Set<PublicReasonClass>([
  "OK", "POLICY_DENIED", "MALFORMED", "WRONG_DOMAIN", "STALE_INPUT", "DEPENDENCY_UNAVAILABLE", "EXPIRED", "STOPPED",
  "INSUFFICIENT_BALANCE", "CAP_EXCEEDED", "OCCURRENCE_EXCEEDED", "TARGET_DENIED", "REQUESTER_DENIED", "ACTION_DENIED",
  "FTSO_INVALID", "COOLDOWN", "FDC_INVALID",
]);

export function decodePublicRequestSnapshot(value: unknown): PublicRequestSnapshotV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("request snapshot must be an object");
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!WIRE_FIELDS.has(key as keyof PublicRequestSnapshotWireV1)) throw new Error(`unknown public request field: ${key}`);
  }
  const required: readonly (keyof PublicRequestSnapshotWireV1)[] = [
    "chainId", "registry", "vault", "router", "policyId", "policyVersion", "policyCommitment", "requestId", "requestNonce",
    "attempt", "requester", "target", "asset", "actionType", "amount", "scheduleSlot", "occurrence", "spendCheckpoint",
    "balanceCheckpoint", "inputCommitment", "createdAt", "graceDeadline", "expiry", "status", "requestHash", "approvedDigest",
    "matchingCount", "decision", "publicReasonClass", "approvedAmount", "approvedCheckpoint", "approvedNonce", "approvedAttempt",
    "approvedIssuedAt", "approvedExpiry",
  ];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`missing public request field: ${key}`);
  }

  const chainId = quotedUint(record.chainId, "chainId");
  if (chainId === 0n) throw new Error("chainId must be non-zero");
  const registry = publicAddress(record.registry, "registry");
  const vault = publicAddress(record.vault, "vault");
  const router = publicAddress(record.router, "router");
  const policyId = nonZeroBytes32(record.policyId, "policyId");
  const policyVersion = Number(quotedUint(record.policyVersion, "policyVersion", MAX_UINT32));
  if (policyVersion === 0) throw new Error("policyVersion must be non-zero");
  const policyCommitment = nonZeroBytes32(record.policyCommitment, "policyCommitment");
  const requestId = nonZeroBytes32(record.requestId, "requestId");
  const requestNonce = quotedUint(record.requestNonce, "requestNonce");
  if (requestNonce === 0n) throw new Error("requestNonce must be non-zero");
  const attempt = Number(quotedUint(record.attempt, "attempt", MAX_UINT32));
  const requester = publicAddress(record.requester, "requester");
  const target = publicAddress(record.target, "target");
  const asset = publicAddress(record.asset, "asset");
  const actionType = nonZeroBytes32(record.actionType, "actionType");
  if (actionType.toLowerCase() !== ACTION_FTESTXRP_TRANSFER.toLowerCase()) throw new Error("unsupported public action type");
  const amount = quotedUint(record.amount, "amount");
  if (amount === 0n) throw new Error("amount must be non-zero");
  const scheduleSlot = quotedUint(record.scheduleSlot, "scheduleSlot", MAX_UINT64);
  const occurrence = Number(quotedUint(record.occurrence, "occurrence", MAX_UINT32));
  if (occurrence === 0) throw new Error("occurrence must be non-zero");
  const spendCheckpoint = nonZeroBytes32(record.spendCheckpoint, "spendCheckpoint");
  const balanceCheckpoint = nonZeroBytes32(record.balanceCheckpoint, "balanceCheckpoint");
  const inputCommitment = bytes32(record.inputCommitment, "inputCommitment");
  const createdAt = quotedUint(record.createdAt, "createdAt", MAX_UINT64);
  const graceDeadline = quotedUint(record.graceDeadline, "graceDeadline", MAX_UINT64);
  const expiry = quotedUint(record.expiry, "expiry", MAX_UINT64);
  if (createdAt > graceDeadline || graceDeadline > expiry) throw new Error("request time window invalid");
  const status = enumValue(record.status, STATUSES, "status");
  const requestHash = nonZeroBytes32(record.requestHash, "requestHash");
  const approvedDigest = bytes32(record.approvedDigest, "approvedDigest");
  const matchingCount = Number(quotedUint(record.matchingCount, "matchingCount", 3n));
  const decision = enumValue(record.decision, DECISIONS, "decision");
  const publicReasonClass = publicReason(record.publicReasonClass);
  const approvedAmount = quotedUint(record.approvedAmount, "approvedAmount");
  const approvedCheckpoint = bytes32(record.approvedCheckpoint, "approvedCheckpoint");
  const approvedNonce = bytes32(record.approvedNonce, "approvedNonce");
  const approvedAttempt = Number(quotedUint(record.approvedAttempt, "approvedAttempt", MAX_UINT32));
  const approvedIssuedAt = quotedUint(record.approvedIssuedAt, "approvedIssuedAt", MAX_UINT64);
  const approvedExpiry = quotedUint(record.approvedExpiry, "approvedExpiry", MAX_UINT64);

  const request: ActionRequestV1 = {
    chainId, registry: registry as Hex, vault: vault as Hex, router: router as Hex, policyId, policyVersion,
    policyCommitment, requestId, requestNonce, attempt, requester: requester as Hex, target: target as Hex,
    asset: asset as Hex, actionType, amount, scheduleSlot, occurrence, spendCheckpoint, balanceCheckpoint, inputCommitment,
    createdAt, graceDeadline, expiry,
  };
  if (requestHash.toLowerCase() !== actionRequestHash(request).toLowerCase()) throw new Error("request hash mismatch");
  validateStatusAndDecision({
    status, decision, publicReasonClass, matchingCount, approvedDigest, approvedAmount, approvedCheckpoint, approvedNonce,
    approvedAttempt, approvedIssuedAt, approvedExpiry, request,
  });

  return {
    ...request, registry, vault, router, requester, target, asset, status, requestHash, approvedDigest, matchingCount, decision,
    publicReasonClass, approvedAmount, approvedCheckpoint, approvedNonce, approvedAttempt, approvedIssuedAt, approvedExpiry,
  };
}

export function encodePublicRequestSnapshot(snapshot: PublicRequestSnapshotV1): PublicRequestSnapshotWireV1 {
  const wire: PublicRequestSnapshotWireV1 = {
    chainId: snapshot.chainId.toString(), registry: snapshot.registry, vault: snapshot.vault, router: snapshot.router,
    policyId: snapshot.policyId, policyVersion: snapshot.policyVersion.toString(), policyCommitment: snapshot.policyCommitment,
    requestId: snapshot.requestId, requestNonce: snapshot.requestNonce.toString(), attempt: snapshot.attempt.toString(),
    requester: snapshot.requester, target: snapshot.target, asset: snapshot.asset, actionType: snapshot.actionType,
    amount: snapshot.amount.toString(), scheduleSlot: snapshot.scheduleSlot.toString(), occurrence: snapshot.occurrence.toString(),
    spendCheckpoint: snapshot.spendCheckpoint, balanceCheckpoint: snapshot.balanceCheckpoint, inputCommitment: snapshot.inputCommitment,
    createdAt: snapshot.createdAt.toString(), graceDeadline: snapshot.graceDeadline.toString(), expiry: snapshot.expiry.toString(),
    status: snapshot.status, requestHash: snapshot.requestHash, approvedDigest: snapshot.approvedDigest,
    matchingCount: snapshot.matchingCount.toString(), decision: snapshot.decision, publicReasonClass: snapshot.publicReasonClass,
    approvedAmount: snapshot.approvedAmount.toString(), approvedCheckpoint: snapshot.approvedCheckpoint, approvedNonce: snapshot.approvedNonce,
    approvedAttempt: snapshot.approvedAttempt.toString(), approvedIssuedAt: snapshot.approvedIssuedAt.toString(), approvedExpiry: snapshot.approvedExpiry.toString(),
  };
  decodePublicRequestSnapshot(wire);
  return wire;
}

export function publicRequestReadiness(snapshot: PublicRequestSnapshotV1, now: bigint): PublicRequestReadiness {
  if (now < 0n || now > MAX_UINT64) throw new Error("request time invalid");
  if (snapshot.status === "PENDING") {
    if (now > snapshot.expiry) return "EXPIRED";
    return snapshot.scheduleSlot > 0n && now < snapshot.scheduleSlot ? "WAITING_FOR_SLOT" : "WAITING_FOR_THRESHOLD";
  }
  if (snapshot.status === "ALLOWED") return now > snapshot.approvedExpiry ? "EXPIRED" : "READY_TO_EXECUTE";
  if (snapshot.status === "DENIED") return "DENIED";
  if (snapshot.status === "EXECUTED") return "EXECUTED";
  if (snapshot.status === "CANCELLED") return "CANCELLED";
  return "EXPIRED";
}

export function publicRequestReadState(snapshot: PublicRequestSnapshotV1, now: bigint): PublicRequestAvailableState {
  const canonical = decodePublicRequestSnapshot(encodePublicRequestSnapshot(snapshot));
  return { status: canonical.status, readiness: publicRequestReadiness(canonical, now), snapshot: canonical, publicFacts: true };
}

export function unavailableRequestState(reason: RequestUnavailableReason = "RPC_UNCONFIGURED"): PublicRequestUnavailableState {
  return { status: "UNAVAILABLE", reason, publicFacts: false };
}

function validateStatusAndDecision(input: {
  status: PublicRequestStatus;
  decision: PublicRequestDecision;
  publicReasonClass: PublicReasonClass | null;
  matchingCount: number;
  approvedDigest: Hex;
  approvedAmount: bigint;
  approvedCheckpoint: Hex;
  approvedNonce: Hex;
  approvedAttempt: number;
  approvedIssuedAt: bigint;
  approvedExpiry: bigint;
  request: ActionRequestV1;
}): void {
  const { status, decision, publicReasonClass, matchingCount, approvedDigest, approvedAmount, approvedCheckpoint,
    approvedNonce, approvedAttempt, approvedIssuedAt, approvedExpiry, request } = input;
  if (status === "PENDING" && decision !== "PENDING") throw new Error("pending request decision drift");
  if ((status === "ALLOWED" || status === "EXECUTED") && decision !== "ALLOW") throw new Error("allowed request decision drift");
  if (status === "DENIED" && decision !== "DENY") throw new Error("denied request decision drift");
  if ((status === "EXPIRED" || status === "CANCELLED") && decision === "DENY") throw new Error("terminal request decision drift");
  if (decision === "PENDING") {
    if (matchingCount > 1 || approvedDigest !== zeroHash || publicReasonClass !== null || approvedAmount !== 0n
      || approvedCheckpoint !== zeroHash || approvedNonce !== zeroHash || approvedAttempt !== 0 || approvedIssuedAt !== 0n || approvedExpiry !== 0n) {
      throw new Error("pending request approval fields must be empty");
    }
    return;
  }
  if (matchingCount < 2 || approvedDigest === zeroHash || approvedNonce.toLowerCase() !== request.requestId.toLowerCase()
    || approvedAttempt !== request.attempt || approvedExpiry !== request.expiry || approvedIssuedAt > approvedExpiry) {
    throw new Error("threshold approval fields invalid");
  }
  if (decision === "ALLOW") {
    if (publicReasonClass !== "OK" || approvedAmount !== request.amount || approvedCheckpoint === zeroHash) throw new Error("allow approval fields invalid");
  } else if (publicReasonClass === null || publicReasonClass === "OK" || approvedAmount !== 0n
    || approvedCheckpoint.toLowerCase() !== request.spendCheckpoint.toLowerCase()) {
    throw new Error("deny approval fields invalid");
  }
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
  if (parsed === ZERO_BYTES32 || parsed === zeroHash) throw new Error(`${label} must be non-zero bytes32`);
  return parsed;
}

function publicAddress(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) throw new Error(`${label} must be a non-zero address`);
  return getAddress(value) as Hex;
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, label: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) throw new Error(`${label} is unsupported`);
  return value as T;
}

function publicReason(value: unknown): PublicReasonClass | null {
  if (value === null) return null;
  return enumValue(value, REASONS, "publicReasonClass");
}
