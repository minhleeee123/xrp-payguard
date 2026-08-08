import { encodeAbiParameters, getAddress, isAddress, keccak256, zeroAddress, type Hex } from "viem";
import type { FdcProofVerifier, ExpectedXrplPayment, XrplPaymentProofV1 } from "./fdc.js";
import { matchesExpectedXrplPayment, verifyXrplPaymentProof } from "./fdc.js";

const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_UINT64 = (1n << 64n) - 1n;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const ZERO_BYTES32 = `0x${"00".repeat(32)}` as Hex;

const FUNDING_STATE_CODE: Record<FundingState, number> = {
  CREATED: 0,
  PAYMENT_OBSERVED: 1,
  FDC_REQUESTED: 2,
  PROOF_READY: 3,
  DIRECT_MINTED: 4,
  DELAYED: 5,
  FAILED: 6,
};

export type FundingState = "CREATED" | "PAYMENT_OBSERVED" | "FDC_REQUESTED" | "PROOF_READY" | "DIRECT_MINTED" | "DELAYED" | "FAILED";

export interface SmartAccountFundingJob {
  jobId: Hex;
  owner: string;
  personalAccount: string;
  destination: string;
  asset: string;
  amount: bigint;
  executorFee: bigint;
  nonce: bigint;
  memoHash: Hex;
  operationHash: Hex;
  expectedPaymentHash: Hex;
  checkpointHash: Hex;
  expectedPayment: ExpectedXrplPayment;
  state: FundingState;
  fdcRequestId?: Hex;
  proofCommitment?: Hex;
  executionAllowedAt?: bigint;
  mintTransactionHash?: Hex;
}

export interface DirectMintReceiptV1 {
  status: "DIRECT_MINTED";
  transactionHash: Hex;
  operationHash: Hex;
  owner: string;
  personalAccount: string;
  destination: string;
  asset: string;
  amount: bigint;
  executorFee: bigint;
  nonce: bigint;
}

export interface DirectMintClient {
  executeDirectMint(job: SmartAccountFundingJob, proof: XrplPaymentProofV1): Promise<DirectMintReceiptV1 | { status: "DELAYED"; operationHash: Hex; executionAllowedAt: bigint }>;
}

export type FundingJobInput = Pick<SmartAccountFundingJob,
  "jobId" | "owner" | "personalAccount" | "destination" | "asset" | "amount" | "executorFee" | "nonce" | "memoHash" | "expectedPayment">;

function isNonZeroHex32(value: unknown): value is Hex {
  return typeof value === "string" && HEX32.test(value) && value.toLowerCase() !== ZERO_BYTES32;
}

export function buildPaymentExpectationHash(expected: ExpectedXrplPayment): Hex {
  if (!HEX32.test(expected.sourceId) || !HEX32.test(expected.txHash) || !HEX32.test(expected.memoHash)
    || (expected.network !== "testnet" && expected.network !== "mainnet") || expected.source.length === 0
    || !isAddress(expected.proofOwner) || getAddress(expected.proofOwner) === zeroAddress || !isAddress(expected.destination)
    || expected.amountDrops <= 0n || expected.amountDrops > MAX_UINT256
    || expected.minLedgerIndex < 0n || expected.minLedgerIndex > MAX_UINT256) throw new Error("payment expectation invalid");
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint8" }, { type: "address" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }, { type: "uint256" }],
    [keccak256(new TextEncoder().encode("PAYGUARD_XRPL_PAYMENT_EXPECTATION_V1")), expected.network === "testnet" ? 0 : 1,
      expected.proofOwner as Hex, expected.sourceId, expected.txHash, keccak256(new TextEncoder().encode(expected.source)), expected.destination as Hex,
      expected.amountDrops, expected.memoHash, expected.minLedgerIndex],
  ));
}

function buildFundingCheckpointHash(job: Omit<SmartAccountFundingJob, "checkpointHash"> | SmartAccountFundingJob): Hex {
  const fdcRequestId = job.fdcRequestId ?? ZERO_BYTES32;
  const proofCommitment = job.proofCommitment ?? ZERO_BYTES32;
  const executionAllowedAt = job.executionAllowedAt ?? 0n;
  const mintTransactionHash = job.mintTransactionHash ?? ZERO_BYTES32;
  if (!HEX32.test(job.jobId) || !HEX32.test(job.operationHash) || !HEX32.test(job.expectedPaymentHash)
    || !HEX32.test(fdcRequestId) || !HEX32.test(proofCommitment) || !HEX32.test(mintTransactionHash)
    || executionAllowedAt < 0n || executionAllowedAt > MAX_UINT64) throw new Error("funding checkpoint invalid");
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint8" },
      { type: "bytes32" }, { type: "bytes32" }, { type: "uint64" }, { type: "bytes32" }],
    [keccak256(new TextEncoder().encode("PAYGUARD_FUNDING_CHECKPOINT_V1")), job.jobId, job.operationHash,
      job.expectedPaymentHash, FUNDING_STATE_CODE[job.state], fdcRequestId, proofCommitment,
      executionAllowedAt, mintTransactionHash],
  ));
}

function checkpointFundingJob(job: Omit<SmartAccountFundingJob, "checkpointHash"> | SmartAccountFundingJob): SmartAccountFundingJob {
  return { ...job, checkpointHash: buildFundingCheckpointHash(job) };
}

export function buildOperationHash(input: Pick<SmartAccountFundingJob, "owner" | "personalAccount" | "destination" | "asset" | "amount" | "executorFee" | "nonce" | "memoHash">): Hex {
  const addresses = [input.owner, input.personalAccount, input.destination, input.asset];
  if (addresses.some((address) => !isAddress(address) || getAddress(address) === zeroAddress)
    || input.amount <= 0n || input.amount > MAX_UINT256 || input.executorFee < 0n || input.executorFee > MAX_UINT256
    || input.nonce < 0n || input.nonce > MAX_UINT256 || !HEX32.test(input.memoHash)) throw new Error("funding operation invalid");
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }],
    [keccak256(new TextEncoder().encode("PAYGUARD_SMART_ACCOUNT_OPERATION_V1")), input.owner as Hex, input.personalAccount as Hex, input.destination as Hex, input.asset as Hex, input.amount, input.executorFee, input.nonce, input.memoHash],
  ));
}

export function createFundingJob(input: FundingJobInput): SmartAccountFundingJob {
  if (!isNonZeroHex32(input.jobId) || !HEX32.test(input.expectedPayment.sourceId)
    || !HEX32.test(input.expectedPayment.txHash) || !HEX32.test(input.expectedPayment.memoHash)
    || input.expectedPayment.amountDrops !== input.amount
    || input.expectedPayment.memoHash.toLowerCase() !== input.memoHash.toLowerCase()
    || getAddress(input.expectedPayment.destination) !== getAddress(input.destination)) throw new Error("funding values invalid");
  const operationHash = buildOperationHash(input);
  const expectedPaymentHash = buildPaymentExpectationHash(input.expectedPayment);
  return checkpointFundingJob({ ...input, operationHash, expectedPaymentHash, state: "CREATED" });
}

export function assertFundingJobIntegrity(job: SmartAccountFundingJob): void {
  const requiresFdcRequest = job.state === "FDC_REQUESTED" || job.state === "PROOF_READY" || job.state === "DELAYED" || job.state === "DIRECT_MINTED";
  const requiresProof = job.state === "PROOF_READY" || job.state === "DELAYED" || job.state === "DIRECT_MINTED";
  if (!isNonZeroHex32(job.jobId) || !HEX32.test(job.operationHash) || !HEX32.test(job.expectedPaymentHash) || !HEX32.test(job.checkpointHash)
    || buildOperationHash(job).toLowerCase() !== job.operationHash.toLowerCase()
    || buildPaymentExpectationHash(job.expectedPayment).toLowerCase() !== job.expectedPaymentHash.toLowerCase()
    || buildFundingCheckpointHash(job).toLowerCase() !== job.checkpointHash.toLowerCase()
    || job.expectedPayment.amountDrops !== job.amount
    || job.expectedPayment.memoHash.toLowerCase() !== job.memoHash.toLowerCase()
    || getAddress(job.expectedPayment.destination) !== getAddress(job.destination)
    || requiresFdcRequest !== isNonZeroHex32(job.fdcRequestId)
    || requiresProof !== isNonZeroHex32(job.proofCommitment)
    || (job.state === "DELAYED") !== (job.executionAllowedAt !== undefined)
    || (job.state === "DIRECT_MINTED") !== isNonZeroHex32(job.mintTransactionHash)) throw new Error("funding job drift");
}

export function observeXrplPayment(job: SmartAccountFundingJob, observation: ExpectedXrplPayment & { validated: boolean; result: string; ledgerIndex: bigint }): SmartAccountFundingJob {
  assertFundingJobIntegrity(job);
  if (job.state !== "CREATED") throw new Error("payment checkpoint is not expected");
  if (!observation.validated || observation.result !== "tesSUCCESS" || observation.network !== job.expectedPayment.network
    || observation.sourceId.toLowerCase() !== job.expectedPayment.sourceId.toLowerCase()
    || observation.txHash.toLowerCase() !== job.expectedPayment.txHash.toLowerCase() || observation.source !== job.expectedPayment.source
    || getAddress(observation.proofOwner) !== getAddress(job.expectedPayment.proofOwner)
    || getAddress(observation.destination) !== getAddress(job.expectedPayment.destination) || observation.amountDrops !== job.expectedPayment.amountDrops
    || observation.memoHash.toLowerCase() !== job.expectedPayment.memoHash.toLowerCase()
    || observation.ledgerIndex < job.expectedPayment.minLedgerIndex) throw new Error("XRPL payment mismatch");
  return checkpointFundingJob({ ...job, state: "PAYMENT_OBSERVED" });
}

export function markFdcRequested(job: SmartAccountFundingJob, fdcRequestId: Hex): SmartAccountFundingJob {
  assertFundingJobIntegrity(job);
  if (job.state !== "PAYMENT_OBSERVED" || !isNonZeroHex32(fdcRequestId)) throw new Error("FDC request checkpoint invalid");
  return checkpointFundingJob({ ...job, state: "FDC_REQUESTED", fdcRequestId });
}

export async function acceptFdcProof(job: SmartAccountFundingJob, proof: XrplPaymentProofV1, verifier: FdcProofVerifier | undefined): Promise<SmartAccountFundingJob> {
  assertFundingJobIntegrity(job);
  if (job.state !== "FDC_REQUESTED") throw new Error("FDC proof is not expected");
  const result = await verifyXrplPaymentProof(proof, job.expectedPayment, verifier);
  if (!result.ok) throw new Error(`FDC proof rejected: ${result.reason}`);
  if (!isNonZeroHex32(result.proofCommitment)) throw new Error("FDC proof rejected: PROOF_INVALID");
  return checkpointFundingJob({ ...job, state: "PROOF_READY", proofCommitment: result.proofCommitment });
}

export async function executeDirectMint(job: SmartAccountFundingJob, proof: XrplPaymentProofV1, client: DirectMintClient | undefined): Promise<SmartAccountFundingJob> {
  assertFundingJobIntegrity(job);
  if (job.state !== "PROOF_READY" || !client) throw new Error("direct mint unavailable");
  if (!job.proofCommitment || proof.responseCommitment.toLowerCase() !== job.proofCommitment.toLowerCase()
    || !proof.finalized || !matchesExpectedXrplPayment(proof, job.expectedPayment)) throw new Error("direct mint proof drift");
  const outcome = await client.executeDirectMint(job, proof);
  if (outcome.status === "DIRECT_MINTED") {
    const receiptMatches = isNonZeroHex32(outcome.transactionHash)
      && outcome.operationHash.toLowerCase() === job.operationHash.toLowerCase()
      && getAddress(outcome.owner) === getAddress(job.owner)
      && getAddress(outcome.personalAccount) === getAddress(job.personalAccount)
      && getAddress(outcome.destination) === getAddress(job.destination)
      && getAddress(outcome.asset) === getAddress(job.asset)
      && outcome.amount === job.amount && outcome.executorFee === job.executorFee && outcome.nonce === job.nonce;
    if (!receiptMatches) throw new Error("direct mint receipt drift");
    return checkpointFundingJob({ ...job, state: "DIRECT_MINTED", mintTransactionHash: outcome.transactionHash });
  }
  if (outcome.status === "DELAYED" && outcome.operationHash.toLowerCase() === job.operationHash.toLowerCase()
    && outcome.executionAllowedAt >= 0n && outcome.executionAllowedAt <= MAX_UINT64) {
    return checkpointFundingJob({ ...job, state: "DELAYED", executionAllowedAt: outcome.executionAllowedAt });
  }
  throw new Error("unknown direct mint outcome");
}

export function resumeDelayed(job: SmartAccountFundingJob, now: bigint): SmartAccountFundingJob {
  assertFundingJobIntegrity(job);
  if (job.state !== "DELAYED" || job.executionAllowedAt === undefined || now < 0n || now > MAX_UINT64
    || now < job.executionAllowedAt) throw new Error("direct mint is not resumable");
  const { executionAllowedAt: _completedDelay, ...checkpoint } = job;
  return checkpointFundingJob({ ...checkpoint, state: "PROOF_READY" });
}
