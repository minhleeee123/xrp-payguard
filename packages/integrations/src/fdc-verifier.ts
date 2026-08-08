import { getAddress, isAddress, type Hex } from "viem";
import {
  buildXrplPaymentAbiEncodedRequest,
  buildXrplPaymentPrepareRequest,
  type XrplPaymentAbiEncodedRequestV1,
} from "./fdc-request.js";

const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;
const MAX_API_KEY_BYTES = 512;
const MAX_RESPONSE_BYTES = 262_144;
const XRPL_PAYMENT_REQUEST_WORDS = 5;

export const COSTON2_FDC_VERIFIER_URL = "https://fdc-verifiers-testnet.flare.network";
export const COSTON2_XRPL_PAYMENT_PREPARE_URL = `${COSTON2_FDC_VERIFIER_URL}/verifier/xrp/XRPPayment/prepareRequest`;

export type FdcVerifierPrepareFailure = "INVALID_INPUT" | "UNAVAILABLE" | "HTTP_ERROR" | "REJECTED" | "MALFORMED" | "DRIFT";

export class FdcVerifierPrepareError extends Error {
  constructor(readonly reason: FdcVerifierPrepareFailure, message: string) {
    super(message);
    this.name = "FdcVerifierPrepareError";
  }
}

export interface FdcVerifierFetchResponse {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export type FdcVerifierFetch = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<FdcVerifierFetchResponse>;

export interface PreparedFdcXrplPaymentResponse extends XrplPaymentAbiEncodedRequestV1 {
  status: "VALID";
}

interface RecordLike {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(reason: FdcVerifierPrepareFailure, message: string): never {
  throw new FdcVerifierPrepareError(reason, message);
}

function normalizeHex(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !HEX_BYTES.test(value)) fail("MALFORMED", `${label} is malformed`);
  return value.toLowerCase() as Hex;
}

function word(encoded: Hex, index: number): string {
  return encoded.slice(2 + index * 64, 2 + (index + 1) * 64).toLowerCase();
}

function defaultFetch(): FdcVerifierFetch {
  return async (url, init) => {
    const response = await fetch(url, init);
    return { status: response.status, headers: response.headers, json: () => response.json() };
  };
}

function validateApiKey(apiKey: unknown): string {
  if (typeof apiKey !== "string" || apiKey.trim().length === 0 || new TextEncoder().encode(apiKey).length > MAX_API_KEY_BYTES) {
    fail("INVALID_INPUT", "FDC verifier API key is missing or oversized");
  }
  return apiKey;
}

function validateEncodedRequest(
  encodedValue: unknown,
  input: { network: "testnet" | "mainnet"; attestationType: Hex; sourceId: Hex; transactionId: Hex; proofOwner: string },
): XrplPaymentAbiEncodedRequestV1 {
  const encoded = normalizeHex(encodedValue, "FDC ABI encoded request");
  if (encoded.length !== 2 + XRPL_PAYMENT_REQUEST_WORDS * 64) fail("MALFORMED", "FDC XRPL request length is invalid");
  if (word(encoded, 0) !== input.attestationType.slice(2).toLowerCase()
    || word(encoded, 1) !== input.sourceId.slice(2).toLowerCase()
    || word(encoded, 3) !== input.transactionId.slice(2).toLowerCase()) {
    fail("DRIFT", "FDC XRPL request binding drift");
  }
  if (!/^0{24}[0-9a-f]{40}$/.test(word(encoded, 4))) fail("MALFORMED", "FDC XRPL proof owner word is malformed");
  const encodedProofOwner = getAddress(`0x${word(encoded, 4).slice(24)}`);
  if (!isAddress(input.proofOwner) || encodedProofOwner !== getAddress(input.proofOwner)) {
    fail("DRIFT", "FDC XRPL proof owner drift");
  }
  const messageIntegrityCode = `0x${word(encoded, 2)}` as Hex;
  return buildXrplPaymentAbiEncodedRequest({
    network: input.network,
    transactionId: input.transactionId,
    proofOwner: input.proofOwner,
    messageIntegrityCode,
  });
}

export async function prepareCoston2XrplPaymentRequest(input: {
  transactionId: Hex;
  proofOwner: string;
  apiKey: string;
  fetcher?: FdcVerifierFetch;
}): Promise<PreparedFdcXrplPaymentResponse> {
  const apiKey = validateApiKey(input.apiKey);
  const request = buildXrplPaymentPrepareRequest({
    network: "testnet",
    transactionId: input.transactionId,
    proofOwner: input.proofOwner,
  });
  const body = JSON.stringify({
    attestationType: request.attestationType,
    sourceId: request.sourceId,
    requestBody: request.requestBody,
  });
  const fetcher = input.fetcher ?? defaultFetch();
  let response: FdcVerifierFetchResponse;
  try {
    response = await fetcher(COSTON2_XRPL_PAYMENT_PREPARE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body,
    });
  } catch {
    fail("UNAVAILABLE", "FDC verifier prepare request unavailable");
  }
  if (response.status !== 200) fail("HTTP_ERROR", "FDC verifier prepare request failed");
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) fail("MALFORMED", "FDC verifier response is not JSON");
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && /^(0|[1-9][0-9]*)$/.test(contentLength) && BigInt(contentLength) > BigInt(MAX_RESPONSE_BYTES)) {
    fail("MALFORMED", "FDC verifier response is oversized");
  }
  let payload: unknown;
  try {
    payload = await response.json();
    if (new TextEncoder().encode(JSON.stringify(payload)).length > MAX_RESPONSE_BYTES) fail("MALFORMED", "FDC verifier response is oversized");
  } catch {
    fail("MALFORMED", "FDC verifier response is malformed");
  }
  if (!isRecord(payload) || payload.status !== "VALID") fail("REJECTED", "FDC verifier did not validate the request");
  const prepared = validateEncodedRequest(payload.abiEncodedRequest, {
    network: "testnet",
    attestationType: request.attestationType,
    sourceId: request.sourceId,
    transactionId: request.requestBody.transactionId,
    proofOwner: request.requestBody.proofOwner,
  });
  if (prepared.abiEncodedRequest.toLowerCase() !== normalizeHex(payload.abiEncodedRequest, "FDC ABI encoded request")) {
    fail("DRIFT", "FDC XRPL encoded request drift");
  }
  if (payload.messageIntegrityCode !== undefined
    && normalizeHex(payload.messageIntegrityCode, "FDC message integrity code") !== prepared.messageIntegrityCode.toLowerCase()) {
    fail("DRIFT", "FDC message integrity code drift");
  }
  return { ...prepared, status: "VALID" };
}
