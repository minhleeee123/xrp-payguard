import { encodeAbiParameters, keccak256, type Hex } from "viem";
import { ACTION_FTESTXRP_TRANSFER, SPEND_CHECKPOINT_V1, ZERO_BYTES32 } from "./constants.js";
import { actionRequestHash, genesisSpendCheckpoint, normalizePolicy, policyCommitment } from "./codec.js";
import { scheduleWindowV1 } from "./schedule.js";
import { MAX_SPEND_WINDOW_ENTRIES_V1, spendWindowTotalsV1, type SpendWindowEntryV1 } from "./spend-window.js";
import type { ActionRequestV1, Decision, EvaluationResultV1, FtsoSnapshotV1, PolicyV1, PublicReasonClass, SpendStateV1 } from "./types.js";

const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_UINT32 = 2 ** 32 - 1;

export const POLICY_VIOLATION_V1 = {
  POLICY_DENIED: 1n << 0n,
  TARGET_DENIED: 1n << 1n,
  REQUESTER_DENIED: 1n << 2n,
  ACTION_DENIED: 1n << 3n,
  OCCURRENCE_EXCEEDED: 1n << 4n,
  COOLDOWN: 1n << 5n,
  INSUFFICIENT_BALANCE: 1n << 6n,
  FTSO_INVALID: 1n << 7n,
  CAP_EXCEEDED: 1n << 8n,
} as const;

const POLICY_VIOLATION_MASK_V1 = Object.values(POLICY_VIOLATION_V1)
  .reduce((mask, violation) => mask | violation, 0n);

const POLICY_REASON_PRIORITY_V1 = Object.entries(POLICY_VIOLATION_V1) as
  [Exclude<PublicReasonClass, "OK" | "MALFORMED" | "WRONG_DOMAIN" | "STALE_INPUT" | "DEPENDENCY_UNAVAILABLE" | "EXPIRED" | "STOPPED">, bigint][];

/** Resolves simultaneous private rule outcomes without revealing the rules. */
export function composePolicyDecisionV1(violations: bigint): Pick<EvaluationResultV1, "decision" | "publicReasonClass"> {
  if (violations < 0n || (violations & ~POLICY_VIOLATION_MASK_V1) !== 0n) {
    return { decision: "DENY", publicReasonClass: "MALFORMED" };
  }
  for (const [reason, flag] of POLICY_REASON_PRIORITY_V1) {
    if ((violations & flag) !== 0n) return { decision: "DENY", publicReasonClass: reason };
  }
  return { decision: "ALLOW", publicReasonClass: "OK" };
}

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

/** Converts a public asset amount to its reference value, rounding caps upward. */
export function referenceValueV1(amount: bigint, price: bigint, priceDecimals: number): bigint | null {
  if (amount < 0n || amount > MAX_UINT256 || price <= 0n || price > MAX_UINT256
    || !Number.isInteger(priceDecimals) || priceDecimals < 0 || priceDecimals > 36) return null;
  const scale = 10n ** BigInt(priceDecimals);
  if (amount !== 0n && price > MAX_UINT256 / amount) return null;
  const product = amount * price;
  return product / scale + (product % scale === 0n ? 0n : 1n);
}

function nextCheckpoint(request: ActionRequestV1, amount: bigint, occurrence: number, now: bigint): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "uint32" }, { type: "uint64" }],
    [SPEND_CHECKPOINT_V1, request.spendCheckpoint, actionRequestHash(request), amount, occurrence, now],
  ));
}

function matchesPolicyDomain(policy: PolicyV1, request: ActionRequestV1, commitment: Hex): boolean {
  return request.chainId === policy.chainId && request.registry.toLowerCase() === policy.registry.toLowerCase()
    && request.vault.toLowerCase() === policy.vault.toLowerCase() && request.router.toLowerCase() === policy.router.toLowerCase()
    && request.policyId.toLowerCase() === policy.policyId.toLowerCase() && request.policyVersion === policy.policyVersion
    && request.policyCommitment.toLowerCase() === commitment.toLowerCase();
}

function ftsoReferenceValue(
  policy: PolicyV1,
  request: ActionRequestV1,
  feed: FtsoSnapshotV1 | undefined,
  now: bigint,
): bigint | null {
  if (!feed || feed.feedId.toLowerCase() !== policy.ftsoFeedId.toLowerCase()
    || feed.timestamp > now || now - feed.timestamp > policy.maxPriceAgeSeconds
    || feed.checkpoint === ZERO_BYTES32 || request.inputCommitment.toLowerCase() !== feed.checkpoint.toLowerCase()) return null;
  return referenceValueV1(request.amount, feed.value, feed.decimals);
}

function replaySpendHistoryV1(
  policy: PolicyV1,
  state: SpendStateV1,
  commitment: Hex,
): { dailySpend: bigint; rollingSpend: bigint } | PublicReasonClass {
  if (!Array.isArray(state.history) || state.history.length > MAX_SPEND_WINDOW_ENTRIES_V1) return "MALFORMED";
  let checkpoint = genesisSpendCheckpoint(commitment);
  const windowEntries: SpendWindowEntryV1[] = [];
  try {
    for (let index = 0; index < state.history.length; index += 1) {
      const entry = state.history[index]!;
      const historyRequest = entry.request;
      const occurrence = index + 1;
      if (!historyRequest || occurrence > MAX_UINT32
        || !matchesPolicyDomain(policy, historyRequest, commitment)
        || historyRequest.asset.toLowerCase() !== policy.asset.toLowerCase()
        || historyRequest.actionType.toLowerCase() !== ACTION_FTESTXRP_TRANSFER.toLowerCase()
        || historyRequest.amount <= 0n || historyRequest.amount > MAX_UINT256
        || historyRequest.occurrence !== occurrence
        || historyRequest.spendCheckpoint.toLowerCase() !== checkpoint.toLowerCase()
        || entry.accountedAt < historyRequest.createdAt || entry.accountedAt > historyRequest.expiry
        || historyRequest.graceDeadline < historyRequest.createdAt
        || historyRequest.expiry < historyRequest.graceDeadline || entry.accountedAt > state.now) return "MALFORMED";
      let value = historyRequest.amount;
      if (policy.requireFtso) {
        const converted = ftsoReferenceValue(policy, historyRequest, entry.ftso, entry.accountedAt);
        if (converted === null) return "FTSO_INVALID";
        value = converted;
      } else if (entry.ftso !== undefined) {
        return "MALFORMED";
      }
      checkpoint = nextCheckpoint(historyRequest, historyRequest.amount, occurrence, entry.accountedAt);
      windowEntries.push({ value, executedAt: entry.accountedAt });
    }
  } catch {
    return "MALFORMED";
  }
  const lastAccountingAt = state.history.at(-1)?.accountedAt ?? 0n;
  if (state.occurrenceCount !== state.history.length || state.lastAccountingAt !== lastAccountingAt
    || state.spendCheckpoint.toLowerCase() !== checkpoint.toLowerCase()) return "STALE_INPUT";
  const effectiveWindow = policy.rollingWindowSeconds === 0n ? 1n : policy.rollingWindowSeconds;
  return spendWindowTotalsV1(windowEntries, state.now, effectiveWindow) ?? "MALFORMED";
}

export function evaluatePolicy(policyInput: PolicyV1, request: ActionRequestV1, state: SpendStateV1): EvaluationResultV1 {
  const policy = normalizePolicy(policyInput);
  const now = state.now;
  if (state.availableBalance < 0n || state.lastAccountingAt < 0n
    || !Number.isInteger(state.occurrenceCount) || state.occurrenceCount < 0 || state.occurrenceCount > MAX_UINT32) {
    return deny(request, "MALFORMED", now);
  }
  const commitment = policyCommitment(policy);
  const domainMatches = matchesPolicyDomain(policy, request, commitment);
  if (!domainMatches) return deny(request, "WRONG_DOMAIN", now);
  if (state.spendCheckpoint.toLowerCase() !== request.spendCheckpoint.toLowerCase()
    || state.balanceCheckpoint.toLowerCase() !== request.balanceCheckpoint.toLowerCase()
    || state.occurrenceCount === MAX_UINT32
    || request.occurrence !== state.occurrenceCount + 1
    || (state.occurrenceCount === 0
      && request.spendCheckpoint.toLowerCase() !== genesisSpendCheckpoint(request.policyCommitment).toLowerCase())) {
    return deny(request, "STALE_INPUT", now);
  }
  const historyTotals = replaySpendHistoryV1(policy, state, commitment);
  if (typeof historyTotals === "string") return deny(request, historyTotals, now);
  if (request.asset.toLowerCase() !== policy.asset.toLowerCase() || request.actionType.toLowerCase() !== ACTION_FTESTXRP_TRANSFER.toLowerCase()
    || request.amount <= 0n || request.createdAt > now || request.expiry < now || request.graceDeadline < request.createdAt || request.expiry < request.graceDeadline) {
    return deny(request, request.expiry < now ? "EXPIRED" : "MALFORMED", now);
  }
  let violations = 0n;
  if (policy.startAt > now || (policy.endAt !== 0n && now > policy.endAt)) violations |= POLICY_VIOLATION_V1.POLICY_DENIED;
  if (policy.scheduleIntervalSeconds === 0n) {
    if (request.scheduleSlot !== 0n) violations |= POLICY_VIOLATION_V1.POLICY_DENIED;
  } else {
    const window = scheduleWindowV1(
      policy.startAt,
      policy.scheduleIntervalSeconds,
      policy.scheduleGraceSeconds,
      BigInt(request.occurrence),
    );
    if (!window || request.scheduleSlot !== window.slot || request.createdAt < window.slot
      || request.createdAt > window.deadline || request.graceDeadline !== window.deadline
      || request.expiry !== window.deadline || now < window.slot || now > window.deadline
      || (policy.endAt !== 0n && window.deadline > policy.endAt)) violations |= POLICY_VIOLATION_V1.POLICY_DENIED;
  }
  if (containsAddress(policy.denyTargets, request.target)
    || (policy.allowTargets.length > 0 && !containsAddress(policy.allowTargets, request.target))) violations |= POLICY_VIOLATION_V1.TARGET_DENIED;
  if (request.requester.toLowerCase() !== policy.owner.toLowerCase()
    && !containsAddress(policy.allowRequesters, request.requester)) violations |= POLICY_VIOLATION_V1.REQUESTER_DENIED;
  if (policy.allowActionTypes.length > 0 && !containsBytes32(policy.allowActionTypes, request.actionType)) violations |= POLICY_VIOLATION_V1.ACTION_DENIED;
  if (policy.maxOccurrences !== 0 && state.occurrenceCount >= policy.maxOccurrences) violations |= POLICY_VIOLATION_V1.OCCURRENCE_EXCEEDED;
  if (policy.cooldownSeconds !== 0n && state.lastAccountingAt !== 0n && now < state.lastAccountingAt + policy.cooldownSeconds) violations |= POLICY_VIOLATION_V1.COOLDOWN;
  if (state.availableBalance < request.amount) violations |= POLICY_VIOLATION_V1.INSUFFICIENT_BALANCE;
  let referenceValue = request.amount;
  if (policy.requireFtso) {
    const value = ftsoReferenceValue(policy, request, state.ftso, now);
    if (value === null) violations |= POLICY_VIOLATION_V1.FTSO_INVALID;
    else referenceValue = value;
  }
  if ((violations & POLICY_VIOLATION_V1.FTSO_INVALID) === 0n && ((policy.maxPerAction !== 0n && referenceValue > policy.maxPerAction)
    || (policy.dailyCap !== 0n && historyTotals.dailySpend + referenceValue > policy.dailyCap)
    || (policy.rollingCap !== 0n && historyTotals.rollingSpend + referenceValue > policy.rollingCap))) violations |= POLICY_VIOLATION_V1.CAP_EXCEEDED;
  const composed = composePolicyDecisionV1(violations);
  if (composed.decision === "DENY") return deny(request, composed.publicReasonClass, now);
  const result: EvaluationResultV1 = { request, decision: "ALLOW", publicReasonClass: "OK", reservedAmount: request.amount,
    resultingCheckpoint: nextCheckpoint(request, request.amount, state.occurrenceCount + 1, now), resultNonce: request.requestId,
    attempt: request.attempt, issuedAt: now, expiry: request.expiry, machineId: ZERO_BYTES32, keyFingerprint: ZERO_BYTES32 };
  return result;
}
