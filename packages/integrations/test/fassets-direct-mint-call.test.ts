import { describe, expect, it } from "vitest";
import { getAddress, type Hex } from "viem";
import { FDC_XRP_PAYMENT_V1 } from "../src/triggers.js";
import { XRPL_TESTNET_SOURCE_ID } from "../src/fdc-request.js";
import { buildCoston2DirectMintCall } from "../src/fassets-direct-mint-call.js";

const assetManager = getAddress("0x00000000000000000000000000000000000000a1");
const transactionId = `0x${"ab".repeat(32)}` as Hex;
const proofOwner = getAddress("0x00000000000000000000000000000000000000c3");
const sourceAddress = "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn";
const merkleRoot = `0x${"aa".repeat(32)}` as Hex;

const payment = {
  status: "AVAILABLE" as const,
  votingRoundId: 42n,
  requestBytes: `0x${"cd".repeat(160)}` as Hex,
  merkleProof: [`0x${"11".repeat(32)}` as Hex],
  response: {
    attestationType: FDC_XRP_PAYMENT_V1,
    sourceId: XRPL_TESTNET_SOURCE_ID,
    votingRound: 42n,
    lowestUsedTimestamp: 1_700_000_000n,
    requestBody: { transactionId, proofOwner },
    responseBody: {
      blockNumber: 123n,
      blockTimestamp: 1_700_000_000n,
      sourceAddress,
      sourceAddressHash: `0x${"22".repeat(32)}` as Hex,
      receivingAddressHash: `0x${"33".repeat(32)}` as Hex,
      intendedReceivingAddressHash: `0x${"44".repeat(32)}` as Hex,
      spentAmount: 1_001_000n,
      intendedSpentAmount: 1_001_000n,
      receivedAmount: 1_000_000n,
      intendedReceivedAmount: 1_000_000n,
      hasMemoData: true,
      firstMemoData: "0xfe00ab" as Hex,
      hasDestinationTag: false,
      destinationTag: 0n,
      status: 0,
    },
  },
};

const finality = {
  chainId: 114n as const,
  verificationAddress: getAddress("0x00000000000000000000000000000000000000b1") as Hex,
  relayAddress: getAddress("0x00000000000000000000000000000000000000b2") as Hex,
  protocolId: 200n,
  votingRoundId: 42n,
  finalized: true as const,
  merkleRoot,
};

describe("FAssets direct-mint proof call codec", () => {
  it("encodes the standard and 0xFE with-data entry points without signing", () => {
    const standard = buildCoston2DirectMintCall({ assetManager, payment, finality });
    expect(standard).toMatchObject({
      assetManager,
      mode: "executeDirectMinting",
      valueWei: 0n,
      transactionId,
      votingRoundId: 42n,
    });
    expect(standard.calldata).toMatch(/^0x[0-9a-f]+$/);
    const withData = buildCoston2DirectMintCall({ assetManager, payment, finality, valueWei: 9n, userOperationData: "0x1234" });
    expect(withData).toMatchObject({ mode: "executeDirectMintingWithData", valueWei: 9n, transactionId, votingRoundId: 42n });
    expect(withData.calldata).toMatch(/^0x[0-9a-f]+$/);
    expect(withData.calldata).not.toBe(standard.calldata);
  });

  it("fails closed for pending/drifted finality, failed payments, and malformed data", () => {
    expect(() => buildCoston2DirectMintCall({ assetManager, payment, finality: { ...finality, finalized: false, merkleRoot: null } }))
      .toThrow(expect.objectContaining({ reason: "NOT_FINALIZED" }));
    expect(() => buildCoston2DirectMintCall({ assetManager, payment, finality: { ...finality, votingRoundId: 43n } }))
      .toThrow(expect.objectContaining({ reason: "DRIFT" }));
    expect(() => buildCoston2DirectMintCall({ assetManager, payment: { ...payment, response: { ...payment.response, responseBody: { ...payment.response.responseBody, status: 1 } } }, finality }))
      .toThrow(expect.objectContaining({ reason: "DRIFT" }));
    expect(() => buildCoston2DirectMintCall({ assetManager, payment, finality, userOperationData: "0x1" as Hex }))
      .toThrow(expect.objectContaining({ reason: "INVALID_INPUT" }));
    expect(() => buildCoston2DirectMintCall({ assetManager: "not-an-address", payment, finality }))
      .toThrow(expect.objectContaining({ reason: "INVALID_INPUT" }));
    expect(() => buildCoston2DirectMintCall({ assetManager, payment, finality, valueWei: -1n }))
      .toThrow(expect.objectContaining({ reason: "INVALID_INPUT" }));
  });
});
