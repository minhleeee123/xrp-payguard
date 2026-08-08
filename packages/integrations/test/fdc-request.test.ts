import { describe, expect, it } from "vitest";
import { getAddress, type Hex } from "viem";
import {
  buildXrplPaymentAbiEncodedRequest,
  buildXrplPaymentPrepareRequest,
  XRPL_MAINNET_SOURCE_ID,
  XRPL_TESTNET_SOURCE_ID,
} from "../src/fdc-request.js";
import { FDC_XRP_PAYMENT_V1 } from "../src/triggers.js";

const transactionId = `0x${"ab".repeat(32)}` as Hex;
const proofOwner = "0x00000000000000000000000000000000000000c3";

describe("FDC XRPPayment request boundary", () => {
  it("builds the exact public testnet/mainnet request shape", () => {
    const testnet = buildXrplPaymentPrepareRequest({ network: "testnet", transactionId: `0x${"AB".repeat(32)}` as Hex, proofOwner });
    expect(testnet).toEqual({
      attestationType: FDC_XRP_PAYMENT_V1,
      sourceId: XRPL_TESTNET_SOURCE_ID,
      requestBody: { transactionId, proofOwner: getAddress(proofOwner) },
    });
    const mainnet = buildXrplPaymentPrepareRequest({ network: "mainnet", transactionId, proofOwner: "0x00000000000000000000000000000000000000C3" });
    expect(mainnet.sourceId).toBe(XRPL_MAINNET_SOURCE_ID);
    expect(mainnet.requestBody.proofOwner).toBe(getAddress(proofOwner));
    expect(mainnet.requestBody.transactionId).toBe(transactionId);
  });

  it("rejects zero/malformed transaction IDs and proof owners", () => {
    const base = { network: "testnet" as const, transactionId, proofOwner };
    expect(() => buildXrplPaymentPrepareRequest({ ...base, transactionId: `0x${"00".repeat(32)}` as Hex })).toThrow(/non-zero/);
    expect(() => buildXrplPaymentPrepareRequest({ ...base, transactionId: "0x1234" as Hex })).toThrow(/bytes32/);
    expect(() => buildXrplPaymentPrepareRequest({ ...base, proofOwner: "0x0000000000000000000000000000000000000000" })).toThrow(/non-zero/);
    expect(() => buildXrplPaymentPrepareRequest({ ...base, proofOwner: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh" })).toThrow(/EVM/);
  });

  it("ABI-encodes the official request while treating the MIC as verifier input", () => {
    const encoded = buildXrplPaymentAbiEncodedRequest({
      network: "testnet",
      transactionId,
      proofOwner,
      messageIntegrityCode: `0x${"cd".repeat(32)}` as Hex,
    });
    expect(encoded.messageIntegrityCode).toBe(`0x${"cd".repeat(32)}`);
    expect(encoded.abiEncodedRequest).toBe(
      `0x${encoded.attestationType.slice(2)}${encoded.sourceId.slice(2)}${encoded.messageIntegrityCode.slice(2)}${transactionId.slice(2)}${proofOwner.slice(2).padStart(64, "0")}`,
    );
    expect(() => buildXrplPaymentAbiEncodedRequest({
      network: "testnet", transactionId, proofOwner, messageIntegrityCode: `0x${"00".repeat(32)}` as Hex,
    })).toThrow(/message integrity/);
  });
});
