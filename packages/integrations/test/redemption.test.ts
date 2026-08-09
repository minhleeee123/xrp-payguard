import { describe, expect, it } from "vitest";
import { padHex, stringToHex, zeroHash, type Hex } from "viem";
import {
  acceptRedemptionDefault,
  acceptRedemptionPerformed,
  assertRedemptionJobIntegrity,
  createRedemptionJob,
  redemptionOutcome,
  requestRedemption,
  type RedemptionDefaultEventV1,
  type RedemptionIntentV1,
  type RedemptionJobV1,
  type RedemptionPerformedEventV1,
  type RedemptionRequestReceiptV1,
  type RedemptionRequestedEventV1,
} from "../src/redemption.js";

const id = (value: string): Hex => padHex(stringToHex(value), { size: 32 });
const assetManager = "0x00000000000000000000000000000000000000a1";
const fAsset = "0x00000000000000000000000000000000000000b2";
const redeemer = "0x00000000000000000000000000000000000000c3";
const executor = "0x00000000000000000000000000000000000000d4";
const agentA = "0x00000000000000000000000000000000000000e5";
const agentB = "0x00000000000000000000000000000000000000f6";

const intent: RedemptionIntentV1 = {
  jobId: id("redemption-job"),
  method: "AMOUNT",
  assetManager,
  fAsset,
  redeemer,
  paymentAddress: "rPublicRedemptionDestination",
  executor,
  requestedAmountUBA: 1_000n,
};

const requestEvent = (patch: Partial<RedemptionRequestedEventV1> = {}): RedemptionRequestedEventV1 => ({
  agentVault: agentA,
  redeemer,
  requestId: 1n,
  paymentAddress: intent.paymentAddress,
  valueUBA: 400n,
  feeUBA: 4n,
  firstUnderlyingBlock: 100n,
  lastUnderlyingBlock: 120n,
  lastUnderlyingTimestamp: 1_000n,
  paymentReference: id("redemption-reference-1"),
  executor,
  executorFeeNatWei: 10n,
  ...patch,
});

const receipt = (patch: Partial<RedemptionRequestReceiptV1> = {}): RedemptionRequestReceiptV1 => ({
  status: "REQUESTED",
  transactionHash: id("redemption-request-tx"),
  assetManager,
  fAsset,
  redeemer,
  requestedAmountUBA: 1_000n,
  redeemedAmountUBA: 700n,
  remainingAmountUBA: 300n,
  requests: [
    requestEvent(),
    requestEvent({ agentVault: agentB, requestId: 2n, valueUBA: 300n, feeUBA: 3n, paymentReference: id("redemption-reference-2") }),
  ],
  ...patch,
});

const performed = (patch: Partial<RedemptionPerformedEventV1> = {}): RedemptionPerformedEventV1 => ({
  status: "UNDERLYING_PAID",
  flareTransactionHash: id("redemption-performed-flare-tx"),
  agentVault: agentA,
  redeemer,
  requestId: 1n,
  transactionHash: id("redemption-underlying-tx"),
  redemptionAmountUBA: 400n,
  spentUnderlyingUBA: 396n,
  ...patch,
});

const defaulted = (patch: Partial<RedemptionDefaultEventV1> = {}): RedemptionDefaultEventV1 => ({
  status: "COLLATERAL_DEFAULT",
  flareTransactionHash: id("redemption-default-flare-tx"),
  agentVault: agentB,
  redeemer,
  requestId: 2n,
  redemptionAmountUBA: 300n,
  redeemedVaultCollateralWei: 250n,
  redeemedPoolCollateralWei: 75n,
  ...patch,
});

describe("FAssets redemption checkpoint model", () => {
  it("keeps request, underlying payment, and collateral default as distinct states", async () => {
    const created = createRedemptionJob(intent);
    expect(redemptionOutcome(created)).toBe("NOT_REQUESTED");
    expect(created.checkpointHash).toMatch(/^0x[0-9a-f]{64}$/);
    await expect(requestRedemption(created, undefined)).rejects.toThrow(/unavailable/);
    await expect(requestRedemption(created, { requestRedemption: async () => receipt({ transactionHash: zeroHash }) })).rejects.toThrow(/receipt drift/);
    await expect(requestRedemption(created, { requestRedemption: async () => receipt({ redeemedAmountUBA: 699n }) })).rejects.toThrow(/receipt drift/);

    const requested = await requestRedemption(created, { requestRedemption: async () => receipt() });
    expect(requested).toMatchObject({ state: "REQUESTED", redeemedAmountUBA: 700n, remainingAmountUBA: 300n });
    expect(redemptionOutcome(requested)).toBe("PENDING");
    expect(() => assertRedemptionJobIntegrity(requested)).not.toThrow();

    await expect(acceptRedemptionPerformed(requested, performed(), undefined)).rejects.toThrow(/verifier unavailable/);
    await expect(acceptRedemptionPerformed(requested, performed({ redemptionAmountUBA: 399n }), { verify: async () => id("bad") })).rejects.toThrow(/drift/);
    const paidOne = await acceptRedemptionPerformed(requested, performed(), { verify: async () => id("performed-proof") });
    expect(redemptionOutcome(paidOne)).toBe("PENDING");
    expect(paidOne.requests[0]).toMatchObject({ state: "UNDERLYING_PAID", underlyingTransactionHash: id("redemption-underlying-tx") });
    await expect(acceptRedemptionPerformed(paidOne, performed(), { verify: async () => id("duplicate") })).rejects.toThrow(/drift/);

    await expect(acceptRedemptionDefault(paidOne, defaulted(), { verify: async () => false })).rejects.toThrow(/proof invalid/);
    await expect(acceptRedemptionDefault(paidOne, defaulted(), { verify: async () => id("performed-proof") })).rejects.toThrow(/replay/);
    const settled = await acceptRedemptionDefault(paidOne, defaulted(), { verify: async () => id("default-proof") });
    expect(settled.state).toBe("SETTLED");
    expect(redemptionOutcome(settled)).toBe("MIXED");
    expect(settled.requests[1]).toMatchObject({ state: "COLLATERAL_DEFAULT", redeemedVaultCollateralWei: 250n });
    expect(() => assertRedemptionJobIntegrity(settled)).not.toThrow();
    expect(() => redemptionOutcome({ ...settled, remainingAmountUBA: 301n })).toThrow(/drift/);
  });

  it("rejects async drift, replay, duplicate legs, invalid tags, and zero compensation", async () => {
    const created = createRedemptionJob(intent);
    const mutable = { ...created };
    await expect(requestRedemption(mutable, {
      requestRedemption: async () => {
        mutable.requestedAmountUBA = 999n;
        return receipt();
      },
    })).rejects.toThrow(/drift/);
    await expect(requestRedemption(created, {
      requestRedemption: async () => receipt({ requests: [requestEvent(), requestEvent()] }),
    })).rejects.toThrow(/receipt drift/);

    expect(() => createRedemptionJob({ ...intent, method: "WITH_TAG", destinationTag: (1n << 32n) })).toThrow(/invalid/);
    const taggedIntent: RedemptionIntentV1 = { ...intent, jobId: id("tagged-job"), method: "WITH_TAG", destinationTag: 7n };
    const tagged = createRedemptionJob(taggedIntent);
    await expect(requestRedemption(tagged, {
      requestRedemption: async () => receipt({
        requests: [requestEvent({ destinationTag: 8n }), requestEvent({ agentVault: agentB, requestId: 2n, valueUBA: 300n, feeUBA: 3n, paymentReference: id("tagged-reference-2"), destinationTag: 8n })],
      }),
    })).rejects.toThrow(/event invalid/);
    const taggedRequested = await requestRedemption(tagged, {
      requestRedemption: async () => receipt({
        requests: [requestEvent({ destinationTag: 7n }), requestEvent({ agentVault: agentB, requestId: 2n, valueUBA: 300n, feeUBA: 3n, paymentReference: id("tagged-reference-2"), destinationTag: 7n })],
      }),
    });
    expect(taggedRequested.requests.every((request) => request.destinationTag === 7n)).toBe(true);

    const requested = await requestRedemption(created, { requestRedemption: async () => receipt() });
    await expect(acceptRedemptionPerformed(requested, performed(), { verify: async () => id("performed-proof") }, new Set([id("performed-proof").toLowerCase()]))).rejects.toThrow(/replay/);
    await expect(acceptRedemptionDefault(requested, defaulted({ redeemedVaultCollateralWei: 0n, redeemedPoolCollateralWei: 0n }), { verify: async () => id("default-proof") })).rejects.toThrow(/invalid/);

    const mutableEvent = performed();
    await expect(acceptRedemptionPerformed(requested, mutableEvent, {
      verify: async () => {
        mutableEvent.transactionHash = id("mutated-underlying-tx");
        return id("mutated-proof");
      },
    })).rejects.toThrow(/drift/);
    const mutableJob = structuredClone(requested) as RedemptionJobV1;
    await expect(acceptRedemptionPerformed(mutableJob, performed(), {
      verify: async () => {
        mutableJob.requests[0]!.valueUBA = 399n;
        return id("mutated-job-proof");
      },
    })).rejects.toThrow(/drift/);
  });
});
