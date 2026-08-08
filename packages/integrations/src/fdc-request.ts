import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  padHex,
  stringToHex,
  zeroAddress,
  type Hex,
} from "viem";
import { FDC_XRP_PAYMENT_V1, type XrplPaymentRequestBodyV1 } from "./triggers.js";

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

export const XRPL_TESTNET_SOURCE_ID = padHex(stringToHex("testXRP"), { size: 32 });
export const XRPL_MAINNET_SOURCE_ID = padHex(stringToHex("XRP"), { size: 32 });

export interface XrplPaymentPrepareRequestV1 {
  attestationType: typeof FDC_XRP_PAYMENT_V1;
  sourceId: Hex;
  requestBody: XrplPaymentRequestBodyV1;
}

export interface XrplPaymentAbiEncodedRequestV1 extends XrplPaymentPrepareRequestV1 {
  messageIntegrityCode: Hex;
  abiEncodedRequest: Hex;
}

function normalizeTransactionId(value: unknown): Hex {
  if (typeof value !== "string" || !HEX32.test(value) || /^0x0+$/i.test(value)) {
    throw new Error("XRPL transaction ID must be a non-zero bytes32");
  }
  return value.toLowerCase() as Hex;
}

function normalizeProofOwner(value: unknown): string {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) {
    throw new Error("FDC proof owner must be a non-zero EVM address");
  }
  return getAddress(value);
}

function normalizeMessageIntegrityCode(value: unknown): Hex {
  if (typeof value !== "string" || !HEX32.test(value) || /^0x0+$/i.test(value)) {
    throw new Error("FDC message integrity code must be a non-zero bytes32");
  }
  return value.toLowerCase() as Hex;
}

export function buildXrplPaymentPrepareRequest(input: {
  network: "testnet" | "mainnet";
  transactionId: Hex;
  proofOwner: string;
}): XrplPaymentPrepareRequestV1 {
  const sourceId = input.network === "testnet" ? XRPL_TESTNET_SOURCE_ID : XRPL_MAINNET_SOURCE_ID;
  return {
    attestationType: FDC_XRP_PAYMENT_V1,
    sourceId,
    requestBody: {
      transactionId: normalizeTransactionId(input.transactionId),
      proofOwner: normalizeProofOwner(input.proofOwner),
    },
  };
}

/**
 * Encodes the official IXRPPayment.Request for FdcHub.requestAttestation.
 * The verifier must supply the MIC; this helper never derives it or submits a
 * transaction.
 */
export function buildXrplPaymentAbiEncodedRequest(input: {
  network: "testnet" | "mainnet";
  transactionId: Hex;
  proofOwner: string;
  messageIntegrityCode: Hex;
}): XrplPaymentAbiEncodedRequestV1 {
  const request = buildXrplPaymentPrepareRequest(input);
  const messageIntegrityCode = normalizeMessageIntegrityCode(input.messageIntegrityCode);
  const abiEncodedRequest = encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "tuple", components: [{ name: "transactionId", type: "bytes32" }, { name: "proofOwner", type: "address" }] },
    ],
    [request.attestationType, request.sourceId, messageIntegrityCode, {
      transactionId: request.requestBody.transactionId,
      proofOwner: request.requestBody.proofOwner as Hex,
    }],
  ) as Hex;
  return { ...request, messageIntegrityCode, abiEncodedRequest };
}
