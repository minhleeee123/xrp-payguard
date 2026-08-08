import { describe, expect, it } from "vitest";
import { getAddress, type Hex } from "viem";
import { buildXrplPaymentAbiEncodedRequest } from "../src/fdc-request.js";
import { parseCoston2XrplPaymentProof } from "../src/fdc-proof.js";
import { COSTON2_FDC_CHAIN_ID } from "../src/fdc-finality.js";
import {
  FDC_XRPL_PAYMENT_VERIFICATION_ABI,
  verifyCoston2XrplPaymentProof,
} from "../src/fdc-verify.js";

const verificationAddress = getAddress("0x00000000000000000000000000000000000000a1") as Hex;
const relayAddress = getAddress("0x00000000000000000000000000000000000000b2") as Hex;
const proofOwner = getAddress("0x00000000000000000000000000000000000000c3") as Hex;
const transactionId = `0x${"ab".repeat(32)}` as Hex;
const request = buildXrplPaymentAbiEncodedRequest({
  network: "testnet",
  transactionId,
  proofOwner,
  messageIntegrityCode: `0x${"cd".repeat(32)}` as Hex,
});

const payload = {
  response: {
    attestationType: request.attestationType,
    sourceId: request.sourceId,
    votingRound: "42",
    lowestUsedTimestamp: "1700000000",
    requestBody: { transactionId, proofOwner },
    responseBody: {
      blockNumber: "123456",
      blockTimestamp: "1700000000",
      sourceAddress: "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn",
      sourceAddressHash: `0x${"11".repeat(32)}`,
      receivingAddressHash: `0x${"22".repeat(32)}`,
      intendedReceivingAddressHash: `0x${"33".repeat(32)}`,
      spentAmount: "1000100",
      intendedSpentAmount: "1000100",
      receivedAmount: "1000000",
      intendedReceivedAmount: "1000000",
      hasMemoData: true,
      firstMemoData: "0xfe00ab",
      hasDestinationTag: false,
      destinationTag: "0",
      status: "0",
    },
  },
  proof: [`0x${"44".repeat(32)}`, `0x${"55".repeat(32)}`],
};

const payment = parseCoston2XrplPaymentProof(payload, { votingRoundId: 42n, requestBytes: request.abiEncodedRequest });
const finality = {
  chainId: COSTON2_FDC_CHAIN_ID,
  verificationAddress,
  relayAddress,
  protocolId: 200n,
  votingRoundId: 42n,
  finalized: true as const,
  merkleRoot: `0x${"66".repeat(32)}` as Hex,
} as const;

describe("Coston2 IXRPPayment proof verification", () => {
  it("calls the official verifyXRPPayment selector and returns a public commitment", async () => {
    const calls: unknown[] = [];
    const result = await verifyCoston2XrplPaymentProof({
      async readContract(args) {
        calls.push(args);
        expect(args.address).toBe(verificationAddress);
        expect(args.abi).toBe(FDC_XRPL_PAYMENT_VERIFICATION_ABI);
        expect(args.functionName).toBe("verifyXRPPayment");
        expect(args.args[0]?.data.requestBody).toEqual({ transactionId, proofOwner });
        return true;
      },
    }, { verificationAddress: verificationAddress.toLowerCase(), payment, finality, expectedProofOwner: proofOwner.toLowerCase() });
    expect(result).toMatchObject({
      chainId: COSTON2_FDC_CHAIN_ID,
      verificationAddress,
      relayAddress,
      protocolId: 200n,
      votingRoundId: 42n,
      merkleRoot: finality.merkleRoot,
      transactionId,
      proofOwner,
    });
    expect(result.proofCommitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect(calls).toHaveLength(1);
  });

  it("fails closed for finality, owner, status, RPC, and verifier-result drift", async () => {
    await expect(verifyCoston2XrplPaymentProof({ async readContract() { return true; } }, {
      verificationAddress, payment, finality: { ...finality, finalized: false, merkleRoot: null },
    })).rejects.toMatchObject({ reason: "NOT_FINALIZED" });
    await expect(verifyCoston2XrplPaymentProof({ async readContract() { return true; } }, {
      verificationAddress, payment, finality, expectedProofOwner: "0x00000000000000000000000000000000000000c4",
    })).rejects.toMatchObject({ reason: "DRIFT" });
    const failedPayment = parseCoston2XrplPaymentProof({
      ...payload,
      response: { ...payload.response, responseBody: { ...payload.response.responseBody, status: "1" } },
    }, { votingRoundId: 42n, requestBytes: request.abiEncodedRequest });
    await expect(verifyCoston2XrplPaymentProof({ async readContract() { return true; } }, {
      verificationAddress, payment: failedPayment, finality,
    })).rejects.toMatchObject({ reason: "DRIFT" });
    await expect(verifyCoston2XrplPaymentProof({ async readContract() { throw new Error("offline"); } }, {
      verificationAddress, payment, finality,
    })).rejects.toMatchObject({ reason: "UNAVAILABLE" });
    await expect(verifyCoston2XrplPaymentProof({ async readContract() { return false; } }, {
      verificationAddress, payment, finality,
    })).rejects.toMatchObject({ reason: "PROOF_INVALID" });
  });
});
