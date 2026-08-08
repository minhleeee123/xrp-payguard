import type { Hex } from "viem";

export type { Hex };

export type Decision = "ALLOW" | "DENY";

export type PublicReasonClass =
  | "OK"
  | "POLICY_DENIED"
  | "MALFORMED"
  | "WRONG_DOMAIN"
  | "STALE_INPUT"
  | "DEPENDENCY_UNAVAILABLE"
  | "EXPIRED"
  | "STOPPED"
  | "INSUFFICIENT_BALANCE"
  | "CAP_EXCEEDED"
  | "OCCURRENCE_EXCEEDED"
  | "TARGET_DENIED"
  | "REQUESTER_DENIED"
  | "ACTION_DENIED"
  | "FTSO_INVALID"
  | "COOLDOWN";

/** Private policy material. It is never a contract or event field. */
export interface PolicyV1 {
  schemaVersion: number;
  chainId: bigint;
  registry: Hex;
  vault: Hex;
  router: Hex;
  owner: Hex;
  policyId: Hex;
  policyVersion: number;
  asset: Hex;
  referenceCurrency: Hex;
  maxPerAction: bigint;
  dailyCap: bigint;
  rollingCap: bigint;
  rollingWindowSeconds: bigint;
  startAt: bigint;
  endAt: bigint;
  cooldownSeconds: bigint;
  maxOccurrences: number;
  allowTargets: Hex[];
  denyTargets: Hex[];
  allowRequesters: Hex[];
  allowActionTypes: Hex[];
  requireFtso: boolean;
  ftsoFeedId: Hex;
  maxPriceAgeSeconds: bigint;
  privateSalt: Hex;
  submissionNonce: Hex;
}

/** Public policy binding frozen by the registry after custody receipts. */
export interface PolicyBindingV1 {
  chainId: bigint;
  registry: Hex;
  vault: Hex;
  router: Hex;
  owner: Hex;
  policyId: Hex;
  policyVersion: number;
  policyCommitment: Hex;
  schema: Hex;
  extensionId: Hex;
  codeVersion: Hex;
  machineIds: [Hex, Hex, Hex];
  keyFingerprints: [Hex, Hex, Hex];
  custodyThreshold: number;
  resultThreshold: number;
  policyNonce: bigint;
}

export interface PolicyReceiptV1 {
  binding: PolicyBindingV1;
  machineId: Hex;
  keyFingerprint: Hex;
  submissionNonce: Hex;
  receiptNonce: bigint;
  issuedAt: bigint;
  expiry: bigint;
}

export interface ActionRequestV1 {
  chainId: bigint;
  registry: Hex;
  vault: Hex;
  router: Hex;
  policyId: Hex;
  policyVersion: number;
  policyCommitment: Hex;
  requestId: Hex;
  requestNonce: bigint;
  attempt: number;
  requester: Hex;
  target: Hex;
  asset: Hex;
  actionType: Hex;
  amount: bigint;
  scheduleSlot: bigint;
  occurrence: number;
  spendCheckpoint: Hex;
  balanceCheckpoint: Hex;
  inputCommitment: Hex;
  createdAt: bigint;
  graceDeadline: bigint;
  expiry: bigint;
}

export interface FtsoSnapshotV1 {
  feedId: Hex;
  value: bigint;
  decimals: number;
  timestamp: bigint;
  checkpoint: Hex;
}

export interface SpendStateV1 {
  availableBalance: bigint;
  dailySpend: bigint;
  rollingSpend: bigint;
  occurrenceCount: number;
  lastExecutionAt: bigint;
  spendCheckpoint: Hex;
  balanceCheckpoint: Hex;
  now: bigint;
  ftso?: FtsoSnapshotV1;
}

export interface EvaluationResultV1 {
  request: ActionRequestV1;
  decision: Decision;
  publicReasonClass: PublicReasonClass;
  reservedAmount: bigint;
  resultingCheckpoint: Hex;
  resultNonce: Hex;
  attempt: number;
  issuedAt: bigint;
  expiry: bigint;
  machineId: Hex;
  keyFingerprint: Hex;
}
