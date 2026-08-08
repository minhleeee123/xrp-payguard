import { getAddress, isAddress, zeroAddress, type Hex } from "viem";
import { buildCoston2DirectMintCall, type Coston2DirectMintCallIntentV1 } from "./fassets-direct-mint-call.js";
import { COSTON2_FDC_CHAIN_ID, readCoston2FdcRoundFinality, type Coston2FdcRoundFinality, type FdcFinalityReader } from "./fdc-finality.js";
import { fetchCoston2XrplPaymentProof, type FdcProofFetch, type FdcXrplPaymentProofEnvelopeV1 } from "./fdc-proof.js";
import { deriveCoston2FdcVotingRound, type Coston2FdcVotingRound, type FdcRoundReader } from "./fdc-round.js";
import { prepareCoston2FdcSubmission, type Coston2FdcSubmissionIntentV1, type FdcSubmissionReader } from "./fdc-submit.js";
import { verifyCoston2XrplPaymentProof, type Coston2VerifiedXrplPaymentV1, type FdcXrplPaymentVerificationReader } from "./fdc-verify.js";

const MAX_UINT64 = (1n << 64n) - 1n;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;

export type Coston2FdcFlowFailure = "INVALID_INPUT" | "DRIFT";

export class Coston2FdcFlowError extends Error {
  constructor(readonly reason: Coston2FdcFlowFailure, message: string) {
    super(message);
    this.name = "Coston2FdcFlowError";
  }
}

export interface Coston2FdcSubmissionReceiptV1 {
  transactionHash: Hex;
  blockNumber: bigint;
  blockTimestamp: bigint;
}

export interface Coston2FdcFundingPreparationV1 {
  chainId: typeof COSTON2_FDC_CHAIN_ID;
  submission: Coston2FdcSubmissionIntentV1;
  submissionReceipt: Coston2FdcSubmissionReceiptV1;
  round: Coston2FdcVotingRound;
  finality: Coston2FdcRoundFinality;
  payment: FdcXrplPaymentProofEnvelopeV1;
  verification: Coston2VerifiedXrplPaymentV1;
  directMint: Coston2DirectMintCallIntentV1;
}

export interface Coston2FdcProofFetcher {
  (input: { votingRoundId: bigint; requestBytes: Hex; apiKey: string; fetcher?: FdcProofFetch }): Promise<FdcXrplPaymentProofEnvelopeV1>;
}

export interface Coston2FdcFundingPreparationInput {
  hubAddress: string;
  verificationAddress: string;
  relayAddress: string;
  requestBytes: Hex;
  apiKey: string;
  submissionReceipt: Coston2FdcSubmissionReceiptV1;
  assetManager: string;
  valueWei?: bigint;
  userOperationData?: Hex;
  expectedProofOwner?: string;
  submissionReader: FdcSubmissionReader;
  roundReader: FdcRoundReader;
  finalityReader: FdcFinalityReader;
  verificationReader: FdcXrplPaymentVerificationReader;
  proofFetcher?: Coston2FdcProofFetcher;
  proofTransport?: FdcProofFetch;
}

function fail(reason: Coston2FdcFlowFailure, message: string): never {
  throw new Coston2FdcFlowError(reason, message);
}

function address(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) {
    fail("INVALID_INPUT", `${label} is invalid`);
  }
  return getAddress(value) as Hex;
}

function receipt(input: Coston2FdcSubmissionReceiptV1): Coston2FdcSubmissionReceiptV1 {
  if (typeof input !== "object" || input === null || !HEX32.test(input.transactionHash)
    || typeof input.blockNumber !== "bigint" || input.blockNumber <= 0n || input.blockNumber > MAX_UINT64
    || typeof input.blockTimestamp !== "bigint" || input.blockTimestamp <= 0n || input.blockTimestamp > MAX_UINT64) {
    fail("INVALID_INPUT", "FDC submission receipt checkpoint is invalid");
  }
  return { ...input, transactionHash: input.transactionHash.toLowerCase() as Hex };
}

/**
 * Compose the public FDC path after an external writer has mined the request.
 * This function never signs or broadcasts: the receipt is an explicit public
 * checkpoint supplied by the caller, while the DA key remains runtime-only.
 */
export async function prepareCoston2FdcFundingFlow(
  input: Coston2FdcFundingPreparationInput,
): Promise<Coston2FdcFundingPreparationV1> {
  const verificationAddress = address(input.verificationAddress, "FDC verification address");
  const relayAddress = address(input.relayAddress, "FDC Relay address");
  const submissionReceipt = receipt(input.submissionReceipt);
  const submission = await prepareCoston2FdcSubmission(input.submissionReader, {
    hubAddress: input.hubAddress,
    requestBytes: input.requestBytes,
  });
  const round = await deriveCoston2FdcVotingRound(input.roundReader, {
    relayAddress,
    blockTimestamp: submissionReceipt.blockTimestamp,
  });
  const finality = await readCoston2FdcRoundFinality(input.finalityReader, {
    verificationAddress,
    votingRoundId: round.votingRoundId,
  });
  if (finality.relayAddress.toLowerCase() !== round.relayAddress.toLowerCase()) {
    fail("DRIFT", "FDC verification Relay differs from round Relay");
  }
  const proofFetcher = input.proofFetcher ?? fetchCoston2XrplPaymentProof;
  const payment = await proofFetcher({
    votingRoundId: round.votingRoundId,
    requestBytes: submission.requestBytes,
    apiKey: input.apiKey,
    ...(input.proofTransport === undefined ? {} : { fetcher: input.proofTransport }),
  });
  const verification = await verifyCoston2XrplPaymentProof(input.verificationReader, {
    verificationAddress,
    payment,
    finality,
    ...(input.expectedProofOwner === undefined ? {} : { expectedProofOwner: input.expectedProofOwner }),
  });
  const directMint = buildCoston2DirectMintCall({
    assetManager: input.assetManager,
    payment,
    finality,
    ...(input.valueWei === undefined ? {} : { valueWei: input.valueWei }),
    ...(input.userOperationData === undefined ? {} : { userOperationData: input.userOperationData }),
  });
  return {
    chainId: COSTON2_FDC_CHAIN_ID,
    submission,
    submissionReceipt,
    round,
    finality,
    payment,
    verification,
    directMint,
  };
}
