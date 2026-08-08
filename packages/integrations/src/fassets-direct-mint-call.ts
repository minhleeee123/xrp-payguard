import { encodeFunctionData, getAddress, isAddress, zeroAddress, type Hex } from "viem";
import type { Coston2FdcRoundFinality } from "./fdc-finality.js";
import type { FdcXrplPaymentProofEnvelopeV1 } from "./fdc-proof.js";
import { COSTON2_FDC_CHAIN_ID } from "./fdc-finality.js";
import { XRPL_TESTNET_SOURCE_ID } from "./fdc-request.js";
import { FDC_XRP_PAYMENT_V1 } from "./triggers.js";

const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_CALL_DATA_BYTES = 131_072;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;

const XRPL_PAYMENT_PROOF_COMPONENT = {
  type: "tuple",
  name: "_payment",
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

export const FASSET_DIRECT_MINT_CALL_ABI = [
  { type: "function", name: "executeDirectMinting", stateMutability: "payable", inputs: [XRPL_PAYMENT_PROOF_COMPONENT], outputs: [] },
  { type: "function", name: "executeDirectMintingWithData", stateMutability: "payable", inputs: [XRPL_PAYMENT_PROOF_COMPONENT, { name: "_data", type: "bytes" }], outputs: [] },
] as const;

export type DirectMintCallFailure = "INVALID_INPUT" | "NOT_FINALIZED" | "DRIFT" | "MALFORMED";

export class DirectMintCallError extends Error {
  constructor(readonly reason: DirectMintCallFailure, message: string) {
    super(message);
    this.name = "DirectMintCallError";
  }
}

export interface Coston2DirectMintCallIntentV1 {
  assetManager: Hex;
  mode: "executeDirectMinting" | "executeDirectMintingWithData";
  valueWei: bigint;
  calldata: Hex;
  transactionId: Hex;
  votingRoundId: bigint;
}

function fail(reason: DirectMintCallFailure, message: string): never {
  throw new DirectMintCallError(reason, message);
}

function address(value: unknown): Hex {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) fail("INVALID_INPUT", "AssetManager address is invalid");
  return getAddress(value) as Hex;
}

function bytes(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !HEX_BYTES.test(value) || (value.length - 2) / 2 > MAX_CALL_DATA_BYTES) fail("INVALID_INPUT", `${label} is malformed or oversized`);
  return value.toLowerCase() as Hex;
}

function uint256(value: unknown, label: string): bigint {
  if (typeof value !== "bigint" || value < 0n || value > MAX_UINT256) fail("INVALID_INPUT", `${label} is invalid`);
  return value;
}

function toProof(envelope: FdcXrplPaymentProofEnvelopeV1): {
  merkleProof: readonly Hex[];
  data: {
    attestationType: Hex;
    sourceId: Hex;
    votingRound: bigint;
    lowestUsedTimestamp: bigint;
    requestBody: { transactionId: Hex; proofOwner: Hex };
    responseBody: FdcXrplPaymentProofEnvelopeV1["response"]["responseBody"];
  };
} {
  if (envelope.status !== "AVAILABLE") fail("MALFORMED", "FDC payment envelope is unavailable");
  if (envelope.response.attestationType.toLowerCase() !== FDC_XRP_PAYMENT_V1.toLowerCase()
    || envelope.response.sourceId.toLowerCase() !== XRPL_TESTNET_SOURCE_ID.toLowerCase()) {
    fail("DRIFT", "FDC payment type or source drift");
  }
  if (envelope.votingRoundId <= 0n || envelope.response.votingRound !== envelope.votingRoundId) {
    fail("DRIFT", "FDC payment round drift");
  }
  if (!HEX32.test(envelope.response.requestBody.transactionId) || /^0x0+$/i.test(envelope.response.requestBody.transactionId)
    || envelope.merkleProof.some((node) => !HEX32.test(node))) {
    fail("MALFORMED", "FDC payment proof bytes are malformed");
  }
  if (envelope.response.responseBody.status !== 0) fail("DRIFT", "FDC payment is not successful");
  if (!isAddress(envelope.response.requestBody.proofOwner) || getAddress(envelope.response.requestBody.proofOwner) === zeroAddress) {
    fail("MALFORMED", "FDC payment proof owner is invalid");
  }
  const proofOwner = getAddress(envelope.response.requestBody.proofOwner) as Hex;
  return {
    merkleProof: envelope.merkleProof,
    data: {
      attestationType: envelope.response.attestationType,
      sourceId: envelope.response.sourceId,
      votingRound: envelope.response.votingRound,
      lowestUsedTimestamp: envelope.response.lowestUsedTimestamp,
      requestBody: { transactionId: envelope.response.requestBody.transactionId, proofOwner },
      responseBody: envelope.response.responseBody,
    },
  };
}

export function buildCoston2DirectMintCall(input: {
  assetManager: string;
  payment: FdcXrplPaymentProofEnvelopeV1;
  finality: Coston2FdcRoundFinality;
  valueWei?: bigint;
  userOperationData?: Hex;
}): Coston2DirectMintCallIntentV1 {
  const assetManager = address(input.assetManager);
  const valueWei = uint256(input.valueWei ?? 0n, "direct mint msg.value");
  if (input.finality.chainId !== COSTON2_FDC_CHAIN_ID || input.finality.finalized !== true || input.finality.merkleRoot === null) {
    fail("NOT_FINALIZED", "FDC round is not finalized");
  }
  if (input.finality.votingRoundId !== input.payment.votingRoundId
    || input.finality.merkleRoot.toLowerCase() === "0x".padEnd(66, "0")) {
    fail("DRIFT", "FDC finality does not bind the payment round");
  }
  const proof = toProof(input.payment);
  const userOperationData = input.userOperationData === undefined ? undefined : bytes(input.userOperationData, "Smart Account user operation");
  if (userOperationData === "0x") fail("INVALID_INPUT", "Smart Account user operation is empty");
  const mode = userOperationData === undefined ? "executeDirectMinting" : "executeDirectMintingWithData";
  const calldata = (userOperationData === undefined
    ? encodeFunctionData({ abi: FASSET_DIRECT_MINT_CALL_ABI, functionName: "executeDirectMinting", args: [proof] })
    : encodeFunctionData({ abi: FASSET_DIRECT_MINT_CALL_ABI, functionName: "executeDirectMintingWithData", args: [proof, userOperationData] })) as Hex;
  return {
    assetManager,
    mode,
    valueWei,
    calldata,
    transactionId: proof.data.requestBody.transactionId,
    votingRoundId: proof.data.votingRound,
  };
}
