import { describe, expect, it } from "vitest";
import { getAddress, type Hex } from "viem";
import { buildXrplPaymentAbiEncodedRequest } from "../src/fdc-request.js";
import { parseCoston2XrplPaymentProof } from "../src/fdc-proof.js";
import { COSTON2_FDC_CHAIN_ID, FDC_RELAY_FINALITY_ABI, FDC_VERIFICATION_FINALITY_ABI } from "../src/fdc-finality.js";
import { FDC_RELAY_ROUND_ABI } from "../src/fdc-round.js";
import { FDC_HUB_REQUEST_ABI, FDC_REQUEST_FEE_ABI } from "../src/fdc-submit.js";
import { FDC_XRPL_PAYMENT_VERIFICATION_ABI } from "../src/fdc-verify.js";
import { prepareCoston2FdcFundingFlow } from "../src/fdc-flow.js";

const hubAddress = getAddress("0x00000000000000000000000000000000000000a1") as Hex;
const verificationAddress = getAddress("0x00000000000000000000000000000000000000a2") as Hex;
const relayAddress = getAddress("0x00000000000000000000000000000000000000a3") as Hex;
const feeAddress = getAddress("0x00000000000000000000000000000000000000a4") as Hex;
const assetManager = getAddress("0x00000000000000000000000000000000000000a5") as Hex;
const proofOwner = getAddress("0x00000000000000000000000000000000000000a6") as Hex;
const transactionId = `0x${"ab".repeat(32)}` as Hex;
const request = buildXrplPaymentAbiEncodedRequest({
  network: "testnet", transactionId, proofOwner, messageIntegrityCode: `0x${"cd".repeat(32)}` as Hex,
});

const payload = {
  response: {
    attestationType: request.attestationType,
    sourceId: request.sourceId,
    votingRound: "42",
    lowestUsedTimestamp: "1700000000",
    requestBody: { transactionId, proofOwner },
    responseBody: {
      blockNumber: "123456", blockTimestamp: "1700000000", sourceAddress: "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn",
      sourceAddressHash: `0x${"11".repeat(32)}`, receivingAddressHash: `0x${"22".repeat(32)}`,
      intendedReceivingAddressHash: `0x${"33".repeat(32)}`, spentAmount: "1000100", intendedSpentAmount: "1000100",
      receivedAmount: "1000000", intendedReceivedAmount: "1000000", hasMemoData: true,
      firstMemoData: "0xfe00ab", hasDestinationTag: false, destinationTag: "0", status: "0",
    },
  },
  proof: [`0x${"44".repeat(32)}`, `0x${"55".repeat(32)}`],
};
const payment = parseCoston2XrplPaymentProof(payload, { votingRoundId: 42n, requestBytes: request.abiEncodedRequest });

describe("Coston2 FDC funding flow preparation", () => {
  it("composes fee, mined timestamp, finality, DA, verification, and direct-mint checkpoints", async () => {
    const calls: string[] = [];
    const result = await prepareCoston2FdcFundingFlow({
      hubAddress, verificationAddress, relayAddress, requestBytes: request.abiEncodedRequest,
      apiKey: "runtime-only", assetManager, expectedProofOwner: proofOwner,
      submissionReceipt: { transactionHash: `0x${"99".repeat(32)}` as Hex, blockNumber: 777n, blockTimestamp: 1_700_000_001n },
      submissionReader: { async readContract(args) {
        if (args.abi === FDC_HUB_REQUEST_ABI) { calls.push("fee-config"); return feeAddress; }
        calls.push("fee"); return 123n;
      } },
      roundReader: { async readContract(args) {
        expect(args.abi).toBe(FDC_RELAY_ROUND_ABI); expect(args.args).toEqual([1_700_000_001n]); calls.push("round"); return 42n;
      } },
      finalityReader: { async readContract(args) {
        if (args.abi === FDC_VERIFICATION_FINALITY_ABI && args.functionName === "fdcProtocolId") return 200n;
        if (args.abi === FDC_VERIFICATION_FINALITY_ABI && args.functionName === "relay") return relayAddress;
        if (args.abi === FDC_RELAY_FINALITY_ABI && args.functionName === "isFinalized") return true;
        if (args.abi === FDC_RELAY_FINALITY_ABI && args.functionName === "merkleRoots") return `0x${"66".repeat(32)}`;
        throw new Error("unexpected finality call");
      } },
      proofFetcher: async args => {
        expect(args.votingRoundId).toBe(42n); expect(args.requestBytes).toBe(request.abiEncodedRequest.toLowerCase());
        expect(args.apiKey).toBe("runtime-only"); return payment;
      },
      verificationReader: { async readContract(args) {
        expect(args.abi).toBe(FDC_XRPL_PAYMENT_VERIFICATION_ABI);
        expect(args.args[0]?.data.requestBody.proofOwner).toBe(proofOwner);
        return true;
      } },
      valueWei: 9n, userOperationData: "0x1234" as Hex,
    });
    expect(result).toMatchObject({
      chainId: COSTON2_FDC_CHAIN_ID,
      submission: { hubAddress, feeWei: 123n },
      submissionReceipt: { blockNumber: 777n, blockTimestamp: 1_700_000_001n },
      round: { relayAddress, votingRoundId: 42n },
      finality: { finalized: true, votingRoundId: 42n },
      verification: { transactionId, proofOwner },
      directMint: { assetManager, mode: "executeDirectMintingWithData", valueWei: 9n, votingRoundId: 42n },
    });
    expect(calls).toEqual(["fee-config", "fee", "round"]);
  });

  it("rejects a malformed receipt before any downstream read", async () => {
    await expect(prepareCoston2FdcFundingFlow({
      hubAddress, verificationAddress, relayAddress, requestBytes: request.abiEncodedRequest, apiKey: "runtime-only", assetManager,
      submissionReceipt: { transactionHash: "0x00" as Hex, blockNumber: 1n, blockTimestamp: 1n },
      submissionReader: { async readContract() { throw new Error("must not read"); } },
      roundReader: { async readContract() { throw new Error("must not read"); } },
      finalityReader: { async readContract() { throw new Error("must not read"); } },
      verificationReader: { async readContract() { throw new Error("must not read"); } },
    })).rejects.toMatchObject({ reason: "INVALID_INPUT" });
  });
});
