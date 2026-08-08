import { encodeAbiParameters, keccak256, type Hex } from "viem";
import { ACTION_FTESTXRP_TRANSFER, ZERO_BYTES32 } from "./constants.js";
import { actionRequestHash, normalizePolicy, policyCommitment } from "./codec.js";
import type { ActionRequestV1, Decision, EvaluationResultV1, PolicyV1, PublicReasonClass, SpendStateV1 } from "./types.js";

function deny(request: ActionRequestV1, reason: PublicReasonClass, now: bigint, machineId: Hex = ZERO_BYTES32, keyFingerprint: Hex = ZERO_BYTES32): EvaluationResultV1 {
  return { request, decision: "DENY", publicReasonClass: reason, reservedAmount: 0n, resultingCheckpoint: request.spendCheckpoint,
    resultNonce: request.requestId, attempt: request.attempt, issuedAt: now, expiry: request.expiry, machineId, keyFingerprint };
}

function containsAddress(values: Hex[], value: Hex): boolean {
  return values.some((candidate) => candidate.toLowerCase() === value.toLowerCase());
}

function containsBytes32(values: Hex[], value: Hex): boolean {
  return values.some((candidate) => candidate.toLowerCase() === value.toLowerCase());
}

function checkedReferenceValue(amount: bigint, price: bigint, priceDecimals: number): bigint | null {
  if (price <= 0n || priceDecimals < 0 || priceDecimals > 36) return null;
  const scale = 10n ** BigInt(priceDecimals);
  if (amount !== 0n && price > ((1n << 256n) - 1n) / amount) return null;
  return (amount * price + scale - 1n) / scale;
}

function nextCheckpoint(request: ActionRequestV1, amount: bigint, occurrence: number, now: bigint): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "uint32" }, { type: "uint64" }],
    [request.spendCheckpoint, actionRequestHash(request), amount, occurrence, now],
  ));
}

export function evaluatePolicy(policyInput: PolicyV1, request: ActionRequestV1, state: SpendStateV1): EvaluationResultV1 {
  const policy = normalizePolicy(policyInput);
  const now = state.now;
  if (state.availableBalance < 0n || state.dailySpend < 0n || state.rollingSpend < 0n || state.occurrenceCount < 0) {
    return deny(request, "MALFORMED", now);
  }
  const domainMatches = request.chainId === policy.chainId && request.registry.toLowerCase() === policy.registry.toLowerCase()
    && request.vault.toLowerCase() === policy.vault.toLowerCase() && request.router.toLowerCase() === policy.router.toLowerCase()
    && request.policyId.toLowerCase() === policy.policyId.toLowerCase() && request.policyVersion === policy.policyVersion
    && request.policyCommitment.toLowerCase() === policyCommitment(policy).toLowerCase();
  if (!domainMatches) return deny(request, "WRONG_DOMAIN", now);
  if (state.spendCheckpoint.toLowerCase() !== request.spendCheckpoint.toLowerCase()
    || state.balanceCheckpoint.toLowerCase() !== request.balanceCheckpoint.toLowerCase()) {
    return deny(request, "STALE_INPUT", now);
  }
  if (request.asset.toLowerCase() !== policy.asset.toLowerCase() || request.actionType.toLowerCase() !== ACTION_FTESTXRP_TRANSFER.toLowerCase()
    || request.amount <= 0n || request.createdAt > now || request.expiry < now || request.graceDeadline < request.createdAt || request.expiry < request.graceDeadline) {
    return deny(request, request.expiry < now ? "EXPIRED" : "MALFORMED", now);
  }
  if (policy.startAt > now || (policy.endAt !== 0n && now > policy.endAt)) return deny(request, "POLICY_DENIED", now);
  if (containsAddress(policy.denyTargets, request.target)) return deny(request, "TARGET_DENIED", now);
  if (policy.allowTargets.length > 0 && !containsAddress(policy.allowTargets, request.target)) return deny(request, "TARGET_DENIED", now);
  if (policy.allowRequesters.length > 0 && !containsAddress(policy.allowRequesters, request.requester)) return deny(request, "REQUESTER_DENIED", now);
  if (policy.allowActionTypes.length > 0 && !containsBytes32(policy.allowActionTypes, request.actionType)) return deny(request, "ACTION_DENIED", now);
  if (policy.maxOccurrences !== 0 && state.occurrenceCount >= policy.maxOccurrences) return deny(request, "OCCURRENCE_EXCEEDED", now);
  if (policy.cooldownSeconds !== 0n && state.lastExecutionAt !== 0n && now < state.lastExecutionAt + policy.cooldownSeconds) return deny(request, "COOLDOWN", now);
  if (state.availableBalance < request.amount) return deny(request, "INSUFFICIENT_BALANCE", now);
  let referenceValue = request.amount;
  if (policy.requireFtso) {
    const feed = state.ftso;
    if (!feed || feed.feedId.toLowerCase() !== policy.ftsoFeedId.toLowerCase() || feed.timestamp > now || now - feed.timestamp > policy.maxPriceAgeSeconds
      || feed.checkpoint === ZERO_BYTES32 || request.inputCommitment.toLowerCase() !== feed.checkpoint.toLowerCase()) return deny(request, "FTSO_INVALID", now);
    const value = checkedReferenceValue(request.amount, feed.value, feed.decimals);
    if (value === null) return deny(request, "FTSO_INVALID", now);
    referenceValue = value;
  }
  if ((policy.maxPerAction !== 0n && referenceValue > policy.maxPerAction)
    || (policy.dailyCap !== 0n && state.dailySpend + referenceValue > policy.dailyCap)
    || (policy.rollingCap !== 0n && state.rollingSpend + referenceValue > policy.rollingCap)) return deny(request, "CAP_EXCEEDED", now);
  const result: EvaluationResultV1 = { request, decision: "ALLOW", publicReasonClass: "OK", reservedAmount: request.amount,
    resultingCheckpoint: nextCheckpoint(request, request.amount, state.occurrenceCount + 1, now), resultNonce: request.requestId,
    attempt: request.attempt, issuedAt: now, expiry: request.expiry, machineId: ZERO_BYTES32, keyFingerprint: ZERO_BYTES32 };
  return result;
}
