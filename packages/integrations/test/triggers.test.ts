import { describe, expect, it } from "vitest";
import { keccak256, padHex, stringToHex, type Hex } from "viem";
import {
  FDC_EVM_TRANSACTION_V1,
  FDC_XRP_PAYMENT_V1,
  verifyEvmTransactionTrigger,
  verifyXrplPaymentTrigger,
  xrplPaymentInputCommitmentV1,
  type EvmTransactionTriggerProofV1,
  type ExpectedEvmTransactionTriggerV1,
  type ExpectedXrplPaymentTriggerV1,
  type XrplPaymentTriggerProofV1,
} from "../src/triggers.js";

const id = (value: string): Hex => padHex(stringToHex(value), { size: 32 });
const source = "0x00000000000000000000000000000000000000a1";
const receiver = "0x00000000000000000000000000000000000000b2";
const proofOwner = "0x00000000000000000000000000000000000000c3";
const emitter = "0x00000000000000000000000000000000000000d4";
const input = "0x1234" as Hex;
const eventData = padHex("0x01", { size: 32 });
const memoData = stringToHex("public-trigger-reference");

const expectedEvm: ExpectedEvmTransactionTriggerV1 = {
  sourceId: id("testETH"),
  transactionHash: id("evm-transaction"),
  requiredConfirmations: 12n,
  provideInput: true,
  listEvents: true,
  logIndices: [7n],
  sourceAddress: source,
  receivingAddress: receiver,
  value: 25n,
  inputHash: keccak256(input),
  events: [{ logIndex: 7n, emitterAddress: emitter, topics: [id("event-topic")], dataHash: keccak256(eventData) }],
  minBlockNumber: 50n,
  minTimestamp: 90n,
  maxAgeSeconds: 30n,
};

const evmProof = (patch: Partial<EvmTransactionTriggerProofV1> = {}): EvmTransactionTriggerProofV1 => ({
  attestationType: FDC_EVM_TRANSACTION_V1,
  sourceId: expectedEvm.sourceId,
  votingRound: 9n,
  lowestUsedTimestamp: 100n,
  finalized: true,
  requestBody: {
    transactionHash: expectedEvm.transactionHash,
    requiredConfirmations: expectedEvm.requiredConfirmations,
    provideInput: expectedEvm.provideInput,
    listEvents: expectedEvm.listEvents,
    logIndices: expectedEvm.logIndices,
  },
  responseBody: {
    blockNumber: 51n,
    timestamp: 100n,
    sourceAddress: source,
    isDeployment: false,
    receivingAddress: receiver,
    value: 25n,
    input,
    status: 1,
    events: [{ logIndex: 7n, emitterAddress: emitter, topics: [id("event-topic")], data: eventData, removed: false }],
  },
  ...patch,
});

const expectedXrp: ExpectedXrplPaymentTriggerV1 = {
  sourceId: id("testXRP"),
  transactionId: id("xrpl-transaction"),
  proofOwner,
  sourceAddress: "rPublicSource",
  sourceAddressHash: id("xrpl-source"),
  receivingAddressHash: id("xrpl-receiver"),
  receivedAmount: 1_000_000n,
  memoDataHash: keccak256(memoData),
  minBlockNumber: 70n,
  minTimestamp: 90n,
  maxAgeSeconds: 30n,
};

const xrpProof = (patch: Partial<XrplPaymentTriggerProofV1> = {}): XrplPaymentTriggerProofV1 => ({
  attestationType: FDC_XRP_PAYMENT_V1,
  sourceId: expectedXrp.sourceId,
  votingRound: 10n,
  lowestUsedTimestamp: 100n,
  finalized: true,
  requestBody: { transactionId: expectedXrp.transactionId, proofOwner },
  responseBody: {
    blockNumber: 71n,
    blockTimestamp: 100n,
    sourceAddress: expectedXrp.sourceAddress,
    sourceAddressHash: expectedXrp.sourceAddressHash,
    receivingAddressHash: expectedXrp.receivingAddressHash,
    intendedReceivingAddressHash: expectedXrp.receivingAddressHash,
    spentAmount: 1_000_012n,
    intendedSpentAmount: 1_000_012n,
    receivedAmount: expectedXrp.receivedAmount,
    intendedReceivedAmount: expectedXrp.receivedAmount,
    hasMemoData: true,
    firstMemoData: memoData,
    hasDestinationTag: false,
    destinationTag: 0n,
    status: 0,
  },
  ...patch,
});

describe("FDC external trigger adapters", () => {
  it("matches the Solidity XRPPayment input-commitment golden vector", () => {
    const requestId = keccak256(stringToHex("payguard-request"));
    const vector = xrpProof({
      sourceId: padHex(stringToHex("testXRP"), { dir: "right", size: 32 }),
      votingRound: 42n,
      lowestUsedTimestamp: 1_900n,
      requestBody: {
        transactionId: keccak256(stringToHex("xrpl-transaction")),
        proofOwner: "0x00000000000000000000000000000000000000c3",
      },
      responseBody: {
        blockNumber: 99n,
        blockTimestamp: 1_900n,
        sourceAddress: "rSource",
        sourceAddressHash: keccak256(stringToHex("rSource")),
        receivingAddressHash: keccak256(stringToHex("rDestination")),
        intendedReceivingAddressHash: keccak256(stringToHex("rDestination")),
        spentAmount: 100n,
        intendedSpentAmount: 100n,
        receivedAmount: 100n,
        intendedReceivedAmount: 100n,
        hasMemoData: true,
        firstMemoData: requestId,
        hasDestinationTag: false,
        destinationTag: 0n,
        status: 0,
      },
    });
    expect(xrplPaymentInputCommitmentV1(vector)).toBe("0x0b5a30154dc9ca903d642d9d67136ca5e6104fdcafdac7c270d3370ab96b67f6");
  });

  it("binds the official EVMTransaction request and response fields", async () => {
    const verifier = { verify: async () => id("verified-evm-proof") };
    const accepted = await verifyEvmTransactionTrigger(evmProof(), expectedEvm, 120n, verifier);
    expect(accepted).toMatchObject({ ok: true, proofCommitment: id("verified-evm-proof") });
    if (accepted.ok) expect(accepted.inputCommitment).toMatch(/^0x[0-9a-f]{64}$/);

    expect(await verifyEvmTransactionTrigger(evmProof(), expectedEvm, 120n, undefined)).toEqual({ ok: false, reason: "VERIFIER_UNAVAILABLE" });
    expect(await verifyEvmTransactionTrigger(evmProof({ finalized: false }), expectedEvm, 120n, verifier)).toEqual({ ok: false, reason: "NOT_FINALIZED" });
    expect(await verifyEvmTransactionTrigger(evmProof(), expectedEvm, 120n, verifier, new Set([expectedEvm.transactionHash.toLowerCase()]))).toEqual({ ok: false, reason: "REPLAY" });
    expect((await verifyEvmTransactionTrigger(evmProof({ requestBody: { ...evmProof().requestBody, requiredConfirmations: 1n } }), expectedEvm, 120n, verifier)).ok).toBe(false);
    expect(await verifyEvmTransactionTrigger(evmProof({ responseBody: { ...evmProof().responseBody, status: 0 } }), expectedEvm, 120n, verifier)).toEqual({ ok: false, reason: "RESPONSE_MISMATCH" });
    expect(await verifyEvmTransactionTrigger(evmProof({ responseBody: { ...evmProof().responseBody, timestamp: 80n } }), expectedEvm, 120n, verifier)).toEqual({ ok: false, reason: "STALE" });
    expect((await verifyEvmTransactionTrigger(evmProof({ responseBody: { ...evmProof().responseBody, events: [{ ...evmProof().responseBody.events[0]!, removed: true }] } }), expectedEvm, 120n, verifier)).ok).toBe(false);
    expect(await verifyEvmTransactionTrigger(evmProof({ responseBody: { ...evmProof().responseBody, input: `0x${"aa".repeat(131_073)}` } }), expectedEvm, 120n, verifier)).toEqual({ ok: false, reason: "RESPONSE_MISMATCH" });
    expect(await verifyEvmTransactionTrigger(evmProof(), expectedEvm, 120n, verifier, new Set(), new Set([id("verified-evm-proof").toLowerCase()]))).toEqual({ ok: false, reason: "REPLAY" });
    const mutableProof = evmProof();
    expect(await verifyEvmTransactionTrigger(mutableProof, expectedEvm, 120n, {
      verify: async () => {
        mutableProof.responseBody.value = 26n;
        return id("verified-mutated-proof");
      },
    })).toEqual({ ok: false, reason: "MALFORMED" });
    const concurrentlyUsed = new Set<string>();
    expect(await verifyEvmTransactionTrigger(evmProof(), expectedEvm, 120n, {
      verify: async () => {
        concurrentlyUsed.add(expectedEvm.transactionHash.toLowerCase());
        return id("verified-concurrent-proof");
      },
    }, concurrentlyUsed)).toEqual({ ok: false, reason: "REPLAY" });
  });

  it("binds XRPPayment owner, hashes, amount, memo, status, freshness, and replay", async () => {
    const verifier = { verify: async () => id("verified-xrp-proof") };
    const accepted = await verifyXrplPaymentTrigger(xrpProof(), expectedXrp, 120n, verifier);
    expect(accepted).toMatchObject({ ok: true, proofCommitment: id("verified-xrp-proof") });
    if (accepted.ok) expect(accepted.inputCommitment).toMatch(/^0x[0-9a-f]{64}$/);

    expect(await verifyXrplPaymentTrigger(xrpProof(), expectedXrp, 120n, undefined)).toEqual({ ok: false, reason: "VERIFIER_UNAVAILABLE" });
    expect(await verifyXrplPaymentTrigger(xrpProof({ requestBody: { ...xrpProof().requestBody, proofOwner: receiver } }), expectedXrp, 120n, verifier)).toEqual({ ok: false, reason: "REQUEST_MISMATCH" });
    expect(await verifyXrplPaymentTrigger(xrpProof({ responseBody: { ...xrpProof().responseBody, intendedReceivingAddressHash: id("wrong-receiver") } }), expectedXrp, 120n, verifier)).toEqual({ ok: false, reason: "RESPONSE_MISMATCH" });
    expect(await verifyXrplPaymentTrigger(xrpProof({ responseBody: { ...xrpProof().responseBody, receivedAmount: 999_999n } }), expectedXrp, 120n, verifier)).toEqual({ ok: false, reason: "RESPONSE_MISMATCH" });
    expect(await verifyXrplPaymentTrigger(xrpProof({ responseBody: { ...xrpProof().responseBody, firstMemoData: stringToHex("wrong") } }), expectedXrp, 120n, verifier)).toEqual({ ok: false, reason: "RESPONSE_MISMATCH" });
    expect(await verifyXrplPaymentTrigger(xrpProof({ responseBody: { ...xrpProof().responseBody, firstMemoData: `0x${"aa".repeat(4_097)}` } }), expectedXrp, 120n, verifier)).toEqual({ ok: false, reason: "RESPONSE_MISMATCH" });
    expect(await verifyXrplPaymentTrigger(xrpProof({ responseBody: { ...xrpProof().responseBody, blockTimestamp: 80n } }), expectedXrp, 120n, verifier)).toEqual({ ok: false, reason: "STALE" });
    expect(await verifyXrplPaymentTrigger(xrpProof(), expectedXrp, 120n, verifier, new Set([expectedXrp.transactionId.toLowerCase()]))).toEqual({ ok: false, reason: "REPLAY" });
    expect(await verifyXrplPaymentTrigger(xrpProof(), expectedXrp, 120n, { verify: async () => false })).toEqual({ ok: false, reason: "PROOF_INVALID" });
    expect(await verifyXrplPaymentTrigger(xrpProof(), expectedXrp, 120n, { verify: async () => { throw new Error("down"); } })).toEqual({ ok: false, reason: "VERIFIER_UNAVAILABLE" });
    const mutableProof = xrpProof();
    expect(await verifyXrplPaymentTrigger(mutableProof, expectedXrp, 120n, {
      verify: async () => {
        mutableProof.responseBody.receivedAmount = 999_999n;
        return id("verified-mutated-xrp-proof");
      },
    })).toEqual({ ok: false, reason: "MALFORMED" });
  });
});
