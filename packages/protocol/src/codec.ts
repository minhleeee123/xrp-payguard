import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  type AbiParameter,
  type Hex,
} from "viem";
import {
  ACTION_REQUEST_V1,
  EVALUATION_RESULT_V1,
  FDC_TRIGGER_SNAPSHOT_V1,
  FDC_XRP_PAYMENT_V1,
  FCC_EVALUATION_PREFIX,
  FCC_POLICY_INGRESS_PREFIX,
  FCC_POLICY_RECEIPT_PREFIX,
  POLICY_RECEIPT_V1,
  POLICY_INPUT_V1,
  POLICY_SCHEMA_V1,
  REASON_CODE,
  SPEND_CHECKPOINT_V1,
  ZERO_BYTES32,
} from "./constants.js";
import type { ActionRequestV1, FdcTriggerSnapshotV1, PolicyBindingV1, PolicyReceiptV1, PolicyV1 } from "./types.js";
import { scheduleWindowV1 } from "./schedule.js";

const policyParameters: readonly AbiParameter[] = [
  { type: "uint16" }, { type: "uint256" }, { type: "address" }, { type: "address" }, { type: "address" },
  { type: "address" }, { type: "bytes32" }, { type: "uint32" }, { type: "address" }, { type: "bytes32" },
  { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "uint64" },
  { type: "uint64" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" }, { type: "uint32" }, { type: "address[]" }, { type: "address[]" },
  { type: "address[]" }, { type: "bytes32[]" }, { type: "bool" }, { type: "bytes32" }, { type: "uint64" },
  { type: "bool" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" },
  { type: "uint8" }, { type: "bool" }, { type: "uint32" }, { type: "uint256" }, { type: "uint256" },
  { type: "uint64" }, { type: "address" },
  { type: "bytes32" }, { type: "bytes32" },
];

const fdcSnapshotParameters: readonly AbiParameter[] = [
  { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "address" },
  { type: "address" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" },
  { type: "uint256" }, { type: "bool" }, { type: "bytes32" }, { type: "bool" }, { type: "uint32" },
  { type: "uint64" }, { type: "uint64" }, { type: "bool" }, { type: "bool" }, { type: "bytes32" },
  { type: "bytes32" }, { type: "uint8" },
];

const policyBindingParameters: readonly AbiParameter[] = [
  { type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "address" }, { type: "address" },
  { type: "address" }, { type: "bytes32" }, { type: "uint32" }, { type: "bytes32" }, { type: "bytes32" },
  { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32[3]" }, { type: "bytes32[3]" }, { type: "uint8" }, { type: "uint8" },
  { type: "uint64" },
];

const receiptParameters: readonly AbiParameter[] = [
  ...policyBindingParameters, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" },
  { type: "uint64" }, { type: "uint64" }, { type: "uint64" },
];

const requestParameters: readonly AbiParameter[] = [
  { type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "address" }, { type: "address" },
  { type: "bytes32" }, { type: "uint32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" },
  { type: "uint32" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "bytes32" },
  { type: "uint256" }, { type: "uint64" }, { type: "uint32" }, { type: "bytes32" }, { type: "bytes32" },
  { type: "bytes32" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" },
];

const resultParameters: readonly AbiParameter[] = [
  { type: "bytes32" }, ...requestParameters, { type: "bytes32" }, { type: "uint8" }, { type: "uint8" }, { type: "uint256" },
  { type: "bytes32" }, { type: "bytes32" }, { type: "uint32" }, { type: "uint64" }, { type: "uint64" },
];

const fccAttestationParameters: readonly AbiParameter[] = [
  { type: "bytes32" }, { type: "uint256" }, { type: "bytes32" },
];

const ingressAuthorizationParameters: readonly AbiParameter[] = [
  { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint64" },
  { type: "uint64" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" },
];

function bytes32(value: Hex, label: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} must be bytes32`);
  return value.toLowerCase() as Hex;
}

function uint(value: bigint | number, label: string): bigint {
  const result = typeof value === "number" ? BigInt(value) : value;
  if (result < 0n) throw new Error(`${label} must be unsigned`);
  return result;
}

function boundedUint(value: bigint | number, bits: number, label: string): bigint {
  const result = uint(value, label);
  const limit = 1n << BigInt(bits);
  if (result >= limit) throw new Error(`${label} exceeds uint${bits}`);
  return result;
}

function address(value: Hex, label: string): Hex {
  if (!isAddress(value)) throw new Error(`${label} must be an address`);
  return getAddress(value) as Hex;
}

function sortedAddresses(values: Hex[], label: string): Hex[] {
  const normalized = values.map((value) => address(value, label).toLowerCase() as Hex).sort();
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] === normalized[index - 1]) throw new Error(`${label} contains duplicates`);
  }
  return normalized;
}

function sortedBytes32(values: Hex[], label: string): Hex[] {
  const normalized = values.map((value) => bytes32(value, label)).sort();
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] === normalized[index - 1]) throw new Error(`${label} contains duplicates`);
  }
  return normalized;
}

export function normalizePolicy(policy: PolicyV1): PolicyV1 {
  if (policy.schemaVersion !== 1) throw new Error("unsupported policy schema");
  const chainId = uint(policy.chainId, "chainId");
  if (chainId === 0n) throw new Error("chainId must be non-zero");
  const registry = address(policy.registry, "registry");
  const vault = address(policy.vault, "vault");
  const router = address(policy.router, "router");
  const owner = address(policy.owner, "owner");
  const asset = address(policy.asset, "asset");
  if ([registry, vault, router, owner, asset].some((value) => value === "0x0000000000000000000000000000000000000000")) {
    throw new Error("policy addresses must be non-zero");
  }
  const policyId = bytes32(policy.policyId, "policyId");
  const referenceCurrency = bytes32(policy.referenceCurrency, "referenceCurrency");
  const privateSalt = bytes32(policy.privateSalt, "privateSalt");
  const submissionNonce = bytes32(policy.submissionNonce, "submissionNonce");
  if (policyId === ZERO_BYTES32 || referenceCurrency === ZERO_BYTES32 || privateSalt === ZERO_BYTES32 || submissionNonce === ZERO_BYTES32) {
    throw new Error("policy identifiers and nonces must be non-zero");
  }
  const endAt = boundedUint(policy.endAt, 64, "endAt");
  const startAt = boundedUint(policy.startAt, 64, "startAt");
  if (endAt !== 0n && endAt <= startAt) throw new Error("endAt must be after startAt");
  const rollingWindowSeconds = boundedUint(policy.rollingWindowSeconds, 64, "rollingWindowSeconds");
  if (policy.rollingCap !== 0n && rollingWindowSeconds === 0n) throw new Error("rolling window is required");
  const scheduleIntervalSeconds = boundedUint(policy.scheduleIntervalSeconds, 64, "scheduleIntervalSeconds");
  const scheduleGraceSeconds = boundedUint(policy.scheduleGraceSeconds, 64, "scheduleGraceSeconds");
  if ((scheduleIntervalSeconds === 0n) !== (scheduleGraceSeconds === 0n)) throw new Error("schedule interval and grace must both be zero or positive");
  if (scheduleIntervalSeconds !== 0n) {
    const firstWindow = scheduleWindowV1(startAt, scheduleIntervalSeconds, scheduleGraceSeconds, 1n);
    if (firstWindow === null || (endAt !== 0n && firstWindow.deadline > endAt)) throw new Error("invalid recurring schedule");
  }
  if (policy.requireFtso && policy.ftsoFeedId === ZERO_BYTES32) throw new Error("FTSO feed is required");
  if (!policy.requireFtso && policy.ftsoFeedId !== ZERO_BYTES32) throw new Error("unexpected FTSO feed");
  const maxPriceAgeSeconds = boundedUint(policy.maxPriceAgeSeconds, 64, "maxPriceAgeSeconds");
  const requireFdc = policy.requireFdc;
  if (typeof requireFdc !== "boolean" || typeof policy.fdcRequireDestinationTag !== "boolean") {
    throw new Error("FDC requirement flags must be boolean");
  }
  const fdcAttestationType = bytes32(policy.fdcAttestationType, "fdcAttestationType");
  const fdcSourceId = bytes32(policy.fdcSourceId, "fdcSourceId");
  const fdcSourceAddressHash = bytes32(policy.fdcSourceAddressHash, "fdcSourceAddressHash");
  const fdcReceivingAddressHash = bytes32(policy.fdcReceivingAddressHash, "fdcReceivingAddressHash");
  const fdcMemoMode = Number(boundedUint(policy.fdcMemoMode, 8, "fdcMemoMode"));
  const fdcDestinationTag = Number(boundedUint(policy.fdcDestinationTag, 32, "fdcDestinationTag"));
  const fdcMinReceivedAmount = uint(policy.fdcMinReceivedAmount, "fdcMinReceivedAmount");
  const fdcMaxReceivedAmount = uint(policy.fdcMaxReceivedAmount, "fdcMaxReceivedAmount");
  const maxFdcAgeSeconds = boundedUint(policy.maxFdcAgeSeconds, 64, "maxFdcAgeSeconds");
  const fdcConsumer = address(policy.fdcConsumer, "fdcConsumer");
  if (requireFdc) {
    if (fdcAttestationType.toLowerCase() !== FDC_XRP_PAYMENT_V1.toLowerCase()
      || fdcSourceId === ZERO_BYTES32 || fdcSourceAddressHash === ZERO_BYTES32
      || fdcReceivingAddressHash === ZERO_BYTES32 || fdcMemoMode !== 1
      || fdcMinReceivedAmount === 0n || fdcMaxReceivedAmount < fdcMinReceivedAmount
      || maxFdcAgeSeconds === 0n || fdcConsumer === "0x0000000000000000000000000000000000000000") {
      throw new Error("required FDC descriptor is incomplete");
    }
  } else if (fdcAttestationType !== ZERO_BYTES32 || fdcSourceId !== ZERO_BYTES32
    || fdcSourceAddressHash !== ZERO_BYTES32 || fdcReceivingAddressHash !== ZERO_BYTES32
    || fdcMemoMode !== 0 || policy.fdcRequireDestinationTag || fdcDestinationTag !== 0
    || fdcMinReceivedAmount !== 0n || fdcMaxReceivedAmount !== 0n || maxFdcAgeSeconds !== 0n
    || fdcConsumer !== "0x0000000000000000000000000000000000000000") {
    throw new Error("unexpected FDC descriptor");
  }
  return {
    ...policy,
    chainId,
    registry, vault, router, owner, policyId, asset,
    referenceCurrency, policyVersion: Number(boundedUint(policy.policyVersion, 32, "policyVersion")),
    maxPerAction: uint(policy.maxPerAction, "maxPerAction"), dailyCap: uint(policy.dailyCap, "dailyCap"), rollingCap: uint(policy.rollingCap, "rollingCap"),
    rollingWindowSeconds, startAt, endAt, scheduleIntervalSeconds, scheduleGraceSeconds,
    cooldownSeconds: boundedUint(policy.cooldownSeconds, 64, "cooldownSeconds"), maxOccurrences: Number(boundedUint(policy.maxOccurrences, 32, "maxOccurrences")),
    allowTargets: sortedAddresses(policy.allowTargets, "allowTargets"), denyTargets: sortedAddresses(policy.denyTargets, "denyTargets"),
    allowRequesters: sortedAddresses(policy.allowRequesters, "allowRequesters"), allowActionTypes: sortedBytes32(policy.allowActionTypes, "allowActionTypes"),
    ftsoFeedId: bytes32(policy.ftsoFeedId, "ftsoFeedId"), maxPriceAgeSeconds,
    requireFdc, fdcAttestationType, fdcSourceId, fdcSourceAddressHash, fdcReceivingAddressHash,
    fdcMemoMode, fdcRequireDestinationTag: policy.fdcRequireDestinationTag, fdcDestinationTag,
    fdcMinReceivedAmount, fdcMaxReceivedAmount, maxFdcAgeSeconds, fdcConsumer,
    privateSalt, submissionNonce,
  };
}

export function encodePolicyV1(policy: PolicyV1): Hex {
  const normalized = normalizePolicy(policy);
  return encodeAbiParameters(policyParameters, [
    normalized.schemaVersion, normalized.chainId, normalized.registry, normalized.vault, normalized.router, normalized.owner,
    normalized.policyId, normalized.policyVersion, normalized.asset, normalized.referenceCurrency, normalized.maxPerAction,
    normalized.dailyCap, normalized.rollingCap, normalized.rollingWindowSeconds, normalized.startAt, normalized.endAt,
    normalized.scheduleIntervalSeconds, normalized.scheduleGraceSeconds, normalized.cooldownSeconds, normalized.maxOccurrences,
    normalized.allowTargets, normalized.denyTargets,
    normalized.allowRequesters, normalized.allowActionTypes, normalized.requireFtso, normalized.ftsoFeedId,
    normalized.maxPriceAgeSeconds, normalized.requireFdc, normalized.fdcAttestationType, normalized.fdcSourceId,
    normalized.fdcSourceAddressHash, normalized.fdcReceivingAddressHash, normalized.fdcMemoMode,
    normalized.fdcRequireDestinationTag, normalized.fdcDestinationTag, normalized.fdcMinReceivedAmount,
    normalized.fdcMaxReceivedAmount, normalized.maxFdcAgeSeconds, normalized.fdcConsumer,
    normalized.privateSalt, normalized.submissionNonce,
  ]);
}

export function fdcTriggerSnapshotCommitmentV1(snapshot: FdcTriggerSnapshotV1): Hex {
  if (typeof snapshot.hasMemoData !== "boolean" || typeof snapshot.hasDestinationTag !== "boolean"
    || typeof snapshot.transactionConsumed !== "boolean" || typeof snapshot.proofConsumed !== "boolean") {
    throw new Error("FDC snapshot flags must be boolean");
  }
  return keccak256(encodeAbiParameters(fdcSnapshotParameters, [
    FDC_TRIGGER_SNAPSHOT_V1, bytes32(snapshot.attestationType, "attestationType"), bytes32(snapshot.sourceId, "sourceId"),
    bytes32(snapshot.transactionId, "transactionId"), address(snapshot.proofOwner, "proofOwner"),
    address(snapshot.consumer, "consumer"), bytes32(snapshot.inputCommitment, "inputCommitment"),
    bytes32(snapshot.proofCommitment, "proofCommitment"), bytes32(snapshot.sourceAddressHash, "sourceAddressHash"),
    bytes32(snapshot.receivingAddressHash, "receivingAddressHash"), uint(snapshot.receivedAmount, "receivedAmount"),
    snapshot.hasMemoData, bytes32(snapshot.memoDataHash, "memoDataHash"), snapshot.hasDestinationTag,
    Number(boundedUint(snapshot.destinationTag, 32, "destinationTag")), boundedUint(snapshot.blockNumber, 64, "blockNumber"),
    boundedUint(snapshot.blockTimestamp, 64, "blockTimestamp"), snapshot.transactionConsumed, snapshot.proofConsumed,
    bytes32(snapshot.requestId, "requestId"), bytes32(snapshot.routerRequestHash, "routerRequestHash"),
    Number(boundedUint(snapshot.routerRequestStatus, 8, "routerRequestStatus")),
  ]));
}

export function policyInputCommitmentV1(ftsoCheckpoint: Hex | undefined, fdcInputCommitment: Hex | undefined): Hex {
  const ftso = ftsoCheckpoint === undefined ? ZERO_BYTES32 : bytes32(ftsoCheckpoint, "FTSO checkpoint");
  const fdc = fdcInputCommitment === undefined ? ZERO_BYTES32 : bytes32(fdcInputCommitment, "FDC input commitment");
  if (ftso === ZERO_BYTES32) return fdc;
  if (fdc === ZERO_BYTES32) return ftso;
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }],
    [POLICY_INPUT_V1, ftso, fdc],
  ));
}

export function policyCommitment(policy: PolicyV1): Hex {
  return keccak256(encodePolicyV1(policy));
}

export function genesisSpendCheckpoint(policyCommitmentValue: Hex): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint32" }],
    [SPEND_CHECKPOINT_V1, bytes32(policyCommitmentValue, "policyCommitment"), 0],
  ));
}

function bindingValues(binding: PolicyBindingV1): readonly unknown[] {
  return [POLICY_SCHEMA_V1, uint(binding.chainId, "chainId"), address(binding.registry, "registry"), address(binding.vault, "vault"),
    address(binding.router, "router"), address(binding.owner, "owner"), bytes32(binding.policyId, "policyId"), binding.policyVersion,
    bytes32(binding.policyCommitment, "policyCommitment"), bytes32(binding.schema, "schema"), bytes32(binding.extensionId, "extensionId"),
    bytes32(binding.codeVersion, "codeVersion"), binding.machineIds.map((value) => bytes32(value, "machineId")),
    binding.keyFingerprints.map((value) => bytes32(value, "keyFingerprint")), binding.custodyThreshold, binding.resultThreshold,
    uint(binding.policyNonce, "policyNonce")];
}

export function encodePolicyBinding(binding: PolicyBindingV1): Hex {
  return encodeAbiParameters(policyBindingParameters, bindingValues(binding));
}

export function policyBindingDigest(binding: PolicyBindingV1): Hex {
  return keccak256(encodePolicyBinding(binding));
}

export function policyReceiptDigest(receipt: PolicyReceiptV1): Hex {
  const binding = bindingValues(receipt.binding);
  return keccak256(encodeAbiParameters(receiptParameters, [...binding, bytes32(receipt.machineId, "machineId"), bytes32(receipt.keyFingerprint, "keyFingerprint"),
    bytes32(receipt.submissionNonce, "submissionNonce"), uint(receipt.receiptNonce, "receiptNonce"), uint(receipt.issuedAt, "issuedAt"), uint(receipt.expiry, "expiry")]));
}

/** Exact message passed to tee-node v0.0.24 POST /sign. The node computes
 * keccak256(message), then applies the Ethereum signed-message wrapper. */
export function encodeFccAttestation(prefix: Hex, chainId: bigint, dataHash: Hex): Hex {
  return encodeAbiParameters(fccAttestationParameters, [
    bytes32(prefix, "attestation prefix"),
    uint(chainId, "attestation chainId"),
    bytes32(dataHash, "attestation dataHash"),
  ]);
}

export function fccAttestationDigest(prefix: Hex, chainId: bigint, dataHash: Hex): Hex {
  return keccak256(encodeFccAttestation(prefix, chainId, dataHash));
}

export function policyReceiptAttestationDigest(receipt: PolicyReceiptV1): Hex {
  return fccAttestationDigest(FCC_POLICY_RECEIPT_PREFIX, receipt.binding.chainId, policyReceiptDigest(receipt));
}

export interface PolicyIngressAuthorizationV1 {
  binding: PolicyBindingV1;
  submissionNonce: Hex;
  issuedAt: bigint;
  expiry: bigint;
  ciphertextHash: Hex;
  machineId: Hex;
  keyFingerprint: Hex;
}

export function policyIngressAuthorizationDigest(input: PolicyIngressAuthorizationV1): Hex {
  const binding = input.binding;
  return keccak256(encodeAbiParameters(ingressAuthorizationParameters, [
    FCC_POLICY_INGRESS_PREFIX, policyBindingDigest(binding), bytes32(input.submissionNonce, "submissionNonce"),
    boundedUint(input.issuedAt, 64, "issuedAt"), boundedUint(input.expiry, 64, "expiry"),
    bytes32(input.ciphertextHash, "ciphertextHash"), bytes32(input.machineId, "machineId"),
    bytes32(input.keyFingerprint, "keyFingerprint"),
  ]));
}

function requestValues(request: ActionRequestV1): readonly unknown[] {
  return [ACTION_REQUEST_V1, uint(request.chainId, "chainId"), address(request.registry, "registry"), address(request.vault, "vault"), address(request.router, "router"),
    bytes32(request.policyId, "policyId"), request.policyVersion, bytes32(request.policyCommitment, "policyCommitment"), bytes32(request.requestId, "requestId"),
    uint(request.requestNonce, "requestNonce"), request.attempt, address(request.requester, "requester"), address(request.target, "target"),
    address(request.asset, "asset"), bytes32(request.actionType, "actionType"), uint(request.amount, "amount"), uint(request.scheduleSlot, "scheduleSlot"),
    request.occurrence, bytes32(request.spendCheckpoint, "spendCheckpoint"), bytes32(request.balanceCheckpoint, "balanceCheckpoint"),
    bytes32(request.inputCommitment, "inputCommitment"), uint(request.createdAt, "createdAt"), uint(request.graceDeadline, "graceDeadline"), uint(request.expiry, "expiry")];
}

export function encodeActionRequest(request: ActionRequestV1): Hex {
  return encodeAbiParameters(requestParameters, requestValues(request));
}

export function actionRequestHash(request: ActionRequestV1): Hex {
  return keccak256(encodeActionRequest(request));
}

export function evaluationDigest(result: Omit<import("./types.js").EvaluationResultV1, "request"> & { request: ActionRequestV1 }): Hex {
  const request = requestValues(result.request);
  const decision = result.decision === "ALLOW" ? 1 : 0;
  return keccak256(encodeAbiParameters(resultParameters, [EVALUATION_RESULT_V1, ...request, bytes32(actionRequestHash(result.request), "requestHash"), decision,
    REASON_CODE[result.publicReasonClass], uint(result.reservedAmount, "reservedAmount"), bytes32(result.resultingCheckpoint, "resultingCheckpoint"),
    bytes32(result.resultNonce, "resultNonce"), result.attempt, uint(result.issuedAt, "issuedAt"), uint(result.expiry, "expiry")]));
}

export function evaluationAttestationDigest(result: Omit<import("./types.js").EvaluationResultV1, "request"> & { request: ActionRequestV1 }): Hex {
  return fccAttestationDigest(FCC_EVALUATION_PREFIX, result.request.chainId, evaluationDigest(result));
}

export function publicReasonCode(reason: import("./types.js").PublicReasonClass): number {
  return REASON_CODE[reason];
}
