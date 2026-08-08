import { getAddress, isAddress, type Hex } from "viem";
import { isValidClassicAddress } from "xrpl";
import { FDC_XRP_PAYMENT_V1, type XrplPaymentRequestBodyV1, type XrplPaymentResponseBodyV1 } from "./triggers.js";
import { XRPL_TESTNET_SOURCE_ID } from "./fdc-request.js";

const MAX_UINT8 = (1n << 8n) - 1n;
const MAX_UINT32 = (1n << 32n) - 1n;
const MAX_UINT64 = (1n << 64n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_INT256 = (1n << 255n) - 1n;
const MIN_INT256 = -(1n << 255n);
const MAX_MEMO_BYTES = 4_096;
const MAX_MERKLE_PROOF = 256;
const MAX_RESPONSE_BYTES = 524_288;
const REQUEST_WORDS = 5;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;

export const COSTON2_FDC_DA_URL = "https://ctn2-data-availability.flare.network";
export const COSTON2_FDC_XRPL_PROOF_URL = `${COSTON2_FDC_DA_URL}/api/v0/fdc/get-proof-round-id-bytes`;

export type FdcProofFailure = "INVALID_INPUT" | "UNAVAILABLE" | "HTTP_ERROR" | "NOT_READY" | "MALFORMED" | "DRIFT";

export class FdcProofError extends Error {
  constructor(readonly reason: FdcProofFailure, message: string) {
    super(message);
    this.name = "FdcProofError";
  }
}

export interface FdcProofFetchResponse {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export type FdcProofFetch = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<FdcProofFetchResponse>;

export interface XrplPaymentFdcResponseV1 {
  attestationType: typeof FDC_XRP_PAYMENT_V1;
  sourceId: Hex;
  votingRound: bigint;
  lowestUsedTimestamp: bigint;
  requestBody: XrplPaymentRequestBodyV1;
  responseBody: XrplPaymentResponseBodyV1;
}

export interface FdcXrplPaymentProofEnvelopeV1 {
  status: "AVAILABLE";
  votingRoundId: bigint;
  requestBytes: Hex;
  response: XrplPaymentFdcResponseV1;
  merkleProof: Hex[];
}

interface RecordLike {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(reason: FdcProofFailure, message: string): never {
  throw new FdcProofError(reason, message);
}

function hex(value: unknown, label: string, bytes?: number): Hex {
  if (typeof value !== "string" || !HEX_BYTES.test(value)
    || (bytes !== undefined && (value.length - 2) / 2 !== bytes)) fail("MALFORMED", `${label} is malformed`);
  return value.toLowerCase() as Hex;
}

function bytes32(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !HEX32.test(value)) fail("MALFORMED", `${label} is malformed`);
  return value.toLowerCase() as Hex;
}

function uint(value: unknown, max: bigint, label: string): bigint {
  let parsed: bigint;
  if (typeof value === "bigint") parsed = value;
  else if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) parsed = BigInt(value);
  else if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) parsed = BigInt(value);
  else fail("MALFORMED", `${label} is malformed`);
  if (parsed < 0n || parsed > max) fail("MALFORMED", `${label} is out of range`);
  return parsed;
}

function int256(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^-?(0|[1-9][0-9]*)$/.test(value)) fail("MALFORMED", `${label} is malformed`);
  const parsed = BigInt(value);
  if (parsed < MIN_INT256 || parsed > MAX_INT256) fail("MALFORMED", `${label} is out of range`);
  return parsed;
}

function account(value: unknown, label: string): string {
  if (typeof value !== "string" || !isValidClassicAddress(value)) fail("MALFORMED", `${label} is malformed`);
  return value;
}

function word(requestBytes: Hex, index: number): string {
  return requestBytes.slice(2 + index * 64, 2 + (index + 1) * 64).toLowerCase();
}

function decodeRequestBinding(requestBytes: Hex): { attestationType: Hex; sourceId: Hex; messageIntegrityCode: Hex; transactionId: Hex; proofOwner: string } {
  if (requestBytes.length !== 2 + REQUEST_WORDS * 64) fail("INVALID_INPUT", "FDC XRPL request bytes length is invalid");
  const attestationType = `0x${word(requestBytes, 0)}` as Hex;
  const sourceId = `0x${word(requestBytes, 1)}` as Hex;
  const messageIntegrityCode = `0x${word(requestBytes, 2)}` as Hex;
  const transactionId = `0x${word(requestBytes, 3)}` as Hex;
  const ownerWord = word(requestBytes, 4);
  if (/^0+$/.test(messageIntegrityCode.slice(2))) fail("INVALID_INPUT", "FDC XRPL message integrity code is zero");
  if (/^0+$/.test(transactionId.slice(2))) fail("INVALID_INPUT", "FDC XRPL transaction ID is zero");
  if (!/^0{24}[0-9a-f]{40}$/.test(ownerWord) || /^0+$/.test(ownerWord.slice(24))) fail("INVALID_INPUT", "FDC XRPL proof owner word is invalid");
  return { attestationType, sourceId, messageIntegrityCode, transactionId, proofOwner: getAddress(`0x${ownerWord.slice(24)}`) };
}

function normalizeApiKey(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || new TextEncoder().encode(value).length > 512) {
    fail("INVALID_INPUT", "FDC DA API key is missing or oversized");
  }
  return value;
}

function defaultFetch(): FdcProofFetch {
  return async (url, init) => {
    const response = await fetch(url, init);
    return { status: response.status, headers: response.headers, json: () => response.json() };
  };
}

export function parseCoston2XrplPaymentProof(
  payload: unknown,
  input: { votingRoundId: bigint; requestBytes: Hex },
): FdcXrplPaymentProofEnvelopeV1 {
  if (input.votingRoundId <= 0n || input.votingRoundId > MAX_UINT64) fail("INVALID_INPUT", "FDC voting round is invalid");
  const requestBytes = hex(input.requestBytes, "FDC request bytes");
  const binding = decodeRequestBinding(requestBytes);
  if (binding.attestationType.toLowerCase() !== FDC_XRP_PAYMENT_V1.toLowerCase()
    || binding.sourceId.toLowerCase() !== XRPL_TESTNET_SOURCE_ID.toLowerCase()) fail("DRIFT", "FDC XRPL request type or source drift");
  if (!isRecord(payload)) fail("MALFORMED", "FDC DA response is malformed");
  if ((payload.response === undefined || payload.response === null) && (payload.proof === undefined || payload.proof === null)) fail("NOT_READY", "FDC DA proof is not ready");
  if (!isRecord(payload.response) || !Array.isArray(payload.proof)) fail("MALFORMED", "FDC DA proof envelope is incomplete");
  const response = payload.response;
  const attestationType = bytes32(response.attestationType, "FDC response attestation type");
  const sourceId = bytes32(response.sourceId, "FDC response source ID");
  if (attestationType.toLowerCase() !== binding.attestationType.toLowerCase() || sourceId.toLowerCase() !== binding.sourceId.toLowerCase()) {
    fail("DRIFT", "FDC response type or source drift");
  }
  const votingRound = uint(response.votingRound, MAX_UINT64, "FDC response voting round");
  if (votingRound !== input.votingRoundId || !isRecord(response.requestBody) || !isRecord(response.responseBody)) fail("DRIFT", "FDC response round or body drift");
  const responseTransactionId = bytes32(response.requestBody.transactionId, "FDC response transaction ID");
  const responseProofOwner = response.requestBody.proofOwner;
  if (responseTransactionId.toLowerCase() !== binding.transactionId.toLowerCase()
    || /^0x0+$/i.test(responseTransactionId)
    || typeof responseProofOwner !== "string"
    || !isAddress(responseProofOwner)
    || getAddress(responseProofOwner) !== binding.proofOwner) fail("DRIFT", "FDC response request binding drift");
  const body = response.responseBody;
  if (body.hasMemoData !== true && body.hasMemoData !== false) fail("MALFORMED", "XRPL memo flag is malformed");
  if (body.hasDestinationTag !== true && body.hasDestinationTag !== false) fail("MALFORMED", "XRPL destination tag flag is malformed");
  const firstMemoData = hex(body.firstMemoData, "XRPL first memo data");
  if (firstMemoData.length / 2 - 1 > MAX_MEMO_BYTES) fail("MALFORMED", "XRPL memo data is oversized");
  if (!body.hasMemoData && firstMemoData !== "0x") fail("MALFORMED", "XRPL memo data is present without a memo flag");
  const destinationTag = uint(body.destinationTag, MAX_UINT256, "XRPL destination tag");
  if (destinationTag > MAX_UINT32) fail("MALFORMED", "XRPL destination tag is out of range");
  if (!body.hasDestinationTag && destinationTag !== 0n) fail("MALFORMED", "XRPL destination tag is present without a tag flag");
  const status = uint(body.status, MAX_UINT8, "XRPL response status");
  if (status > 2n) fail("MALFORMED", "XRPL response status is out of range");
  const responseBody: XrplPaymentResponseBodyV1 = {
    blockNumber: uint(body.blockNumber, MAX_UINT64, "XRPL response block number"),
    blockTimestamp: uint(body.blockTimestamp, MAX_UINT64, "XRPL response block timestamp"),
    sourceAddress: account(body.sourceAddress, "XRPL response source address"),
    sourceAddressHash: bytes32(body.sourceAddressHash, "XRPL source address hash"),
    receivingAddressHash: bytes32(body.receivingAddressHash, "XRPL receiving address hash"),
    intendedReceivingAddressHash: bytes32(body.intendedReceivingAddressHash, "XRPL intended receiving address hash"),
    spentAmount: int256(body.spentAmount, "XRPL spent amount"),
    intendedSpentAmount: int256(body.intendedSpentAmount, "XRPL intended spent amount"),
    receivedAmount: int256(body.receivedAmount, "XRPL received amount"),
    intendedReceivedAmount: int256(body.intendedReceivedAmount, "XRPL intended received amount"),
    hasMemoData: body.hasMemoData,
    firstMemoData: body.hasMemoData ? firstMemoData : "0x",
    hasDestinationTag: body.hasDestinationTag,
    destinationTag,
    status: Number(status),
  };
  const lowestUsedTimestamp = uint(response.lowestUsedTimestamp, MAX_UINT64, "FDC lowest used timestamp");
  if (lowestUsedTimestamp !== responseBody.blockTimestamp) fail("DRIFT", "FDC timestamp binding drift");
  if (payload.proof.length > MAX_MERKLE_PROOF) fail("MALFORMED", "FDC Merkle proof is oversized");
  const merkleProof = payload.proof.map((value, index) => bytes32(value, `FDC Merkle proof ${index}`));
  return {
    status: "AVAILABLE",
    votingRoundId: input.votingRoundId,
    requestBytes,
    response: {
      attestationType: FDC_XRP_PAYMENT_V1,
      sourceId,
      votingRound,
      lowestUsedTimestamp,
      requestBody: { transactionId: responseTransactionId, proofOwner: getAddress(responseProofOwner) },
      responseBody,
    },
    merkleProof,
  };
}

export async function fetchCoston2XrplPaymentProof(input: {
  votingRoundId: bigint;
  requestBytes: Hex;
  apiKey: string;
  fetcher?: FdcProofFetch;
}): Promise<FdcXrplPaymentProofEnvelopeV1> {
  const apiKey = normalizeApiKey(input.apiKey);
  const requestBytes = hex(input.requestBytes, "FDC request bytes");
  if (input.votingRoundId <= 0n || input.votingRoundId > MAX_UINT64 || input.votingRoundId > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail("INVALID_INPUT", "FDC voting round is invalid");
  }
  const fetcher = input.fetcher ?? defaultFetch();
  let response: FdcProofFetchResponse;
  try {
    response = await fetcher(COSTON2_FDC_XRPL_PROOF_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ votingRoundId: Number(input.votingRoundId), requestBytes }),
    });
  } catch {
    fail("UNAVAILABLE", "FDC DA proof request unavailable");
  }
  if (response.status !== 200) fail("HTTP_ERROR", "FDC DA proof request failed");
  if (!(response.headers.get("content-type")?.toLowerCase() ?? "").includes("application/json")) {
    fail("MALFORMED", "FDC DA response is not JSON");
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(contentLength)) fail("MALFORMED", "FDC DA response length is malformed");
    if (BigInt(contentLength) > BigInt(MAX_RESPONSE_BYTES)) fail("MALFORMED", "FDC DA response is oversized");
  }
  let payload: unknown;
  try {
    payload = await response.json();
    if (new TextEncoder().encode(JSON.stringify(payload)).length > MAX_RESPONSE_BYTES) fail("MALFORMED", "FDC DA response is oversized");
  } catch {
    fail("MALFORMED", "FDC DA response is malformed");
  }
  return parseCoston2XrplPaymentProof(payload, { votingRoundId: input.votingRoundId, requestBytes });
}
