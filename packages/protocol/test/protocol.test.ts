import { getAddress, keccak256, padHex, stringToHex, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import { ACTION_FTESTXRP_TRANSFER, CHAIN_ID, ZERO_BYTES32 } from "../src/constants.js";
import { actionRequestHash, encodePolicyV1, evaluationDigest, genesisSpendCheckpoint, policyCommitment, policyReceiptDigest } from "../src/codec.js";
import { evaluatePolicy } from "../src/evaluator.js";
import type { ActionRequestV1, PolicyBindingV1, PolicyReceiptV1, PolicyV1, SpendStateV1 } from "../src/types.js";

const addressA = getAddress("0x00000000000000000000000000000000000000a1");
const addressB = getAddress("0x00000000000000000000000000000000000000b2");
const addressC = getAddress("0x00000000000000000000000000000000000000c3");
const id = (value: string) => padHex(stringToHex(value), { size: 32 });

const policy: PolicyV1 = {
  schemaVersion: 1, chainId: CHAIN_ID, registry: addressA, vault: addressB, router: addressC, owner: addressA,
  policyId: id("policy-1"), policyVersion: 1, asset: addressB, referenceCurrency: id("USD"), maxPerAction: 100n,
  dailyCap: 500n, rollingCap: 800n, rollingWindowSeconds: 86_400n, startAt: 1_000n, endAt: 10_000n,
  scheduleIntervalSeconds: 3_600n, scheduleGraceSeconds: 100n, cooldownSeconds: 0n, maxOccurrences: 5,
  allowTargets: [addressC, addressB], denyTargets: [], allowRequesters: [addressA],
  allowActionTypes: [ACTION_FTESTXRP_TRANSFER], requireFtso: false, ftsoFeedId: ZERO_BYTES32, maxPriceAgeSeconds: 0n,
  privateSalt: id("salt"), submissionNonce: id("submit"),
};

const request = (): ActionRequestV1 => ({
  chainId: CHAIN_ID, registry: addressA, vault: addressB, router: addressC, policyId: policy.policyId, policyVersion: 1,
  policyCommitment: policyCommitment(policy), requestId: id("request-1"), requestNonce: 1n, attempt: 0, requester: addressA,
  target: addressC, asset: addressB, actionType: ACTION_FTESTXRP_TRANSFER, amount: 75n, scheduleSlot: 1_000n, occurrence: 1,
  spendCheckpoint: genesisSpendCheckpoint(policyCommitment(policy)), balanceCheckpoint: id("balance-0"), inputCommitment: ZERO_BYTES32, createdAt: 1_001n,
  graceDeadline: 1_100n, expiry: 1_100n,
});

const state = (): SpendStateV1 => ({ availableBalance: 100n, dailySpend: 0n, rollingSpend: 0n, occurrenceCount: 0, lastExecutionAt: 0n,
  spendCheckpoint: request().spendCheckpoint, balanceCheckpoint: id("balance-0"), now: 1_050n });

function requestForPolicy(candidate: PolicyV1): ActionRequestV1 {
  const commitment = policyCommitment(candidate);
  return { ...request(), policyCommitment: commitment, spendCheckpoint: genesisSpendCheckpoint(commitment) };
}

function stateForRequest(candidate: ActionRequestV1): SpendStateV1 {
  return { ...state(), spendCheckpoint: candidate.spendCheckpoint };
}

describe("POLICY_SCHEMA_V1 deterministic codec", () => {
  it("canonicalizes unordered rule lists before hashing", () => {
    const reversed = { ...policy, allowTargets: [addressB, addressC] };
    expect(policyCommitment(policy)).toBe(policyCommitment(reversed));
    expect(encodePolicyV1(policy)).toMatch(/^0x[0-9a-f]+$/);
  });

  it("rejects duplicate or inconsistent private rules", () => {
    expect(() => policyCommitment({ ...policy, denyTargets: [addressC, addressC] })).toThrow(/duplicates/);
    expect(() => policyCommitment({ ...policy, requireFtso: true })).toThrow(/FTSO feed/);
    expect(() => policyCommitment({ ...policy, endAt: 999n })).toThrow(/endAt/);
    expect(() => policyCommitment({ ...policy, rollingWindowSeconds: 0n })).toThrow(/rolling window/);
    expect(() => policyCommitment({ ...policy, scheduleGraceSeconds: 3_600n })).toThrow(/recurring schedule/);
    expect(() => policyCommitment({ ...policy, endAt: 1_050n })).toThrow(/recurring schedule/);
    expect(() => policyCommitment({ ...policy, owner: zeroAddress })).toThrow(/non-zero/);
  });
});

describe("ACTION_REQUEST_V1 and result domains", () => {
  it("binds all public request fields", () => {
    const first = actionRequestHash(request());
    expect(first).not.toBe(actionRequestHash({ ...request(), amount: 76n }));
    expect(first).not.toBe(actionRequestHash({ ...request(), attempt: 1 }));
    expect(first).not.toBe(actionRequestHash({ ...request(), expiry: 1_201n }));
  });

  it("binds machine and decision fields in result signatures", () => {
    const base = { request: request(), decision: "ALLOW" as const, publicReasonClass: "OK" as const, reservedAmount: 75n,
      resultingCheckpoint: id("next"), resultNonce: id("result"), attempt: 0, issuedAt: 1_050n, expiry: 1_200n,
      machineId: id("machine-a"), keyFingerprint: id("key-a") };
    expect(evaluationDigest(base)).toBe(evaluationDigest({ ...base, machineId: id("machine-b") }));
    expect(evaluationDigest(base)).not.toBe(evaluationDigest({ ...base, decision: "DENY", publicReasonClass: "POLICY_DENIED", reservedAmount: 0n }));
  });

  it("binds receipt machine, owner, and expiry", () => {
    const binding: PolicyBindingV1 = { chainId: CHAIN_ID, registry: addressA, vault: addressB, router: addressC, owner: addressA,
      policyId: policy.policyId, policyVersion: 1, policyCommitment: policyCommitment(policy), schema: id("schema"), extensionId: id("ext"),
      codeVersion: id("code"), machineIds: [id("m1"), id("m2"), id("m3")], keyFingerprints: [id("k1"), id("k2"), id("k3")],
      custodyThreshold: 3, resultThreshold: 2, policyNonce: 1n };
    const receipt: PolicyReceiptV1 = { binding, machineId: id("m1"), keyFingerprint: id("k1"), submissionNonce: id("submit"), receiptNonce: 1n, issuedAt: 1_000n, expiry: 2_000n };
    expect(policyReceiptDigest(receipt)).not.toBe(policyReceiptDigest({ ...receipt, expiry: 2_001n }));
  });
});

describe("deterministic evaluator", () => {
  it("allows an eligible action and computes a new checkpoint", () => {
    const result = evaluatePolicy(policy, request(), state());
    expect(result.decision).toBe("ALLOW");
    expect(result.reservedAmount).toBe(75n);
    expect(result.publicReasonClass).toBe("OK");
    expect(result.resultingCheckpoint).not.toBe(request().spendCheckpoint);
  });

  it.each([
    ["wrong domain", { chainId: 115n }, "WRONG_DOMAIN"],
    ["deny target", { target: addressA }, "TARGET_DENIED"],
    ["requester not allowed", { requester: addressB }, "REQUESTER_DENIED"],
    ["balance exceeded", { amount: 101n }, "INSUFFICIENT_BALANCE"],
    ["expired", { expiry: 1_049n }, "EXPIRED"],
  ] as const)("denies %s", (_label, requestPatch, expected) => {
    const result = evaluatePolicy(policy, { ...request(), ...requestPatch }, state());
    expect(result.decision).toBe("DENY");
    expect(result.publicReasonClass).toBe(expected);
  });

  it("denies a request over the per-action cap", () => {
    const cappedPolicy = { ...policy, maxPerAction: 50n };
    const cappedRequest = requestForPolicy(cappedPolicy);
    const result = evaluatePolicy(cappedPolicy, cappedRequest, stateForRequest(cappedRequest));
    expect(result.publicReasonClass).toBe("CAP_EXCEEDED");
  });

  it("uses deny precedence and fails closed for missing FTSO", () => {
    const ftsoPolicy = { ...policy, requireFtso: true, ftsoFeedId: id("feed"), maxPriceAgeSeconds: 60n };
    const ftsoRequest = { ...requestForPolicy(ftsoPolicy), inputCommitment: keccak256(stringToHex("ftso")) };
    const result = evaluatePolicy(ftsoPolicy, ftsoRequest, stateForRequest(ftsoRequest));
    expect(result.decision).toBe("DENY");
    expect(result.publicReasonClass).toBe("FTSO_INVALID");
    const deniedPolicy = { ...policy, denyTargets: [addressC] };
    const deniedRequest = requestForPolicy(deniedPolicy);
    expect(evaluatePolicy(deniedPolicy, deniedRequest, stateForRequest(deniedRequest)).publicReasonClass).toBe("TARGET_DENIED");
    const conflictingPolicy = { ...deniedPolicy, maxPerAction: 1n };
    const conflictingRequest = requestForPolicy(conflictingPolicy);
    expect(evaluatePolicy(
      conflictingPolicy,
      conflictingRequest,
      { ...stateForRequest(conflictingRequest), availableBalance: 1n },
    ).publicReasonClass).toBe("TARGET_DENIED");
  });

  it("rejects stale public checkpoints and future requests", () => {
    expect(evaluatePolicy(policy, request(), { ...state(), spendCheckpoint: id("other-spend") }).publicReasonClass).toBe("STALE_INPUT");
    expect(evaluatePolicy(policy, { ...request(), createdAt: 1_051n }, state()).publicReasonClass).toBe("MALFORMED");
    expect(evaluatePolicy(policy, { ...request(), occurrence: 2 }, state()).publicReasonClass).toBe("STALE_INPUT");
    expect(evaluatePolicy(
      policy,
      { ...request(), occurrence: 2 ** 32 },
      { ...state(), occurrenceCount: 2 ** 32 - 1 },
    ).publicReasonClass).toBe("STALE_INPUT");
    const forged = id("forged-genesis");
    expect(evaluatePolicy(policy, { ...request(), spendCheckpoint: forged }, { ...state(), spendCheckpoint: forged }).publicReasonClass).toBe("STALE_INPUT");
  });

  it("enforces exact inclusive recurring windows", () => {
    expect(evaluatePolicy(policy, request(), { ...state(), now: 1_100n }).decision).toBe("ALLOW");
    expect(evaluatePolicy(policy, { ...request(), scheduleSlot: 1_001n }, state()).publicReasonClass).toBe("POLICY_DENIED");
    expect(evaluatePolicy(policy, { ...request(), createdAt: 999n }, state()).publicReasonClass).toBe("POLICY_DENIED");
    expect(evaluatePolicy(policy, { ...request(), graceDeadline: 1_101n, expiry: 1_101n }, state()).publicReasonClass).toBe("POLICY_DENIED");
    expect(evaluatePolicy(policy, request(), { ...state(), now: 1_101n }).publicReasonClass).toBe("EXPIRED");
    const adHocPolicy = { ...policy, scheduleIntervalSeconds: 0n, scheduleGraceSeconds: 0n };
    const adHocRequest = { ...requestForPolicy(adHocPolicy), scheduleSlot: 0n };
    expect(evaluatePolicy(adHocPolicy, adHocRequest, stateForRequest(adHocRequest)).decision).toBe("ALLOW");
  });

  it("defaults delegated authority to owner-only", () => {
    const ownerOnlyPolicy = { ...policy, allowRequesters: [] };
    const ownerRequest = requestForPolicy(ownerOnlyPolicy);
    expect(evaluatePolicy(ownerOnlyPolicy, ownerRequest, stateForRequest(ownerRequest)).decision).toBe("ALLOW");
    expect(evaluatePolicy(
      ownerOnlyPolicy,
      { ...ownerRequest, requester: addressB },
      stateForRequest(ownerRequest),
    ).publicReasonClass).toBe("REQUESTER_DENIED");
    const delegatedPolicy = { ...ownerOnlyPolicy, allowRequesters: [addressB] };
    const delegatedRequest = { ...requestForPolicy(delegatedPolicy), requester: addressB };
    expect(evaluatePolicy(delegatedPolicy, delegatedRequest, stateForRequest(delegatedRequest)).decision).toBe("ALLOW");
  });

  it("binds an FTSO decision to the request input commitment", () => {
    const feedId = id("xrp-usd");
    const feedCheckpoint = id("ftso-checkpoint");
    const ftsoPolicy = { ...policy, requireFtso: true, ftsoFeedId: feedId, maxPriceAgeSeconds: 60n };
    const ftsoRequest = { ...requestForPolicy(ftsoPolicy), inputCommitment: feedCheckpoint };
    const ftsoState = { ...stateForRequest(ftsoRequest), ftso: { feedId, value: 1n, decimals: 0, timestamp: 1_040n, checkpoint: feedCheckpoint } };
    expect(evaluatePolicy(ftsoPolicy, ftsoRequest, ftsoState).decision).toBe("ALLOW");
    expect(evaluatePolicy(ftsoPolicy, { ...ftsoRequest, inputCommitment: id("different") }, ftsoState).publicReasonClass).toBe("FTSO_INVALID");
  });
});
