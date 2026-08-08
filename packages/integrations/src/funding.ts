import { encodeAbiParameters, keccak256, type Hex } from "viem";
import type { FdcProofVerifier, ExpectedXrplPayment, XrplPaymentProofV1 } from "./fdc.js";
import { verifyXrplPaymentProof } from "./fdc.js";

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
  expectedPayment: ExpectedXrplPayment;
  state: FundingState;
  fdcRequestId?: Hex;
  proofCommitment?: Hex;
  executionAllowedAt?: bigint;
}

export interface DirectMintClient {
  executeDirectMint(job: SmartAccountFundingJob, proof: XrplPaymentProofV1): Promise<{ status: "DIRECT_MINTED" } | { status: "DELAYED"; executionAllowedAt: bigint }>;
}

export function buildOperationHash(input: Pick<SmartAccountFundingJob, "owner" | "personalAccount" | "destination" | "asset" | "amount" | "executorFee" | "nonce" | "memoHash">): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }],
    [keccak256(new TextEncoder().encode("PAYGUARD_SMART_ACCOUNT_OPERATION_V1")), input.owner as Hex, input.personalAccount as Hex, input.destination as Hex, input.asset as Hex, input.amount, input.executorFee, input.nonce, input.memoHash],
  ));
}

export function createFundingJob(input: Omit<SmartAccountFundingJob, "operationHash" | "state">): SmartAccountFundingJob {
  if (input.amount <= 0n || input.executorFee < 0n || input.nonce < 0n) throw new Error("funding values invalid");
  const operationHash = buildOperationHash(input);
  return { ...input, operationHash, state: "CREATED" };
}

export function observeXrplPayment(job: SmartAccountFundingJob, observation: ExpectedXrplPayment & { validated: boolean; result: string; ledgerIndex: bigint }): SmartAccountFundingJob {
  if (job.state !== "CREATED") throw new Error("payment checkpoint is not expected");
  if (!observation.validated || observation.result !== "tesSUCCESS" || observation.network !== job.expectedPayment.network
    || observation.txHash.toLowerCase() !== job.expectedPayment.txHash.toLowerCase() || observation.source !== job.expectedPayment.source
    || observation.destination !== job.expectedPayment.destination || observation.amountDrops !== job.expectedPayment.amountDrops
    || observation.memoHash.toLowerCase() !== job.expectedPayment.memoHash.toLowerCase()
    || observation.ledgerIndex < job.expectedPayment.minLedgerIndex) throw new Error("XRPL payment mismatch");
  return { ...job, state: "PAYMENT_OBSERVED" };
}

export function markFdcRequested(job: SmartAccountFundingJob, fdcRequestId: Hex): SmartAccountFundingJob {
  if (job.state !== "PAYMENT_OBSERVED" || !/^0x[0-9a-fA-F]{64}$/.test(fdcRequestId)) throw new Error("FDC request checkpoint invalid");
  return { ...job, state: "FDC_REQUESTED", fdcRequestId };
}

export async function acceptFdcProof(job: SmartAccountFundingJob, proof: XrplPaymentProofV1, verifier: FdcProofVerifier | undefined): Promise<SmartAccountFundingJob> {
  if (job.state !== "FDC_REQUESTED") throw new Error("FDC proof is not expected");
  const result = await verifyXrplPaymentProof(proof, job.expectedPayment, verifier);
  if (!result.ok) throw new Error(`FDC proof rejected: ${result.reason}`);
  return { ...job, state: "PROOF_READY", proofCommitment: result.proofCommitment };
}

export async function executeDirectMint(job: SmartAccountFundingJob, proof: XrplPaymentProofV1, client: DirectMintClient | undefined): Promise<SmartAccountFundingJob> {
  if (job.state !== "PROOF_READY" || !client) throw new Error("direct mint unavailable");
  const outcome = await client.executeDirectMint(job, proof);
  if (outcome.status === "DIRECT_MINTED") return { ...job, state: "DIRECT_MINTED" };
  if (outcome.status === "DELAYED" && outcome.executionAllowedAt >= 0n) return { ...job, state: "DELAYED", executionAllowedAt: outcome.executionAllowedAt };
  throw new Error("unknown direct mint outcome");
}

export function resumeDelayed(job: SmartAccountFundingJob, now: bigint): SmartAccountFundingJob {
  if (job.state !== "DELAYED" || job.executionAllowedAt === undefined || now < job.executionAllowedAt) throw new Error("direct mint is not resumable");
  return { ...job, state: "PROOF_READY" };
}
