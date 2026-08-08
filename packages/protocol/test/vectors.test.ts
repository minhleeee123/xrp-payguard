import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { actionRequestHash, evaluationAttestationDigest, evaluationDigest, policyCommitment, policyReceiptAttestationDigest, policyReceiptDigest } from "../src/codec.js";
import { evaluatePolicy } from "../src/evaluator.js";
import type { ActionRequestV1, PolicyBindingV1, PolicyReceiptV1, PolicyV1, SpendStateV1 } from "../src/types.js";

const vector = JSON.parse(readFileSync(resolve(import.meta.dirname, "../fixtures/v1.json"), "utf8")) as {
  policy: Record<string, unknown>; binding: Record<string, unknown>; receipt: Record<string, unknown>; request: Record<string, unknown>;
  result: Record<string, unknown>; expected: Record<string, string>;
};
const bigintFields = ["chainId", "maxPerAction", "dailyCap", "rollingCap", "rollingWindowSeconds", "startAt", "endAt", "scheduleIntervalSeconds", "scheduleGraceSeconds", "cooldownSeconds", "maxPriceAgeSeconds"];
const policy = { ...vector.policy } as unknown as PolicyV1;
for (const field of bigintFields) (policy as unknown as Record<string, unknown>)[field] = BigInt(policy[field as keyof PolicyV1] as string);
const request = { ...vector.request } as unknown as ActionRequestV1;
for (const field of ["chainId", "requestNonce", "amount", "scheduleSlot", "createdAt", "graceDeadline", "expiry"]) (request as unknown as Record<string, unknown>)[field] = BigInt(request[field as keyof ActionRequestV1] as string);
const binding = { ...vector.binding, chainId: BigInt(vector.binding.chainId as string), policyNonce: BigInt(vector.binding.policyNonce as string) } as unknown as PolicyBindingV1;
const receipt = { ...vector.receipt, receiptNonce: BigInt(vector.receipt.receiptNonce as string), issuedAt: BigInt(vector.receipt.issuedAt as string), expiry: BigInt(vector.receipt.expiry as string), binding } as unknown as PolicyReceiptV1;

describe("cross-language golden vector", () => {
  it("matches policy, receipt, request, and result domains", () => {
    expect(request.requestNonce).toBe(1n << 64n);
    expect(policyCommitment(policy)).toBe(vector.expected.policyCommitment);
    expect(policyReceiptDigest(receipt)).toBe(vector.expected.receiptDigest);
    expect(policyReceiptAttestationDigest(receipt)).toBe(vector.expected.receiptAttestationDigest);
    expect(actionRequestHash(request)).toBe(vector.expected.requestHash);
    const state: SpendStateV1 = { availableBalance: 100n, history: [], occurrenceCount: 0, lastAccountingAt: 0n,
      spendCheckpoint: request.spendCheckpoint, balanceCheckpoint: request.balanceCheckpoint, now: 1050n };
    const evaluated = evaluatePolicy(policy, request, state);
    const result = { ...evaluated, machineId: vector.result.machineId, keyFingerprint: vector.result.keyFingerprint } as typeof evaluated;
    expect(result.resultingCheckpoint).toBe(vector.result.resultingCheckpoint);
    expect(evaluationDigest(result)).toBe(vector.expected.evaluationDigest);
    expect(evaluationAttestationDigest(result)).toBe(vector.expected.evaluationAttestationDigest);
  });
});
