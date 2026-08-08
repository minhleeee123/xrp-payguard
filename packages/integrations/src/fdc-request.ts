import {
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
