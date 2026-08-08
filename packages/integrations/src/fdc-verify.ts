import { encodeFunctionData, getAddress, isAddress, keccak256, zeroAddress, zeroHash, type Hex } from "viem";
import type { Coston2FdcRoundFinality } from "./fdc-finality.js";
import { COSTON2_FDC_CHAIN_ID } from "./fdc-finality.js";
import { FDC_XRP_PAYMENT_V1 } from "./triggers.js";
import { XRPL_TESTNET_SOURCE_ID } from "./fdc-request.js";
import type { FdcXrplPaymentProofEnvelopeV1 } from "./fdc-proof.js";

const MAX_UINT64 = (1n << 64n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_CALL_DATA_BYTES = 131_072;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;

const XRPL_PAYMENT_PROOF_COMPONENT = {
  type: "tuple",
  name: "_proof",
  components: [
    { name: "merkleProof", type: "bytes32[]" },
    {
      name: "data",
      type: "tuple",
      components: [
        { name: "attestationType", type: "bytes32" },
        { name: "sourceId", type: "bytes32" },
        { name: "votingRound", type: "uint64" },
        { name: "lowestUsedTimestamp", type: "uint64" },
        { name: "requestBody", type: "tuple", components: [
          { name: "transactionId", type: "bytes32" },
          { name: "proofOwner", type: "address" },
        ] },
        { name: "responseBody", type: "tuple", components: [
          { name: "blockNumber", type: "uint64" },
          { name: "blockTimestamp", type: "uint64" },
          { name: "sourceAddress", type: "string" },
          { name: "sourceAddressHash", type: "bytes32" },
          { name: "receivingAddressHash", type: "bytes32" },
          { name: "intendedReceivingAddressHash", type: "bytes32" },
          { name: "spentAmount", type: "int256" },
          { name: "intendedSpentAmount", type: "int256" },
          { name: "receivedAmount", type: "int256" },
          { name: "intendedReceivedAmount", type: "int256" },
          { name: "hasMemoData", type: "bool" },
          { name: "firstMemoData", type: "bytes" },
          { name: "hasDestinationTag", type: "bool" },
          { name: "destinationTag", type: "uint256" },
          { name: "status", type: "uint8" },
        ] },
      ],
    },
  ],
} as const;

/** Official FdcVerification entry point for IXRPPayment proofs. */
export const FDC_XRPL_PAYMENT_VERIFICATION_ABI = [{
  type: "function",
  name: "verifyXRPPayment",
  stateMutability: "view",
  inputs: [XRPL_PAYMENT_PROOF_COMPONENT],
  outputs: [{ name: "_proved", type: "bool" }],
}] as const;

export type FdcVerificationFailure = "INVALID_INPUT" | "NOT_FINALIZED" | "DRIFT" | "MALFORMED" | "UNAVAILABLE" | "PROOF_INVALID";

export class FdcVerificationError extends Error {
  constructor(readonly reason: FdcVerificationFailure, message: string) {
    super(message);
    this.name = "FdcVerificationError";
  }
}

type XrplPaymentAbiProof = {
  merkleProof: readonly Hex[];
  data: {
    attestationType: Hex;
    sourceId: Hex;
    votingRound: bigint;
    lowestUsedTimestamp: bigint;
    requestBody: { transactionId: Hex; proofOwner: Hex };
    responseBody: FdcXrplPaymentProofEnvelopeV1["response"]["responseBody"];
  };
};

export interface FdcXrplPaymentVerificationReader {
  readContract(args: {
    address: Hex;
    abi: typeof FDC_XRPL_PAYMENT_VERIFICATION_ABI;
    functionName: "verifyXRPPayment";
    args: readonly [XrplPaymentAbiProof];
  }): Promise<unknown>;
}

export interface Coston2VerifiedXrplPaymentV1 {
  chainId: typeof COSTON2_FDC_CHAIN_ID;
  verificationAddress: Hex;
  relayAddress: Hex;
  protocolId: bigint;
  votingRoundId: bigint;
  merkleRoot: Hex;
  transactionId: Hex;
  proofOwner: Hex;
  proofCommitment: Hex;
}

function fail(reason: FdcVerificationFailure, message: string): never {
  throw new FdcVerificationError(reason, message);
}

function address(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) {
    fail("INVALID_INPUT", `${label} is invalid`);
  }
  return getAddress(value) as Hex;
}

function bytes32(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !HEX32.test(value)) fail("MALFORMED", `${label} is malformed`);
  return value.toLowerCase() as Hex;
}

function uint(value: unknown, max: bigint, label: string): bigint {
  if (typeof value !== "bigint" || value < 0n || value > max) fail("MALFORMED", `${label} is invalid`);
  return value;
}

function proofFromEnvelope(envelope: FdcXrplPaymentProofEnvelopeV1, finality: Coston2FdcRoundFinality, expectedProofOwner?: string): XrplPaymentAbiProof {
  if (envelope.status !== "AVAILABLE") fail("MALFORMED", "FDC XRPL proof envelope is unavailable");
  const merkleRoot = finality.merkleRoot;
  if (finality.chainId !== COSTON2_FDC_CHAIN_ID || finality.finalized !== true || merkleRoot === null) {
    fail("NOT_FINALIZED", "FDC XRPL proof round is not finalized");
  }
  if (finality.votingRoundId !== envelope.votingRoundId || merkleRoot.toLowerCase() === zeroHash) {
    fail("DRIFT", "FDC XRPL proof finality does not bind the envelope round");
  }
  const response = envelope.response;
  if (response.attestationType.toLowerCase() !== FDC_XRP_PAYMENT_V1.toLowerCase()
    || response.sourceId.toLowerCase() !== XRPL_TESTNET_SOURCE_ID.toLowerCase()
    || response.votingRound !== envelope.votingRoundId
    || response.lowestUsedTimestamp !== response.responseBody.blockTimestamp) {
    fail("DRIFT", "FDC XRPL proof type, source, round, or timestamp drift");
  }
  const transactionId = bytes32(response.requestBody.transactionId, "FDC XRPL transaction ID");
  if (transactionId === zeroHash) fail("MALFORMED", "FDC XRPL transaction ID is zero");
  const proofOwner = address(response.requestBody.proofOwner, "FDC XRPL proof owner");
  if (expectedProofOwner !== undefined && proofOwner !== address(expectedProofOwner, "expected FDC proof owner")) {
    fail("DRIFT", "FDC XRPL proof owner drift");
  }
  if (response.responseBody.status !== 0) fail("DRIFT", "FDC XRPL payment is not successful");
  if (envelope.merkleProof.length > 256 || envelope.merkleProof.some((node) => !HEX32.test(node))) {
    fail("MALFORMED", "FDC XRPL Merkle proof is malformed");
  }
  uint(response.votingRound, MAX_UINT64, "FDC XRPL voting round");
  uint(response.lowestUsedTimestamp, MAX_UINT64, "FDC XRPL lowest timestamp");
  uint(response.responseBody.blockNumber, MAX_UINT64, "FDC XRPL block number");
  uint(response.responseBody.blockTimestamp, MAX_UINT64, "FDC XRPL block timestamp");
  uint(response.responseBody.destinationTag, MAX_UINT256, "FDC XRPL destination tag");
  if (!HEX_BYTES.test(response.responseBody.firstMemoData) || (response.responseBody.firstMemoData.length - 2) / 2 > 4_096) {
    fail("MALFORMED", "FDC XRPL memo data is malformed");
  }
  const proof: XrplPaymentAbiProof = {
    merkleProof: envelope.merkleProof,
    data: {
      attestationType: response.attestationType,
      sourceId: response.sourceId,
      votingRound: response.votingRound,
      lowestUsedTimestamp: response.lowestUsedTimestamp,
      requestBody: { transactionId, proofOwner },
      responseBody: response.responseBody,
    },
  };
  return proof;
}

/**
 * Ask the runtime FdcVerification contract to verify the exact IXRPPayment
 * Merkle proof. A true RPC result is the only success path; no local payload
 * or DA response is promoted to a cryptographic proof by itself.
 */
export async function verifyCoston2XrplPaymentProof(
  reader: FdcXrplPaymentVerificationReader,
  input: {
    verificationAddress: string;
    payment: FdcXrplPaymentProofEnvelopeV1;
    finality: Coston2FdcRoundFinality;
    expectedProofOwner?: string;
  },
): Promise<Coston2VerifiedXrplPaymentV1> {
  const verificationAddress = address(input.verificationAddress, "FDC verification address");
  const proof = proofFromEnvelope(input.payment, input.finality, input.expectedProofOwner);
  let result: unknown;
  try {
    result = await reader.readContract({
      address: verificationAddress,
      abi: FDC_XRPL_PAYMENT_VERIFICATION_ABI,
      functionName: "verifyXRPPayment",
      args: [proof],
    });
  } catch {
    fail("UNAVAILABLE", "FDC XRPL proof verification read failed");
  }
  if (result !== true) fail("PROOF_INVALID", "FDC XRPL proof was rejected");
  const calldata = encodeFunctionData({
    abi: FDC_XRPL_PAYMENT_VERIFICATION_ABI,
    functionName: "verifyXRPPayment",
    args: [proof],
  }) as Hex;
  if ((calldata.length - 2) / 2 > MAX_CALL_DATA_BYTES) fail("MALFORMED", "FDC XRPL verification calldata is oversized");
  const merkleRoot = input.finality.merkleRoot;
  if (merkleRoot === null) fail("NOT_FINALIZED", "FDC XRPL proof round is not finalized");
  return {
    chainId: COSTON2_FDC_CHAIN_ID,
    verificationAddress,
    relayAddress: input.finality.relayAddress,
    protocolId: input.finality.protocolId,
    votingRoundId: input.payment.votingRoundId,
    merkleRoot,
    transactionId: proof.data.requestBody.transactionId,
    proofOwner: proof.data.requestBody.proofOwner,
    proofCommitment: keccak256(calldata),
  };
}
