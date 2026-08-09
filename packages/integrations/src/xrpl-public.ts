import type { Hex } from "@xrp-payguard/protocol";
import { isValidXrplClassicAddress } from "./xrpl-address.js";

const MAX_UINT32 = (1n << 32n) - 1n;
const MAX_UINT64 = (1n << 64n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_SAFE_LEDGER_INDEX = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_MEMO_BYTES = 4_096;
const MAX_MEMOS = 256;
const HEX_HASH = /^[0-9a-fA-F]{64}$/;
const HEX_BYTES = /^[0-9a-fA-F]*$/;

export const XRPL_PUBLIC_API_VERSION = 2 as const;
export const XRPL_VALIDATED_LEDGER = "validated" as const;

export type XrplPublicRequest =
  | {
      command: "account_info";
      account: string;
      ledger_index: typeof XRPL_VALIDATED_LEDGER;
      api_version: typeof XRPL_PUBLIC_API_VERSION;
    }
  | {
      command: "tx";
      transaction: string;
      binary: false;
      api_version: typeof XRPL_PUBLIC_API_VERSION;
      min_ledger?: number;
      max_ledger?: number;
    }
  | {
      command: "ledger";
      ledger_index: typeof XRPL_VALIDATED_LEDGER;
      transactions: false;
      expand: false;
      api_version: typeof XRPL_PUBLIC_API_VERSION;
    };

export interface XrplPublicReadTransport {
  request(payload: XrplPublicRequest): Promise<unknown>;
}

export type XrplPublicReadFailure = "INVALID_INPUT" | "UNAVAILABLE" | "RPC_ERROR" | "UNVALIDATED" | "MALFORMED";

export class XrplPublicReadError extends Error {
  constructor(readonly reason: XrplPublicReadFailure, message: string) {
    super(message);
    this.name = "XrplPublicReadError";
  }
}

export interface XrplAccountCheckpointV1 {
  account: string;
  balanceDrops: bigint;
  sequence: bigint;
  ledgerIndex: bigint;
  validated: true;
}

export interface XrplLedgerCheckpointV1 {
  ledgerHash: Hex;
  ledgerIndex: bigint;
  validated: true;
}

export interface XrplValidatedPaymentV1 {
  txHash: Hex;
  source: string;
  destination: string;
  amountDrops: bigint;
  ledgerIndex: bigint;
  memoData?: Hex;
  destinationTag?: bigint;
  result: "tesSUCCESS";
  validated: true;
}

interface RecordLike {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(reason: XrplPublicReadFailure, message: string): never {
  throw new XrplPublicReadError(reason, message);
}

function normalizeHash(value: unknown, label: string): Hex {
  if (typeof value !== "string") fail("MALFORMED", `${label} is malformed`);
  const withoutPrefix = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
  if (!HEX_HASH.test(withoutPrefix) || BigInt(`0x${withoutPrefix}`) === 0n) fail("MALFORMED", `${label} is malformed`);
  return `0x${withoutPrefix.toLowerCase()}` as Hex;
}

function normalizeUint(value: unknown, max: bigint, label: string): bigint {
  let parsed: bigint;
  if (typeof value === "bigint") parsed = value;
  else if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) parsed = BigInt(value);
  else if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) parsed = BigInt(value);
  else fail("MALFORMED", `${label} is malformed`);
  if (parsed < 0n || parsed > max) fail("MALFORMED", `${label} is out of range`);
  return parsed;
}

function normalizeAccount(value: unknown, label: string): string {
  if (typeof value !== "string" || !isValidXrplClassicAddress(value)) fail("MALFORMED", `${label} is malformed`);
  return value;
}

function normalizeMemoData(value: unknown): Hex {
  if (typeof value !== "string") fail("MALFORMED", "XRPL memo data is malformed");
  const withoutPrefix = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
  if (withoutPrefix.length % 2 !== 0 || !HEX_BYTES.test(withoutPrefix) || withoutPrefix.length / 2 > MAX_MEMO_BYTES) {
    fail("MALFORMED", "XRPL memo data is malformed or oversized");
  }
  return `0x${withoutPrefix.toLowerCase()}` as Hex;
}

function responseResult(response: unknown): RecordLike {
  if (!isRecord(response)) fail("RPC_ERROR", "XRPL public response is unavailable");
  if (response.status !== "success") fail("RPC_ERROR", "XRPL public request failed");
  if (!isRecord(response.result)) fail("RPC_ERROR", "XRPL public response is malformed");
  return response.result;
}

async function requestResult(transport: XrplPublicReadTransport, request: XrplPublicRequest): Promise<RecordLike> {
  let response: unknown;
  try {
    response = await transport.request(request);
  } catch {
    fail("UNAVAILABLE", `XRPL ${request.command} read unavailable`);
  }
  return responseResult(response);
}

function requireValidated(result: RecordLike): void {
  if (result.validated !== true) fail("UNVALIDATED", "XRPL response is not validated");
}

export async function readValidatedXrplAccountInfo(
  transport: XrplPublicReadTransport,
  account: string,
): Promise<XrplAccountCheckpointV1> {
  const normalizedAccount = normalizeAccount(account, "XRPL account");
  const result = await requestResult(transport, {
    command: "account_info",
    account: normalizedAccount,
    ledger_index: XRPL_VALIDATED_LEDGER,
    api_version: XRPL_PUBLIC_API_VERSION,
  });
  requireValidated(result);
  if (!isRecord(result.account_data)) fail("MALFORMED", "XRPL account data is missing");
  const accountData = result.account_data;
  if (accountData.Account !== normalizedAccount) fail("MALFORMED", "XRPL account response drift");
  return {
    account: normalizedAccount,
    balanceDrops: normalizeUint(accountData.Balance, MAX_UINT256, "XRPL account balance"),
    sequence: normalizeUint(accountData.Sequence, MAX_UINT32, "XRPL account sequence"),
    ledgerIndex: normalizeUint(result.ledger_index, MAX_UINT64, "XRPL account ledger index"),
    validated: true,
  };
}

export async function readValidatedXrplLedger(
  transport: XrplPublicReadTransport,
): Promise<XrplLedgerCheckpointV1> {
  const result = await requestResult(transport, {
    command: "ledger",
    ledger_index: XRPL_VALIDATED_LEDGER,
    transactions: false,
    expand: false,
    api_version: XRPL_PUBLIC_API_VERSION,
  });
  requireValidated(result);
  const ledgerIndex = normalizeUint(result.ledger_index, MAX_UINT64, "XRPL ledger index");
  const ledgerHash = normalizeHash(result.ledger_hash, "XRPL ledger hash");
  if (isRecord(result.ledger)) {
    if (result.ledger.ledger_index !== undefined
      && normalizeUint(result.ledger.ledger_index, MAX_UINT64, "XRPL nested ledger index") !== ledgerIndex) {
      fail("MALFORMED", "XRPL ledger response drift");
    }
    if (result.ledger.ledger_hash !== undefined
      && normalizeHash(result.ledger.ledger_hash, "XRPL nested ledger hash").toLowerCase() !== ledgerHash.toLowerCase()) {
      fail("MALFORMED", "XRPL ledger response drift");
    }
  }
  return { ledgerHash, ledgerIndex, validated: true };
}

export async function readValidatedXrplPayment(
  transport: XrplPublicReadTransport,
  transactionHash: string,
  bounds?: { minLedgerIndex?: bigint; maxLedgerIndex?: bigint },
): Promise<XrplValidatedPaymentV1> {
  const txHash = normalizeHash(transactionHash, "XRPL transaction hash");
  const minLedgerIndex = bounds?.minLedgerIndex;
  const maxLedgerIndex = bounds?.maxLedgerIndex;
  if (minLedgerIndex !== undefined && (minLedgerIndex < 0n || minLedgerIndex > MAX_UINT64)) {
    fail("INVALID_INPUT", "XRPL minimum ledger index is invalid");
  }
  if (maxLedgerIndex !== undefined && (maxLedgerIndex < 0n || maxLedgerIndex > MAX_UINT64)) {
    fail("INVALID_INPUT", "XRPL maximum ledger index is invalid");
  }
  if (minLedgerIndex !== undefined && minLedgerIndex > MAX_SAFE_LEDGER_INDEX) {
    fail("INVALID_INPUT", "XRPL minimum ledger index is not JSON-safe");
  }
  if (maxLedgerIndex !== undefined && maxLedgerIndex > MAX_SAFE_LEDGER_INDEX) {
    fail("INVALID_INPUT", "XRPL maximum ledger index is not JSON-safe");
  }
  if ((minLedgerIndex === undefined) !== (maxLedgerIndex === undefined)
    || (minLedgerIndex !== undefined && maxLedgerIndex !== undefined && maxLedgerIndex < minLedgerIndex)
    || (minLedgerIndex !== undefined && maxLedgerIndex !== undefined && maxLedgerIndex - minLedgerIndex > 1_000n)) {
    fail("INVALID_INPUT", "XRPL ledger search range is invalid");
  }
  const request: XrplPublicRequest = {
    command: "tx",
    transaction: txHash.slice(2).toUpperCase(),
    binary: false,
    api_version: XRPL_PUBLIC_API_VERSION,
    ...(minLedgerIndex !== undefined && maxLedgerIndex !== undefined
      ? { min_ledger: Number(minLedgerIndex), max_ledger: Number(maxLedgerIndex) }
      : {}),
  };
  const result = await requestResult(transport, request);
  requireValidated(result);
  const responseHash = normalizeHash(result.hash, "XRPL transaction hash");
  if (responseHash.toLowerCase() !== txHash.toLowerCase() || !isRecord(result.tx_json)) {
    fail("MALFORMED", "XRPL transaction response drift");
  }
  const transaction = result.tx_json;
  if (transaction.hash !== undefined
    && normalizeHash(transaction.hash, "XRPL transaction JSON hash").toLowerCase() !== txHash.toLowerCase()) {
    fail("MALFORMED", "XRPL transaction response drift");
  }
  if (transaction.TransactionType !== "Payment") fail("MALFORMED", "XRPL transaction is not a Payment");
  const source = normalizeAccount(transaction.Account, "XRPL Payment source");
  const destination = normalizeAccount(transaction.Destination, "XRPL Payment destination");
  const amount = transaction.Amount ?? transaction.DeliverMax;
  if (amount === undefined || typeof amount !== "string" || !/^(0|[1-9][0-9]*)$/.test(amount)) {
    fail("MALFORMED", "XRPL Payment amount is not native XRP");
  }
  const amountDrops = normalizeUint(amount, MAX_UINT256, "XRPL Payment amount");
  if (amountDrops === 0n) fail("MALFORMED", "XRPL Payment amount is zero");
  if (result.ledger_index === undefined) fail("MALFORMED", "XRPL Payment ledger index is missing");
  const ledgerIndex = normalizeUint(result.ledger_index, MAX_UINT64, "XRPL Payment ledger index");
  if (minLedgerIndex !== undefined && maxLedgerIndex !== undefined
    && (ledgerIndex < minLedgerIndex || ledgerIndex > maxLedgerIndex)) {
    fail("MALFORMED", "XRPL Payment is outside the requested ledger range");
  }
  const meta = result.meta;
  if (!isRecord(meta) || meta.TransactionResult !== "tesSUCCESS") fail("MALFORMED", "XRPL Payment did not succeed");
  const payment: XrplValidatedPaymentV1 = {
    txHash,
    source,
    destination,
    amountDrops,
    ledgerIndex,
    result: "tesSUCCESS",
    validated: true,
  };
  if (transaction.DestinationTag !== undefined) {
    payment.destinationTag = normalizeUint(transaction.DestinationTag, MAX_UINT32, "XRPL destination tag");
  }
  if (transaction.Memos !== undefined) {
    if (!Array.isArray(transaction.Memos) || transaction.Memos.length > MAX_MEMOS) fail("MALFORMED", "XRPL memos are malformed or oversized");
    const firstMemo = transaction.Memos[0];
    if (firstMemo !== undefined) {
      if (!isRecord(firstMemo) || !isRecord(firstMemo.Memo)) fail("MALFORMED", "XRPL first memo is malformed");
      const memoData = firstMemo.Memo.MemoData;
      if (memoData !== undefined) payment.memoData = normalizeMemoData(memoData);
    }
  }
  return payment;
}
