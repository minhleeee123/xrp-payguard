import type { Hex } from "@xrp-payguard/protocol";
import { encodeAbiParameters, getAddress, isAddress, keccak256, stringToHex, zeroAddress, zeroHash } from "viem";

const MAX_UINT32 = (1n << 32n) - 1n;
const MAX_UINT64 = (1n << 64n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;
const MIN_INT256 = -(1n << 255n);
const MAX_INT256 = (1n << 255n) - 1n;
const MAX_REDEMPTION_LEGS = 256;
const MAX_PAYMENT_ADDRESS_BYTES = 256;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;

export type RedemptionMethod = "AMOUNT" | "WITH_TAG";
export type RedemptionJobState = "CREATED" | "REQUESTED" | "SETTLED";
export type RedemptionLegState = "REQUESTED" | "UNDERLYING_PAID" | "COLLATERAL_DEFAULT";
export type RedemptionOutcome = "NOT_REQUESTED" | "PENDING" | "UNDERLYING_PAID" | "COLLATERAL_DEFAULT" | "MIXED";

export interface RedemptionIntentV1 {
  jobId: Hex;
  method: RedemptionMethod;
  assetManager: string;
  fAsset: string;
  redeemer: string;
  paymentAddress: string;
  executor: string;
  requestedAmountUBA: bigint;
  destinationTag?: bigint;
}

export interface RedemptionRequestedEventV1 {
  agentVault: string;
  redeemer: string;
  requestId: bigint;
  paymentAddress: string;
  valueUBA: bigint;
  feeUBA: bigint;
  firstUnderlyingBlock: bigint;
  lastUnderlyingBlock: bigint;
  lastUnderlyingTimestamp: bigint;
  paymentReference: Hex;
  executor: string;
  executorFeeNatWei: bigint;
  destinationTag?: bigint;
}

export interface RedemptionRequestReceiptV1 {
  status: "REQUESTED";
  transactionHash: Hex;
  assetManager: string;
  fAsset: string;
  redeemer: string;
  requestedAmountUBA: bigint;
  redeemedAmountUBA: bigint;
  remainingAmountUBA: bigint;
  requests: RedemptionRequestedEventV1[];
}

export interface RedemptionPerformedEventV1 {
  status: "UNDERLYING_PAID";
  flareTransactionHash: Hex;
  agentVault: string;
  redeemer: string;
  requestId: bigint;
  transactionHash: Hex;
  redemptionAmountUBA: bigint;
  spentUnderlyingUBA: bigint;
}

export interface RedemptionDefaultEventV1 {
  status: "COLLATERAL_DEFAULT";
  flareTransactionHash: Hex;
  agentVault: string;
  redeemer: string;
  requestId: bigint;
  redemptionAmountUBA: bigint;
  redeemedVaultCollateralWei: bigint;
  redeemedPoolCollateralWei: bigint;
}

export interface RedemptionLegV1 extends RedemptionRequestedEventV1 {
  state: RedemptionLegState;
  flareTransactionHash?: Hex;
  underlyingTransactionHash?: Hex;
  spentUnderlyingUBA?: bigint;
  redeemedVaultCollateralWei?: bigint;
  redeemedPoolCollateralWei?: bigint;
  settlementProofCommitment?: Hex;
}

export interface RedemptionJobV1 extends RedemptionIntentV1 {
  intentHash: Hex;
  checkpointHash: Hex;
  state: RedemptionJobState;
  requestTransactionHash?: Hex;
  redeemedAmountUBA?: bigint;
  remainingAmountUBA?: bigint;
  requests: RedemptionLegV1[];
}

export interface FAssetsRedemptionClient {
  requestRedemption(job: RedemptionJobV1): Promise<RedemptionRequestReceiptV1>;
}

export interface FAssetsRedemptionEventVerifier<TEvent> {
  verify(event: TEvent): Promise<Hex | false>;
}

const JOB_STATE_CODE: Record<RedemptionJobState, number> = { CREATED: 0, REQUESTED: 1, SETTLED: 2 };
const LEG_STATE_CODE: Record<RedemptionLegState, number> = { REQUESTED: 0, UNDERLYING_PAID: 1, COLLATERAL_DEFAULT: 2 };

function isNonZeroHex32(value: unknown): value is Hex {
  return typeof value === "string" && HEX32.test(value) && value.toLowerCase() !== zeroHash;
}

function isUint(value: unknown, max: bigint = MAX_UINT256): value is bigint {
  return typeof value === "bigint" && value >= 0n && value <= max;
}

function checkedAdd(left: bigint, right: bigint): bigint {
  const result = left + right;
  if (!isUint(result)) throw new Error("redemption uint256 overflow");
  return result;
}

function isPublicPaymentAddress(value: string): boolean {
  return typeof value === "string" && value.length > 0 && new TextEncoder().encode(value).length <= MAX_PAYMENT_ADDRESS_BYTES;
}

function validateIntent(intent: RedemptionIntentV1): void {
  const addresses = [intent.assetManager, intent.fAsset, intent.redeemer, intent.executor];
  const destinationTagValid = intent.method === "WITH_TAG"
    ? intent.destinationTag !== undefined && isUint(intent.destinationTag, MAX_UINT32)
    : intent.destinationTag === undefined;
  if (!isNonZeroHex32(intent.jobId) || !["AMOUNT", "WITH_TAG"].includes(intent.method)
    || addresses.some((address) => !isAddress(address))
    || getAddress(intent.assetManager) === zeroAddress || getAddress(intent.fAsset) === zeroAddress
    || getAddress(intent.redeemer) === zeroAddress || !isPublicPaymentAddress(intent.paymentAddress)
    || !isUint(intent.requestedAmountUBA) || intent.requestedAmountUBA === 0n
    || !destinationTagValid) {
    throw new Error("redemption intent invalid");
  }
}

export function buildRedemptionIntentHash(intent: RedemptionIntentV1): Hex {
  validateIntent(intent);
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint8" }, { type: "address" }, { type: "address" },
      { type: "address" }, { type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "bool" }, { type: "uint32" }],
    [keccak256(stringToHex("PAYGUARD_FASSETS_REDEMPTION_INTENT_V1")), intent.jobId,
      intent.method === "AMOUNT" ? 0 : 1, getAddress(intent.assetManager), getAddress(intent.fAsset),
      getAddress(intent.redeemer), keccak256(stringToHex(intent.paymentAddress)), getAddress(intent.executor),
      intent.requestedAmountUBA, intent.destinationTag !== undefined, Number(intent.destinationTag ?? 0n)],
  ));
}

function redemptionLegHash(leg: RedemptionLegV1): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint64" }, { type: "bytes32" },
      { type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" },
      { type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "bool" }, { type: "uint32" },
      { type: "uint8" }, { type: "bytes32" }, { type: "bytes32" }, { type: "int256" }, { type: "uint256" },
      { type: "uint256" }, { type: "bytes32" }],
    [keccak256(stringToHex("PAYGUARD_FASSETS_REDEMPTION_LEG_V1")), getAddress(leg.agentVault),
      getAddress(leg.redeemer), leg.requestId, keccak256(stringToHex(leg.paymentAddress)), leg.valueUBA, leg.feeUBA,
      leg.firstUnderlyingBlock, leg.lastUnderlyingBlock, leg.lastUnderlyingTimestamp, leg.paymentReference,
      getAddress(leg.executor), leg.executorFeeNatWei, leg.destinationTag !== undefined, Number(leg.destinationTag ?? 0n),
      LEG_STATE_CODE[leg.state], leg.flareTransactionHash ?? zeroHash, leg.underlyingTransactionHash ?? zeroHash,
      leg.spentUnderlyingUBA ?? 0n, leg.redeemedVaultCollateralWei ?? 0n, leg.redeemedPoolCollateralWei ?? 0n,
      leg.settlementProofCommitment ?? zeroHash],
  ));
}

function buildRedemptionCheckpointHash(job: Omit<RedemptionJobV1, "checkpointHash"> | RedemptionJobV1): Hex {
  const requestsRoot = keccak256(encodeAbiParameters([{ type: "bytes32[]" }], [job.requests.map(redemptionLegHash)]));
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint8" }, { type: "bytes32" }, { type: "uint256" },
      { type: "uint256" }, { type: "bytes32" }],
    [keccak256(stringToHex("PAYGUARD_FASSETS_REDEMPTION_CHECKPOINT_V1")), job.intentHash,
      JOB_STATE_CODE[job.state], job.requestTransactionHash ?? zeroHash, job.redeemedAmountUBA ?? 0n,
      job.remainingAmountUBA ?? 0n, requestsRoot],
  ));
}

function checkpointRedemptionJob(job: Omit<RedemptionJobV1, "checkpointHash"> | RedemptionJobV1): RedemptionJobV1 {
  return { ...job, checkpointHash: buildRedemptionCheckpointHash(job) };
}

function validateRequestedLeg(job: RedemptionIntentV1, leg: RedemptionRequestedEventV1): void {
  if (!isAddress(leg.agentVault) || getAddress(leg.agentVault) === zeroAddress
    || !isAddress(leg.redeemer) || getAddress(leg.redeemer) !== getAddress(job.redeemer)
    || !isUint(leg.requestId, MAX_UINT64) || leg.requestId === 0n || leg.paymentAddress !== job.paymentAddress
    || leg.valueUBA <= 0n || leg.valueUBA > MAX_UINT256 || !isUint(leg.feeUBA) || leg.feeUBA >= leg.valueUBA
    || !isUint(leg.firstUnderlyingBlock, MAX_UINT64) || !isUint(leg.lastUnderlyingBlock, MAX_UINT64)
    || leg.firstUnderlyingBlock > leg.lastUnderlyingBlock || !isUint(leg.lastUnderlyingTimestamp, MAX_UINT64)
    || leg.lastUnderlyingTimestamp === 0n || !isNonZeroHex32(leg.paymentReference)
    || !isAddress(leg.executor) || getAddress(leg.executor) !== getAddress(job.executor)
    || !isUint(leg.executorFeeNatWei) || (getAddress(job.executor) === zeroAddress && leg.executorFeeNatWei !== 0n)
    || (job.method === "WITH_TAG" ? leg.destinationTag !== job.destinationTag : leg.destinationTag !== undefined)) {
    throw new Error("redemption request event invalid");
  }
}

export function createRedemptionJob(intent: RedemptionIntentV1): RedemptionJobV1 {
  const intentHash = buildRedemptionIntentHash(intent);
  return checkpointRedemptionJob({ ...intent, intentHash, state: "CREATED", requests: [] });
}

export function assertRedemptionJobIntegrity(job: RedemptionJobV1): void {
  validateIntent(job);
  const terminalLegs = job.requests.filter((leg) => leg.state !== "REQUESTED").length;
  const expectedState = job.requests.length === 0 ? "CREATED" : terminalLegs === job.requests.length ? "SETTLED" : "REQUESTED";
  let total = 0n;
  const requestIds = new Set<string>();
  const paymentReferences = new Set<string>();
  const agentVaults = new Set<string>();
  for (const leg of job.requests) {
    validateRequestedLeg(job, leg);
    const requestId = leg.requestId.toString();
    const paymentReference = leg.paymentReference.toLowerCase();
    const agentVault = getAddress(leg.agentVault);
    if (requestIds.has(requestId) || paymentReferences.has(paymentReference) || agentVaults.has(agentVault)) throw new Error("redemption job drift");
    requestIds.add(requestId);
    paymentReferences.add(paymentReference);
    agentVaults.add(agentVault);
    total = checkedAdd(total, leg.valueUBA);
    if (leg.state === "UNDERLYING_PAID") {
      if (!isNonZeroHex32(leg.flareTransactionHash) || !isNonZeroHex32(leg.underlyingTransactionHash)
        || !isNonZeroHex32(leg.settlementProofCommitment)
        || leg.spentUnderlyingUBA === undefined || leg.spentUnderlyingUBA < MIN_INT256
        || leg.spentUnderlyingUBA > MAX_INT256 || leg.spentUnderlyingUBA <= 0n
        || leg.redeemedVaultCollateralWei !== undefined || leg.redeemedPoolCollateralWei !== undefined) throw new Error("redemption job drift");
    } else if (leg.state === "COLLATERAL_DEFAULT") {
      if (!isNonZeroHex32(leg.flareTransactionHash) || leg.underlyingTransactionHash !== undefined
        || !isNonZeroHex32(leg.settlementProofCommitment)
        || leg.spentUnderlyingUBA !== undefined || !isUint(leg.redeemedVaultCollateralWei!)
        || !isUint(leg.redeemedPoolCollateralWei!)
        || checkedAdd(leg.redeemedVaultCollateralWei!, leg.redeemedPoolCollateralWei!) === 0n) throw new Error("redemption job drift");
    } else if (leg.flareTransactionHash !== undefined || leg.underlyingTransactionHash !== undefined
      || leg.spentUnderlyingUBA !== undefined || leg.redeemedVaultCollateralWei !== undefined
      || leg.redeemedPoolCollateralWei !== undefined || leg.settlementProofCommitment !== undefined) throw new Error("redemption job drift");
  }
  if (buildRedemptionIntentHash(job).toLowerCase() !== job.intentHash.toLowerCase()
    || buildRedemptionCheckpointHash(job).toLowerCase() !== job.checkpointHash.toLowerCase()
    || job.state !== expectedState
    || (job.state === "CREATED") !== (job.requestTransactionHash === undefined)
    || (job.state === "CREATED") !== (job.redeemedAmountUBA === undefined)
    || (job.state === "CREATED") !== (job.remainingAmountUBA === undefined)
    || (job.state !== "CREATED" && (!isNonZeroHex32(job.requestTransactionHash)
      || job.redeemedAmountUBA !== total || job.remainingAmountUBA === undefined
      || checkedAdd(job.redeemedAmountUBA, job.remainingAmountUBA) !== job.requestedAmountUBA))) throw new Error("redemption job drift");
}

export async function requestRedemption(job: RedemptionJobV1, client: FAssetsRedemptionClient | undefined): Promise<RedemptionJobV1> {
  assertRedemptionJobIntegrity(job);
  if (job.state !== "CREATED" || !client) throw new Error("redemption client unavailable");
  const receipt = await client.requestRedemption(job);
  assertRedemptionJobIntegrity(job);
  if (receipt.status !== "REQUESTED" || !isNonZeroHex32(receipt.transactionHash)
    || !isAddress(receipt.assetManager) || getAddress(receipt.assetManager) !== getAddress(job.assetManager)
    || !isAddress(receipt.fAsset) || getAddress(receipt.fAsset) !== getAddress(job.fAsset)
    || !isAddress(receipt.redeemer) || getAddress(receipt.redeemer) !== getAddress(job.redeemer)
    || receipt.requestedAmountUBA !== job.requestedAmountUBA || receipt.redeemedAmountUBA <= 0n
    || !isUint(receipt.redeemedAmountUBA) || !isUint(receipt.remainingAmountUBA)
    || checkedAdd(receipt.redeemedAmountUBA, receipt.remainingAmountUBA) !== job.requestedAmountUBA
    || receipt.requests.length === 0 || receipt.requests.length > MAX_REDEMPTION_LEGS) throw new Error("redemption receipt drift");
  let total = 0n;
  const requestIds = new Set<string>();
  const paymentReferences = new Set<string>();
  const agentVaults = new Set<string>();
  const requests = receipt.requests.map((request) => {
    validateRequestedLeg(job, request);
    const requestId = request.requestId.toString();
    const paymentReference = request.paymentReference.toLowerCase();
    const agentVault = getAddress(request.agentVault);
    if (requestIds.has(requestId) || paymentReferences.has(paymentReference) || agentVaults.has(agentVault)) throw new Error("redemption receipt drift");
    requestIds.add(requestId);
    paymentReferences.add(paymentReference);
    agentVaults.add(agentVault);
    total = checkedAdd(total, request.valueUBA);
    return { ...request, state: "REQUESTED" as const };
  });
  if (total !== receipt.redeemedAmountUBA) throw new Error("redemption receipt drift");
  return checkpointRedemptionJob({ ...job, state: "REQUESTED", requestTransactionHash: receipt.transactionHash,
    redeemedAmountUBA: receipt.redeemedAmountUBA, remainingAmountUBA: receipt.remainingAmountUBA, requests });
}

function performedEventHash(event: RedemptionPerformedEventV1): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint64" },
      { type: "bytes32" }, { type: "uint256" }, { type: "int256" }],
    [keccak256(stringToHex("PAYGUARD_REDEMPTION_PERFORMED_EVENT_V1")), event.flareTransactionHash,
      getAddress(event.agentVault), getAddress(event.redeemer), event.requestId, event.transactionHash,
      event.redemptionAmountUBA, event.spentUnderlyingUBA],
  ));
}

function defaultEventHash(event: RedemptionDefaultEventV1): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint64" },
      { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
    [keccak256(stringToHex("PAYGUARD_REDEMPTION_DEFAULT_EVENT_V1")), event.flareTransactionHash,
      getAddress(event.agentVault), getAddress(event.redeemer), event.requestId, event.redemptionAmountUBA,
      event.redeemedVaultCollateralWei, event.redeemedPoolCollateralWei],
  ));
}

async function verifySettlementEvent<TEvent>(
  event: TEvent,
  verifier: FAssetsRedemptionEventVerifier<TEvent> | undefined,
  usedProofCommitments: ReadonlySet<string>,
): Promise<Hex> {
  if (!verifier) throw new Error("redemption event verifier unavailable");
  let commitment: Hex | false;
  try {
    commitment = await verifier.verify(event);
  } catch {
    throw new Error("redemption event verifier unavailable");
  }
  if (!isNonZeroHex32(commitment)) throw new Error("redemption event proof invalid");
  if (usedProofCommitments.has(commitment.toLowerCase())) throw new Error("redemption event replay");
  return commitment;
}

export async function acceptRedemptionPerformed(
  job: RedemptionJobV1,
  event: RedemptionPerformedEventV1,
  verifier: FAssetsRedemptionEventVerifier<RedemptionPerformedEventV1> | undefined,
  usedProofCommitments: ReadonlySet<string> = new Set(),
): Promise<RedemptionJobV1> {
  assertRedemptionJobIntegrity(job);
  if (job.state !== "REQUESTED" || event.status !== "UNDERLYING_PAID" || !isNonZeroHex32(event.flareTransactionHash)
    || !isNonZeroHex32(event.transactionHash) || !isAddress(event.agentVault) || !isAddress(event.redeemer)
    || getAddress(event.redeemer) !== getAddress(job.redeemer) || !isUint(event.requestId, MAX_UINT64)
    || !isUint(event.redemptionAmountUBA) || event.spentUnderlyingUBA < MIN_INT256
    || event.spentUnderlyingUBA > MAX_INT256 || event.spentUnderlyingUBA <= 0n) throw new Error("redemption performed event invalid");
  const index = job.requests.findIndex((request) => request.requestId === event.requestId);
  const request = job.requests[index];
  if (!request || request.state !== "REQUESTED" || getAddress(request.agentVault) !== getAddress(event.agentVault)
    || request.valueUBA !== event.redemptionAmountUBA) throw new Error("redemption performed event drift");
  const eventHash = performedEventHash(event);
  const settlementProofCommitment = await verifySettlementEvent(event, verifier, usedProofCommitments);
  assertRedemptionJobIntegrity(job);
  if (usedProofCommitments.has(settlementProofCommitment.toLowerCase())
    || job.requests.some((leg) => leg.settlementProofCommitment?.toLowerCase() === settlementProofCommitment.toLowerCase())) throw new Error("redemption event replay");
  if (performedEventHash(event).toLowerCase() !== eventHash.toLowerCase()) throw new Error("redemption performed event drift");
  const requests = job.requests.map((leg, legIndex) => legIndex === index ? { ...leg, state: "UNDERLYING_PAID" as const,
    flareTransactionHash: event.flareTransactionHash, underlyingTransactionHash: event.transactionHash,
    spentUnderlyingUBA: event.spentUnderlyingUBA, settlementProofCommitment } : leg);
  const state = requests.every((leg) => leg.state !== "REQUESTED") ? "SETTLED" : "REQUESTED";
  return checkpointRedemptionJob({ ...job, state, requests });
}

export async function acceptRedemptionDefault(
  job: RedemptionJobV1,
  event: RedemptionDefaultEventV1,
  verifier: FAssetsRedemptionEventVerifier<RedemptionDefaultEventV1> | undefined,
  usedProofCommitments: ReadonlySet<string> = new Set(),
): Promise<RedemptionJobV1> {
  assertRedemptionJobIntegrity(job);
  if (job.state !== "REQUESTED" || event.status !== "COLLATERAL_DEFAULT" || !isNonZeroHex32(event.flareTransactionHash)
    || !isAddress(event.agentVault) || !isAddress(event.redeemer) || getAddress(event.redeemer) !== getAddress(job.redeemer)
    || !isUint(event.requestId, MAX_UINT64) || !isUint(event.redemptionAmountUBA)
    || !isUint(event.redeemedVaultCollateralWei) || !isUint(event.redeemedPoolCollateralWei)
    || checkedAdd(event.redeemedVaultCollateralWei, event.redeemedPoolCollateralWei) === 0n) throw new Error("redemption default event invalid");
  const index = job.requests.findIndex((request) => request.requestId === event.requestId);
  const request = job.requests[index];
  if (!request || request.state !== "REQUESTED" || getAddress(request.agentVault) !== getAddress(event.agentVault)
    || request.valueUBA !== event.redemptionAmountUBA) throw new Error("redemption default event drift");
  const eventHash = defaultEventHash(event);
  const settlementProofCommitment = await verifySettlementEvent(event, verifier, usedProofCommitments);
  assertRedemptionJobIntegrity(job);
  if (usedProofCommitments.has(settlementProofCommitment.toLowerCase())
    || job.requests.some((leg) => leg.settlementProofCommitment?.toLowerCase() === settlementProofCommitment.toLowerCase())) throw new Error("redemption event replay");
  if (defaultEventHash(event).toLowerCase() !== eventHash.toLowerCase()) throw new Error("redemption default event drift");
  const requests = job.requests.map((leg, legIndex) => legIndex === index ? { ...leg, state: "COLLATERAL_DEFAULT" as const,
    flareTransactionHash: event.flareTransactionHash, redeemedVaultCollateralWei: event.redeemedVaultCollateralWei,
    redeemedPoolCollateralWei: event.redeemedPoolCollateralWei, settlementProofCommitment } : leg);
  const state = requests.every((leg) => leg.state !== "REQUESTED") ? "SETTLED" : "REQUESTED";
  return checkpointRedemptionJob({ ...job, state, requests });
}

export function redemptionOutcome(job: RedemptionJobV1): RedemptionOutcome {
  assertRedemptionJobIntegrity(job);
  if (job.state === "CREATED") return "NOT_REQUESTED";
  if (job.state === "REQUESTED") return "PENDING";
  const paid = job.requests.filter((request) => request.state === "UNDERLYING_PAID").length;
  if (paid === job.requests.length) return "UNDERLYING_PAID";
  if (paid === 0) return "COLLATERAL_DEFAULT";
  return "MIXED";
}
