import {
  decodePublicRequestSnapshot,
  encodePublicRequestSnapshot,
  type PublicRequestSnapshotV1,
  type PublicRequestSnapshotWireV1,
} from "./requests.js";
import { encodeAbiParameters, getAddress, isAddress, keccak256, stringToHex, zeroAddress, zeroHash, type Hex } from "viem";

const MAX_UINT64 = (1n << 64n) - 1n;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

export type PublicPayeeSettlementStatus = "PENDING" | "READY" | "SETTLED" | "DENIED" | "EXPIRED" | "CANCELLED";
export type PayeeUnavailableReason = "RPC_UNCONFIGURED" | "RPC_UNAVAILABLE" | "RECEIPT_UNFINALIZED" | "RECEIPT_INVALID";

export interface PublicPayeeReceiptV1 {
  chainId: bigint;
  router: Hex;
  vault: Hex;
  requestId: Hex;
  requestHash: Hex;
  payee: Hex;
  asset: Hex;
  expectedAmount: bigint;
  expectedAt: bigint;
  expiry: bigint;
  status: PublicPayeeSettlementStatus;
  settlementTransactionHash: Hex;
  settlementCheckpoint: Hex;
  settledAt: bigint;
  receiptHash: Hex;
  request: PublicRequestSnapshotV1;
}

export interface PublicPayeeReceiptWireV1 {
  chainId: string;
  router: Hex;
  vault: Hex;
  requestId: Hex;
  requestHash: Hex;
  payee: Hex;
  asset: Hex;
  expectedAmount: string;
  expectedAt: string;
  expiry: string;
  status: PublicPayeeSettlementStatus;
  settlementTransactionHash: Hex;
  settlementCheckpoint: Hex;
  settledAt: string;
  receiptHash: Hex;
  request: PublicRequestSnapshotWireV1;
}

export interface PublicPayeeAvailableState {
  status: PublicPayeeSettlementStatus;
  receipt: PublicPayeeReceiptV1;
  publicFacts: true;
}

export interface PublicPayeeUnavailableState {
  status: "UNAVAILABLE";
  reason: PayeeUnavailableReason;
  publicFacts: false;
}

export type PublicPayeeReadState = PublicPayeeAvailableState | PublicPayeeUnavailableState;

const WIRE_FIELDS = new Set<keyof PublicPayeeReceiptWireV1>([
  "chainId", "router", "vault", "requestId", "requestHash", "payee", "asset", "expectedAmount", "expectedAt", "expiry", "status",
  "settlementTransactionHash", "settlementCheckpoint", "settledAt", "receiptHash", "request",
]);
const STATUSES = new Set<PublicPayeeSettlementStatus>(["PENDING", "READY", "SETTLED", "DENIED", "EXPIRED", "CANCELLED"]);
const STATUS_CODES: Record<PublicPayeeSettlementStatus, number> = { PENDING: 0, READY: 1, SETTLED: 2, DENIED: 3, EXPIRED: 4, CANCELLED: 5 };

export function payeeReceiptHash(receipt: Omit<PublicPayeeReceiptV1, "receiptHash" | "request">): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "address" }, { type: "bytes32" }, { type: "bytes32" },
      { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint64" }, { type: "uint64" }, { type: "uint8" },
      { type: "bytes32" }, { type: "bytes32" }, { type: "uint64" }],
    [keccak256(stringToHex("PAYGUARD_PAYEE_RECEIPT_V1")), receipt.chainId, receipt.router, receipt.vault, receipt.requestId,
      receipt.requestHash, receipt.payee, receipt.asset, receipt.expectedAmount, receipt.expectedAt, receipt.expiry,
      STATUS_CODES[receipt.status], receipt.settlementTransactionHash, receipt.settlementCheckpoint, receipt.settledAt],
  ));
}

export function decodePublicPayeeReceipt(value: unknown): PublicPayeeReceiptV1 {
  const record = objectWithFields(value, WIRE_FIELDS, "payee receipt");
  const chainId = quotedUint(record.chainId, "chainId");
  if (chainId === 0n) throw new Error("chainId must be non-zero");
  const router = publicAddress(record.router, "router");
  const vault = publicAddress(record.vault, "vault");
  const requestId = nonZeroBytes32(record.requestId, "requestId");
  const requestHash = nonZeroBytes32(record.requestHash, "requestHash");
  const payee = publicAddress(record.payee, "payee");
  const asset = publicAddress(record.asset, "asset");
  const expectedAmount = quotedUint(record.expectedAmount, "expectedAmount");
  if (expectedAmount === 0n) throw new Error("expectedAmount must be non-zero");
  const expectedAt = quotedUint(record.expectedAt, "expectedAt", MAX_UINT64);
  const expiry = quotedUint(record.expiry, "expiry", MAX_UINT64);
  if (expectedAt > expiry) throw new Error("payee time window invalid");
  const status = enumValue(record.status, STATUSES, "status");
  const settlementTransactionHash = bytes32(record.settlementTransactionHash, "settlementTransactionHash");
  const settlementCheckpoint = bytes32(record.settlementCheckpoint, "settlementCheckpoint");
  const settledAt = quotedUint(record.settledAt, "settledAt", MAX_UINT64);
  const receiptHash = nonZeroBytes32(record.receiptHash, "receiptHash");
  const request = decodePublicRequestSnapshot(record.request);
  if (request.chainId !== chainId || request.router.toLowerCase() !== router.toLowerCase() || request.vault.toLowerCase() !== vault.toLowerCase()
    || request.requestId.toLowerCase() !== requestId.toLowerCase() || request.requestHash.toLowerCase() !== requestHash.toLowerCase()
    || request.target.toLowerCase() !== payee.toLowerCase() || request.asset.toLowerCase() !== asset.toLowerCase() || request.amount !== expectedAmount
    || request.expiry !== expiry) throw new Error("payee receipt/request mismatch");
  const expectedStatus = requestStatus(request);
  const derivedExpectedAt = request.scheduleSlot > 0n ? request.scheduleSlot : request.createdAt;
  if (expectedAt !== derivedExpectedAt) throw new Error("payee expected time drift");
  if (status !== expectedStatus) throw new Error("payee settlement status drift");
  const settled = status === "SETTLED";
  if (settled !== (settlementTransactionHash !== zeroHash) || settled !== (settlementCheckpoint !== zeroHash)
    || settled !== (settledAt !== 0n) || (settled && (settlementCheckpoint.toLowerCase() !== request.approvedCheckpoint.toLowerCase() || settledAt > expiry))) {
    throw new Error("payee settlement receipt invalid");
  }
  const expectedHash = payeeReceiptHash({ chainId, router, vault, requestId, requestHash, payee, asset, expectedAmount, expectedAt, expiry,
    status, settlementTransactionHash, settlementCheckpoint, settledAt });
  if (receiptHash.toLowerCase() !== expectedHash.toLowerCase()) throw new Error("payee receipt hash mismatch");
  return { chainId, router, vault, requestId, requestHash, payee, asset, expectedAmount, expectedAt, expiry, status,
    settlementTransactionHash, settlementCheckpoint, settledAt, receiptHash, request };
}

export function encodePublicPayeeReceipt(receipt: PublicPayeeReceiptV1): PublicPayeeReceiptWireV1 {
  const wire: PublicPayeeReceiptWireV1 = {
    chainId: receipt.chainId.toString(), router: receipt.router, vault: receipt.vault, requestId: receipt.requestId,
    requestHash: receipt.requestHash, payee: receipt.payee, asset: receipt.asset, expectedAmount: receipt.expectedAmount.toString(),
    expectedAt: receipt.expectedAt.toString(), expiry: receipt.expiry.toString(), status: receipt.status,
    settlementTransactionHash: receipt.settlementTransactionHash, settlementCheckpoint: receipt.settlementCheckpoint,
    settledAt: receipt.settledAt.toString(), receiptHash: receipt.receiptHash, request: encodePublicRequestSnapshot(receipt.request),
  };
  decodePublicPayeeReceipt(wire);
  return wire;
}

export function publicPayeeReadState(receipt: PublicPayeeReceiptV1): PublicPayeeAvailableState {
  const canonical = decodePublicPayeeReceipt(encodePublicPayeeReceipt(receipt));
  return { status: canonical.status, receipt: canonical, publicFacts: true };
}

export function unavailablePayeeState(reason: PayeeUnavailableReason = "RPC_UNCONFIGURED"): PublicPayeeUnavailableState {
  return { status: "UNAVAILABLE", reason, publicFacts: false };
}

function requestStatus(request: PublicRequestSnapshotV1): PublicPayeeSettlementStatus {
  if (request.status === "PENDING") return "PENDING";
  if (request.status === "ALLOWED") return "READY";
  if (request.status === "EXECUTED") return "SETTLED";
  if (request.status === "DENIED") return "DENIED";
  if (request.status === "EXPIRED") return "EXPIRED";
  return "CANCELLED";
}

function objectWithFields(value: unknown, allowed: ReadonlySet<string>, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new Error(`unknown public ${label} field: ${key}`);
  for (const key of allowed) if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`missing public ${label} field: ${key}`);
  return record;
}

function quotedUint(value: unknown, label: string, max: bigint = (1n << 256n) - 1n): bigint {
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

function publicAddress(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) throw new Error(`${label} must be a non-zero address`);
  return getAddress(value) as Hex;
}

function enumValue<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) throw new Error(`${label} is unsupported`);
  return value as T;
}
