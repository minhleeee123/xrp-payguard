import type { Hex } from "@xrp-payguard/protocol";
import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  padHex,
  stringToHex,
  zeroAddress,
  zeroHash,
} from "viem";

const MAX_UINT16 = (1n << 16n) - 1n;
const MAX_UINT32 = (1n << 32n) - 1n;
const MAX_UINT64 = (1n << 64n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;
const MIN_INT256 = -(1n << 255n);
const MAX_INT256 = (1n << 255n) - 1n;
const MAX_EVM_INPUT_BYTES = 131_072;
const MAX_EVM_EVENT_DATA_BYTES = 65_536;
const MAX_XRPL_MEMO_BYTES = 4_096;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;

export const FDC_EVM_TRANSACTION_V1 = padHex(stringToHex("EVMTransaction"), { dir: "right", size: 32 });
export const FDC_XRP_PAYMENT_V1 = padHex(stringToHex("XRPPayment"), { dir: "right", size: 32 });

export type TriggerFailure =
  | "ATTESTATION_TYPE"
  | "NOT_FINALIZED"
  | "VERIFIER_UNAVAILABLE"
  | "PROOF_INVALID"
  | "REPLAY"
  | "REQUEST_MISMATCH"
  | "RESPONSE_MISMATCH"
  | "STALE"
  | "MALFORMED";

export type TriggerVerification =
  | { ok: true; inputCommitment: Hex; proofCommitment: Hex }
  | { ok: false; reason: TriggerFailure };

export interface FdcTriggerVerifier<TProof> {
  verify(proof: TProof): Promise<Hex | false>;
}

interface FdcEnvelopeV1 {
  attestationType: Hex;
  sourceId: Hex;
  votingRound: bigint;
  lowestUsedTimestamp: bigint;
  finalized: boolean;
}

export interface EvmTransactionRequestBodyV1 {
  transactionHash: Hex;
  requiredConfirmations: bigint;
  provideInput: boolean;
  listEvents: boolean;
  logIndices: bigint[];
}

export interface EvmTransactionEventV1 {
  logIndex: bigint;
  emitterAddress: string;
  topics: Hex[];
  data: Hex;
  removed: boolean;
}

export interface EvmTransactionResponseBodyV1 {
  blockNumber: bigint;
  timestamp: bigint;
  sourceAddress: string;
  isDeployment: boolean;
  receivingAddress: string;
  value: bigint;
  input: Hex;
  status: number;
  events: EvmTransactionEventV1[];
}

export interface EvmTransactionTriggerProofV1 extends FdcEnvelopeV1 {
  attestationType: typeof FDC_EVM_TRANSACTION_V1;
  requestBody: EvmTransactionRequestBodyV1;
  responseBody: EvmTransactionResponseBodyV1;
}

export interface ExpectedEvmEventV1 {
  logIndex: bigint;
  emitterAddress: string;
  topics: Hex[];
  dataHash: Hex;
}

export interface ExpectedEvmTransactionTriggerV1 extends EvmTransactionRequestBodyV1 {
  sourceId: Hex;
  sourceAddress: string;
  receivingAddress: string;
  value: bigint;
  inputHash?: Hex;
  events: ExpectedEvmEventV1[];
  minBlockNumber: bigint;
  minTimestamp: bigint;
  maxAgeSeconds: bigint;
}

export interface XrplPaymentRequestBodyV1 {
  transactionId: Hex;
  proofOwner: string;
}

export interface XrplPaymentResponseBodyV1 {
  blockNumber: bigint;
  blockTimestamp: bigint;
  sourceAddress: string;
  sourceAddressHash: Hex;
  receivingAddressHash: Hex;
  intendedReceivingAddressHash: Hex;
  spentAmount: bigint;
  intendedSpentAmount: bigint;
  receivedAmount: bigint;
  intendedReceivedAmount: bigint;
  hasMemoData: boolean;
  firstMemoData: Hex;
  hasDestinationTag: boolean;
  destinationTag: bigint;
  status: number;
}

export interface XrplPaymentTriggerProofV1 extends FdcEnvelopeV1 {
  attestationType: typeof FDC_XRP_PAYMENT_V1;
  requestBody: XrplPaymentRequestBodyV1;
  responseBody: XrplPaymentResponseBodyV1;
}

export interface ExpectedXrplPaymentTriggerV1 extends XrplPaymentRequestBodyV1 {
  sourceId: Hex;
  sourceAddress: string;
  sourceAddressHash: Hex;
  receivingAddressHash: Hex;
  receivedAmount: bigint;
  memoDataHash?: Hex;
  destinationTag?: bigint;
  minBlockNumber: bigint;
  minTimestamp: bigint;
  maxAgeSeconds: bigint;
}

function isHex32(value: unknown): value is Hex {
  return typeof value === "string" && HEX32.test(value);
}

function isNonZeroHex32(value: unknown): value is Hex {
  return isHex32(value) && value.toLowerCase() !== zeroHash;
}

function isUint(value: bigint, max: bigint): boolean {
  return value >= 0n && value <= max;
}

function hexByteLength(value: Hex): number {
  return (value.length - 2) / 2;
}

function isFresh(timestamp: bigint, minTimestamp: bigint, maxAgeSeconds: bigint, now: bigint): boolean {
  return isUint(timestamp, MAX_UINT64) && isUint(minTimestamp, MAX_UINT64)
    && isUint(maxAgeSeconds, MAX_UINT64) && isUint(now, MAX_UINT64)
    && timestamp >= minTimestamp && timestamp <= now && now - timestamp <= maxAgeSeconds;
}

function exactBigints(left: readonly bigint[], right: readonly bigint[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function exactHexes(left: readonly Hex[], right: readonly Hex[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value.toLowerCase() === right[index]?.toLowerCase());
}

function validateExpectedEvmEvent(event: ExpectedEvmEventV1): boolean {
  return isUint(event.logIndex, MAX_UINT32) && isAddress(event.emitterAddress)
    && getAddress(event.emitterAddress) !== zeroAddress && event.topics.length > 0 && event.topics.length <= 4
    && event.topics.every(isHex32) && isHex32(event.dataHash);
}

function eventCommitment(event: EvmTransactionEventV1): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "uint32" }, { type: "address" }, { type: "bytes32[]" }, { type: "bytes32" }, { type: "bool" }],
    [Number(event.logIndex), getAddress(event.emitterAddress), event.topics, keccak256(event.data), event.removed],
  ));
}

function evmInputCommitment(proof: EvmTransactionTriggerProofV1): Hex {
  const logIndicesRoot = keccak256(encodeAbiParameters(
    [{ type: "uint32[]" }],
    [proof.requestBody.logIndices.map(Number)],
  ));
  const eventRoot = keccak256(encodeAbiParameters(
    [{ type: "bytes32[]" }],
    [proof.responseBody.events.map(eventCommitment)],
  ));
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint16" }, { type: "bool" },
      { type: "bool" }, { type: "bytes32" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" },
      { type: "uint64" }, { type: "address" }, { type: "bool" }, { type: "address" }, { type: "uint256" },
      { type: "bytes32" }, { type: "uint8" }, { type: "bytes32" }],
    [FDC_EVM_TRANSACTION_V1, proof.sourceId, proof.requestBody.transactionHash,
      Number(proof.requestBody.requiredConfirmations), proof.requestBody.provideInput, proof.requestBody.listEvents,
      logIndicesRoot, proof.votingRound, proof.lowestUsedTimestamp, proof.responseBody.blockNumber,
      proof.responseBody.timestamp, getAddress(proof.responseBody.sourceAddress), proof.responseBody.isDeployment,
      getAddress(proof.responseBody.receivingAddress), proof.responseBody.value, keccak256(proof.responseBody.input),
      proof.responseBody.status, eventRoot],
  ));
}

function xrpInputCommitment(proof: XrplPaymentTriggerProofV1): Hex {
  const response = proof.responseBody;
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "address" }, { type: "uint64" },
      { type: "uint64" }, { type: "uint64" }, { type: "uint64" }, { type: "bytes32" }, { type: "bytes32" },
      { type: "bytes32" }, { type: "bytes32" }, { type: "int256" }, { type: "int256" }, { type: "int256" },
      { type: "int256" }, { type: "bool" }, { type: "bytes32" }, { type: "bool" }, { type: "uint256" }, { type: "uint8" }],
    [FDC_XRP_PAYMENT_V1, proof.sourceId, proof.requestBody.transactionId, getAddress(proof.requestBody.proofOwner),
      proof.votingRound, proof.lowestUsedTimestamp, response.blockNumber, response.blockTimestamp,
      keccak256(stringToHex(response.sourceAddress)), response.sourceAddressHash, response.receivingAddressHash,
      response.intendedReceivingAddressHash, response.spentAmount, response.intendedSpentAmount, response.receivedAmount,
      response.intendedReceivedAmount, response.hasMemoData, keccak256(response.firstMemoData),
      response.hasDestinationTag, response.destinationTag, response.status],
  ));
}

async function verifyCryptographicProof<TProof>(
  proof: TProof,
  verifier: FdcTriggerVerifier<TProof> | undefined,
  usedProofCommitments: ReadonlySet<string>,
): Promise<TriggerVerification | Hex> {
  if (!verifier) return { ok: false, reason: "VERIFIER_UNAVAILABLE" };
  let proofCommitment: Hex | false;
  try {
    proofCommitment = await verifier.verify(proof);
  } catch {
    return { ok: false, reason: "VERIFIER_UNAVAILABLE" };
  }
  if (!isNonZeroHex32(proofCommitment)) return { ok: false, reason: "PROOF_INVALID" };
  if (usedProofCommitments.has(proofCommitment.toLowerCase())) return { ok: false, reason: "REPLAY" };
  return proofCommitment;
}

export async function verifyEvmTransactionTrigger(
  proof: EvmTransactionTriggerProofV1,
  expected: ExpectedEvmTransactionTriggerV1,
  now: bigint,
  verifier: FdcTriggerVerifier<EvmTransactionTriggerProofV1> | undefined,
  usedTransactions: ReadonlySet<string> = new Set(),
  usedProofCommitments: ReadonlySet<string> = new Set(),
): Promise<TriggerVerification> {
  if (!isHex32(proof.attestationType) || proof.attestationType.toLowerCase() !== FDC_EVM_TRANSACTION_V1.toLowerCase()) return { ok: false, reason: "ATTESTATION_TYPE" };
  if (proof.finalized !== true) return { ok: false, reason: "NOT_FINALIZED" };
  try {
    const request = proof.requestBody;
    const response = proof.responseBody;
    const expectedEventsValid = expected.events.every(validateExpectedEvmEvent);
    const requestShapeValid = isNonZeroHex32(expected.sourceId) && isNonZeroHex32(expected.transactionHash)
      && isUint(expected.requiredConfirmations, MAX_UINT16) && expected.requiredConfirmations > 0n
      && typeof expected.provideInput === "boolean" && typeof expected.listEvents === "boolean"
      && expected.logIndices.length <= 50 && expected.logIndices.every((value) => isUint(value, MAX_UINT32))
      && expected.logIndices.every((value, index) => index === 0 || value > expected.logIndices[index - 1]!)
      && ((expected.listEvents && expected.events.length > 0 && exactBigints(expected.logIndices, expected.events.map((event) => event.logIndex)))
        || (!expected.listEvents && expected.logIndices.length === 0 && expected.events.length === 0))
      && expectedEventsValid && isAddress(expected.sourceAddress) && isAddress(expected.receivingAddress)
      && getAddress(expected.sourceAddress) !== zeroAddress && getAddress(expected.receivingAddress) !== zeroAddress
      && isUint(expected.value, MAX_UINT256) && isUint(expected.minBlockNumber, MAX_UINT64)
      && (expected.provideInput ? isHex32(expected.inputHash) : expected.inputHash === undefined);
    if (!requestShapeValid || !isHex32(proof.sourceId) || !isHex32(request.transactionHash)
      || typeof request.provideInput !== "boolean" || typeof request.listEvents !== "boolean"
      || !isUint(proof.votingRound, MAX_UINT64) || proof.votingRound === 0n
      || !isUint(proof.lowestUsedTimestamp, MAX_UINT64) || !Array.isArray(response.events)) return { ok: false, reason: "MALFORMED" };
    if (usedTransactions.has(request.transactionHash.toLowerCase())) return { ok: false, reason: "REPLAY" };
    if (proof.sourceId.toLowerCase() !== expected.sourceId.toLowerCase()
      || request.transactionHash.toLowerCase() !== expected.transactionHash.toLowerCase()
      || request.requiredConfirmations !== expected.requiredConfirmations || request.provideInput !== expected.provideInput
      || request.listEvents !== expected.listEvents || !exactBigints(request.logIndices, expected.logIndices)) return { ok: false, reason: "REQUEST_MISMATCH" };
    if (!isUint(response.blockNumber, MAX_UINT64) || response.blockNumber < expected.minBlockNumber
      || response.timestamp !== proof.lowestUsedTimestamp || !isFresh(response.timestamp, expected.minTimestamp, expected.maxAgeSeconds, now)) return { ok: false, reason: "STALE" };
    if (response.status !== 1 || typeof response.isDeployment !== "boolean" || response.isDeployment
      || !isAddress(response.sourceAddress) || !isAddress(response.receivingAddress)
      || getAddress(response.sourceAddress) !== getAddress(expected.sourceAddress)
      || getAddress(response.receivingAddress) !== getAddress(expected.receivingAddress)
      || !isUint(response.value, MAX_UINT256) || response.value !== expected.value || !HEX_BYTES.test(response.input)
      || hexByteLength(response.input) > MAX_EVM_INPUT_BYTES
      || (expected.provideInput ? keccak256(response.input).toLowerCase() !== expected.inputHash?.toLowerCase() : response.input.toLowerCase() !== "0x00")
      || response.events.length !== expected.events.length) return { ok: false, reason: "RESPONSE_MISMATCH" };
    for (let index = 0; index < response.events.length; index += 1) {
      const actual = response.events[index]!;
      const wanted = expected.events[index]!;
      if (!isUint(actual.logIndex, MAX_UINT32) || typeof actual.removed !== "boolean" || actual.removed
        || !isAddress(actual.emitterAddress)
        || actual.logIndex !== wanted.logIndex || getAddress(actual.emitterAddress) !== getAddress(wanted.emitterAddress)
        || actual.topics.length === 0 || actual.topics.length > 4 || !actual.topics.every(isHex32)
        || !exactHexes(actual.topics, wanted.topics) || !HEX_BYTES.test(actual.data)
        || hexByteLength(actual.data) < 32 || hexByteLength(actual.data) > MAX_EVM_EVENT_DATA_BYTES
        || hexByteLength(actual.data) % 32 !== 0
        || keccak256(actual.data).toLowerCase() !== wanted.dataHash.toLowerCase()) return { ok: false, reason: "RESPONSE_MISMATCH" };
    }
    const inputCommitment = evmInputCommitment(proof);
    const verified = await verifyCryptographicProof(proof, verifier, usedProofCommitments);
    if (typeof verified !== "string") return verified;
    if (usedTransactions.has(request.transactionHash.toLowerCase())) return { ok: false, reason: "REPLAY" };
    if (proof.finalized !== true || !isHex32(proof.attestationType)
      || proof.attestationType.toLowerCase() !== FDC_EVM_TRANSACTION_V1.toLowerCase()
      || evmInputCommitment(proof).toLowerCase() !== inputCommitment.toLowerCase()) return { ok: false, reason: "MALFORMED" };
    return { ok: true, inputCommitment, proofCommitment: verified };
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
}

export async function verifyXrplPaymentTrigger(
  proof: XrplPaymentTriggerProofV1,
  expected: ExpectedXrplPaymentTriggerV1,
  now: bigint,
  verifier: FdcTriggerVerifier<XrplPaymentTriggerProofV1> | undefined,
  usedTransactions: ReadonlySet<string> = new Set(),
  usedProofCommitments: ReadonlySet<string> = new Set(),
): Promise<TriggerVerification> {
  if (!isHex32(proof.attestationType) || proof.attestationType.toLowerCase() !== FDC_XRP_PAYMENT_V1.toLowerCase()) return { ok: false, reason: "ATTESTATION_TYPE" };
  if (proof.finalized !== true) return { ok: false, reason: "NOT_FINALIZED" };
  try {
    const request = proof.requestBody;
    const response = proof.responseBody;
    const expectedShapeValid = isNonZeroHex32(expected.sourceId) && isNonZeroHex32(expected.transactionId)
      && isAddress(expected.proofOwner) && getAddress(expected.proofOwner) !== zeroAddress
      && expected.sourceAddress.length > 0 && isNonZeroHex32(expected.sourceAddressHash)
      && isNonZeroHex32(expected.receivingAddressHash) && expected.receivedAmount > 0n
      && expected.receivedAmount <= MAX_INT256 && isUint(expected.minBlockNumber, MAX_UINT64)
      && (expected.memoDataHash === undefined || isHex32(expected.memoDataHash))
      && (expected.destinationTag === undefined || isUint(expected.destinationTag, MAX_UINT32));
    if (!expectedShapeValid || !isHex32(proof.sourceId) || !isHex32(request.transactionId)
      || !isUint(proof.votingRound, MAX_UINT64) || proof.votingRound === 0n
      || !isUint(proof.lowestUsedTimestamp, MAX_UINT64)) return { ok: false, reason: "MALFORMED" };
    if (usedTransactions.has(request.transactionId.toLowerCase())) return { ok: false, reason: "REPLAY" };
    if (proof.sourceId.toLowerCase() !== expected.sourceId.toLowerCase()
      || request.transactionId.toLowerCase() !== expected.transactionId.toLowerCase()
      || !isAddress(request.proofOwner) || getAddress(request.proofOwner) !== getAddress(expected.proofOwner)) return { ok: false, reason: "REQUEST_MISMATCH" };
    if (!isUint(response.blockNumber, MAX_UINT64) || response.blockNumber < expected.minBlockNumber
      || response.blockTimestamp !== proof.lowestUsedTimestamp
      || !isFresh(response.blockTimestamp, expected.minTimestamp, expected.maxAgeSeconds, now)) return { ok: false, reason: "STALE" };
    const signedAmounts = [response.spentAmount, response.intendedSpentAmount, response.receivedAmount, response.intendedReceivedAmount];
    const memoMatches = expected.memoDataHash === undefined
      ? !response.hasMemoData && response.firstMemoData === "0x"
      : response.hasMemoData && HEX_BYTES.test(response.firstMemoData)
        && hexByteLength(response.firstMemoData) <= MAX_XRPL_MEMO_BYTES
        && keccak256(response.firstMemoData).toLowerCase() === expected.memoDataHash.toLowerCase();
    const destinationTagMatches = expected.destinationTag === undefined
      ? !response.hasDestinationTag && response.destinationTag === 0n
      : response.hasDestinationTag && response.destinationTag === expected.destinationTag;
    if (response.status !== 0 || typeof response.hasMemoData !== "boolean"
      || typeof response.hasDestinationTag !== "boolean" || response.sourceAddress !== expected.sourceAddress
      || !isHex32(response.sourceAddressHash) || response.sourceAddressHash.toLowerCase() !== expected.sourceAddressHash.toLowerCase()
      || !isHex32(response.receivingAddressHash) || response.receivingAddressHash.toLowerCase() !== expected.receivingAddressHash.toLowerCase()
      || !isHex32(response.intendedReceivingAddressHash)
      || response.intendedReceivingAddressHash.toLowerCase() !== expected.receivingAddressHash.toLowerCase()
      || signedAmounts.some((amount) => amount < MIN_INT256 || amount > MAX_INT256)
      || response.receivedAmount !== expected.receivedAmount || response.intendedReceivedAmount !== expected.receivedAmount
      || !memoMatches || !destinationTagMatches) return { ok: false, reason: "RESPONSE_MISMATCH" };
    const inputCommitment = xrpInputCommitment(proof);
    const verified = await verifyCryptographicProof(proof, verifier, usedProofCommitments);
    if (typeof verified !== "string") return verified;
    if (usedTransactions.has(request.transactionId.toLowerCase())) return { ok: false, reason: "REPLAY" };
    if (proof.finalized !== true || !isHex32(proof.attestationType)
      || proof.attestationType.toLowerCase() !== FDC_XRP_PAYMENT_V1.toLowerCase()
      || xrpInputCommitment(proof).toLowerCase() !== inputCommitment.toLowerCase()) return { ok: false, reason: "MALFORMED" };
    return { ok: true, inputCommitment, proofCommitment: verified };
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
}
