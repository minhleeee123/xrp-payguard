import { describe, expect, it } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  keccak256,
  padHex,
  stringToHex,
  type Hex,
} from "viem";
import {
  FASSET_REDEMPTION_EVENTS_ABI,
  FASSET_REDEMPTION_PERFORMED_EVENT_ABIS,
  buildCoston2RedemptionCall,
  createCoston2FAssetsRedemptionClient,
  parseCoston2RedemptionReceipt,
  parseCoston2RedemptionPerformedReceipt,
  type Coston2RedemptionLogV1,
} from "../src/fassets-redemption.js";
import {
  createRedemptionJob,
  requestRedemption,
  type RedemptionJobV1,
  type RedemptionRequestedEventV1,
} from "../src/redemption.js";

const id = (value: string): Hex => padHex(stringToHex(value), { size: 32 });
const assetManager = "0x00000000000000000000000000000000000000a1" as Hex;
const fAsset = "0x00000000000000000000000000000000000000b2" as Hex;
const redeemer = "0x00000000000000000000000000000000000000c3" as Hex;
const executor = "0x00000000000000000000000000000000000000d4" as Hex;
const agentA = "0x00000000000000000000000000000000000000e5" as Hex;
const agentB = "0x00000000000000000000000000000000000000f6" as Hex;

const job = createRedemptionJob({
  jobId: id("redemption-client-job"),
  method: "AMOUNT",
  assetManager,
  fAsset,
  redeemer,
  paymentAddress: "rRedemptionDestination",
  executor,
  requestedAmountUBA: 1_000n,
});

function eventTopics(
  eventName: "RedemptionRequested" | "RedemptionWithTagRequested",
  values: readonly [Hex, Hex, bigint],
): readonly Hex[] {
  return encodeEventTopics({
    abi: FASSET_REDEMPTION_EVENTS_ABI,
    eventName,
    args: { agentVault: values[0], redeemer: values[1], requestId: values[2] },
  }) as readonly Hex[];
}

function requestedLog(input: {
  eventName?: "RedemptionRequested" | "RedemptionWithTagRequested";
  agentVault?: Hex;
  requestId?: bigint;
  valueUBA?: bigint;
  paymentReference?: Hex;
  destinationTag?: bigint;
  paymentAddress?: string;
} = {}): Coston2RedemptionLogV1 {
  const eventName = input.eventName ?? "RedemptionRequested";
  const agentVault = input.agentVault ?? agentA;
  const requestId = input.requestId ?? 1n;
  const valueUBA = input.valueUBA ?? 900n;
  const paymentReference = input.paymentReference ?? id("redemption-payment-reference");
  const topics = eventTopics(eventName, [agentVault, redeemer, requestId]);
  const data = eventName === "RedemptionWithTagRequested"
    ? encodeAbiParameters(
      [
        { type: "string" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" },
        { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }, { type: "address" },
        { type: "uint256" }, { type: "uint256" },
      ],
      [input.paymentAddress ?? job.paymentAddress, valueUBA, 9n, 100n, 120n, 1_000n, paymentReference, executor, 10n, input.destinationTag ?? 7n],
    )
    : encodeAbiParameters(
      [
        { type: "string" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" },
        { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }, { type: "address" },
        { type: "uint256" },
      ],
      [input.paymentAddress ?? job.paymentAddress, valueUBA, 9n, 100n, 120n, 1_000n, paymentReference, executor, 10n],
    );
  return { address: assetManager, topics, data };
}

function incompleteLog(remainingAmountUBA: bigint, target = redeemer): Coston2RedemptionLogV1 {
  return {
    address: assetManager,
    topics: encodeEventTopics({
      abi: FASSET_REDEMPTION_EVENTS_ABI,
      eventName: "RedemptionAmountIncomplete",
      args: { redeemer: target },
    }) as readonly Hex[],
    data: encodeAbiParameters([{ type: "uint256" }], [remainingAmountUBA]),
  };
}

describe("Coston2 FAssets redemption boundary", () => {
  it("encodes amount and tagged redemption calls without accepting a tag drift", () => {
    const amountCall = buildCoston2RedemptionCall({ job, fAsset });
    expect(amountCall.method).toBe("AMOUNT");
    expect(amountCall.calldata).toMatch(/^0x[0-9a-f]+$/);

    const taggedJob = createRedemptionJob({
      ...job,
      jobId: id("tagged-redemption-client-job"),
      method: "WITH_TAG",
      destinationTag: 7n,
    });
    const taggedCall = buildCoston2RedemptionCall({ job: taggedJob, fAsset, valueWei: 3n });
    expect(taggedCall.method).toBe("WITH_TAG");
    expect(taggedCall.destinationTag).toBe(7n);
    expect(taggedCall.valueWei).toBe(3n);
    expect(() => parseCoston2RedemptionReceipt({
      job: taggedJob,
      receipt: { status: "success", transactionHash: id("tagged-tx"), logs: [requestedLog({ eventName: "RedemptionWithTagRequested", destinationTag: 8n })] },
    })).toThrow(/tag drift/);
  });

  it("parses partial multi-agent requests and rejects receipt drift", async () => {
    const receipt = {
      status: "success" as const,
      transactionHash: id("redemption-tx"),
      logs: [
        requestedLog(),
        requestedLog({ agentVault: agentB, requestId: 2n, valueUBA: 100n, paymentReference: id("redemption-payment-reference-2") }),
        incompleteLog(0n),
      ],
    };
    const parsed = parseCoston2RedemptionReceipt({ job, receipt });
    expect(parsed).toMatchObject({ requestedAmountUBA: 1_000n, redeemedAmountUBA: 1_000n, remainingAmountUBA: 0n });
    expect(parsed.requests).toHaveLength(2);
    const requestedJob = await requestRedemption(job, { requestRedemption: async () => parsed });
    const performedTopics = encodeEventTopics({
      abi: FASSET_REDEMPTION_PERFORMED_EVENT_ABIS,
      eventName: "RedemptionPerformed",
      args: { agentVault: agentA, redeemer, requestId: 1n },
    }) as readonly Hex[];
    const performedLog: Coston2RedemptionLogV1 = {
      address: assetManager,
      topics: performedTopics,
      data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }, { type: "int256" }], [id("underlying-payment"), 900n, 4_975_012n]),
    };
    const performedEvent = parseCoston2RedemptionPerformedReceipt({
      job: requestedJob,
      receipt: { status: "success", transactionHash: id("settlement-flare-tx"), logs: [performedLog] },
    });
    expect(performedEvent).toMatchObject({ status: "UNDERLYING_PAID", requestId: 1n, redemptionAmountUBA: 900n, spentUnderlyingUBA: 4_975_012n });
    expect(() => parseCoston2RedemptionPerformedReceipt({
      job: requestedJob,
      receipt: { status: "success", transactionHash: id("settlement-flare-tx"), logs: [{ ...performedLog, data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }, { type: "int256" }], [id("underlying-payment"), 900n, 0n]) }] },
    })).toThrow(/spent amount invalid/);
    expect(() => parseCoston2RedemptionReceipt({
      job,
      receipt: { ...receipt, logs: [requestedLog(), incompleteLog(1n)] },
    })).toThrow(/amount drift/);
    expect(() => parseCoston2RedemptionReceipt({
      job,
      receipt: { ...receipt, status: "reverted" },
    })).toThrow(/unavailable/);
  });

  it("reads runtime guards, approves only when needed, and fails closed on writer drift", async () => {
    let allowance = 0n;
    const writes: string[] = [];
    const reader = {
      readContract: async (args: { functionName: string }): Promise<unknown> => {
        if (args.functionName === "fAsset") return fAsset;
        if (args.functionName === "minimumRedeemAmountUBA") return 500n;
        if (args.functionName === "balanceOf") return 2_000n;
        if (args.functionName === "allowance") return allowance;
        throw new Error(`unexpected read ${args.functionName}`);
      },
    };
    const writer = {
      writeContract: async (args: { functionName: string }): Promise<Hex> => {
        writes.push(args.functionName);
        if (args.functionName === "approve") allowance = 1_000n;
        return id(`${args.functionName}-tx`);
      },
      waitForTransactionReceipt: async (args: { hash: Hex }) => args.hash === id("approve-tx")
        ? { status: "success" as const, transactionHash: args.hash, logs: [] }
        : { status: "success" as const, transactionHash: args.hash, logs: [requestedLog(), incompleteLog(100n)] },
    };
    const client = createCoston2FAssetsRedemptionClient({ reader, writer, account: redeemer, chainId: 114n });
    const requested = await requestRedemption(job, client);
    expect(requested.state).toBe("REQUESTED");
    expect(requested.remainingAmountUBA).toBe(100n);
    expect(writes).toEqual(["approve", "redeemAmount"]);

    const mismatchedReader = { ...reader, readContract: async (args: { functionName: string }) => args.functionName === "fAsset" ? agentA : reader.readContract(args) };
    await expect(requestRedemption(job, createCoston2FAssetsRedemptionClient({ reader: mismatchedReader, writer, account: redeemer, chainId: 114n }))).rejects.toThrow(/FAsset drift/);
    expect(() => createCoston2FAssetsRedemptionClient({ reader, writer, account: redeemer, chainId: 1n })).toThrow(/chain invalid/);
  });
});
