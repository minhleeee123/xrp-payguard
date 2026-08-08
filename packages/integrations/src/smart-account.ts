import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  numberToHex,
  zeroAddress,
  zeroHash,
  type Hex,
} from "viem";
import { isValidClassicAddress } from "xrpl";

const MAX_UINT64 = (1n << 64n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_CALLS = 64;
const MAX_CALL_DATA_BYTES = 131_072;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;

export const SMART_ACCOUNT_CUSTOM_INSTRUCTION_OPCODE = "0xfe" as Hex;

export const MASTER_ACCOUNT_CONTROLLER_ABI = [
  {
    type: "function",
    name: "getPersonalAccount",
    stateMutability: "view",
    inputs: [{ name: "_xrplOwner", type: "string" }],
    outputs: [{ name: "personalAccount", type: "address" }],
  },
  {
    type: "function",
    name: "getNonce",
    stateMutability: "view",
    inputs: [{ name: "_personalAccount", type: "address" }],
    outputs: [{ name: "nonce", type: "uint256" }],
  },
] as const;

const PERSONAL_ACCOUNT_EXECUTE_ABI = [{
  type: "function",
  name: "executeUserOp",
  stateMutability: "nonpayable",
  inputs: [{
    name: "_calls",
    type: "tuple[]",
    components: [
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
  }],
  outputs: [],
}] as const;

const PACKED_USER_OPERATION_TYPES = [
  { type: "address" },
  { type: "uint256" },
  { type: "bytes" },
  { type: "bytes" },
  { type: "bytes32" },
  { type: "uint256" },
  { type: "bytes32" },
  { type: "bytes" },
  { type: "bytes" },
] as const;

export interface SmartAccountReader {
  readContract(args: {
    address: Hex;
    abi: typeof MASTER_ACCOUNT_CONTROLLER_ABI;
    functionName: "getPersonalAccount" | "getNonce";
    args: readonly [string] | readonly [Hex];
  }): Promise<unknown>;
}

export interface SmartAccountCall {
  target: string;
  value: bigint;
  data: Hex;
}

export interface HashInstructionInput {
  calls: readonly SmartAccountCall[];
  sender: string;
  nonce: bigint;
  walletId: number;
  executorFeeUBA: bigint;
}

export interface HashInstructionEncoding {
  memoData: Hex;
  userOperationData: Hex;
  userOperationHash: Hex;
  totalCallValue: bigint;
  nonce: bigint;
}

function assertUint(value: bigint, max: bigint, label: string): void {
  if (value < 0n || value > max) throw new Error(`${label} is out of range`);
}

function normalizeAddress(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) {
    throw new Error(`${label} must be a non-zero EVM address`);
  }
  return getAddress(value) as Hex;
}

function normalizeXrplOwner(value: unknown): string {
  if (typeof value !== "string" || !isValidClassicAddress(value)) {
    throw new Error("XRPL owner must be a valid classic r-address");
  }
  return value;
}

function validateCall(call: SmartAccountCall): void {
  normalizeAddress(call.target, "call target");
  assertUint(call.value, MAX_UINT256, "call value");
  if (typeof call.data !== "string" || !HEX_BYTES.test(call.data)
    || (call.data.length - 2) / 2 > MAX_CALL_DATA_BYTES) throw new Error("call data is malformed or oversized");
}

function sumCallValues(calls: readonly SmartAccountCall[]): bigint {
  return calls.reduce((sum, call) => {
    assertUint(sum + call.value, MAX_UINT256, "total call value");
    return sum + call.value;
  }, 0n);
}

export function encodePackedUserOperationData(input: Pick<HashInstructionInput, "calls" | "sender" | "nonce">): Hex {
  const sender = normalizeAddress(input.sender, "user operation sender");
  assertUint(input.nonce, MAX_UINT256, "user operation nonce");
  if (!Array.isArray(input.calls) || input.calls.length === 0 || input.calls.length > MAX_CALLS) {
    throw new Error("user operation call count is invalid");
  }
  input.calls.forEach(validateCall);
  sumCallValues(input.calls);
  const callData = encodeFunctionData({
    abi: PERSONAL_ACCOUNT_EXECUTE_ABI,
    functionName: "executeUserOp",
    args: [input.calls.map((call) => ({ target: normalizeAddress(call.target, "call target"), value: call.value, data: call.data }))],
  });
  return encodeAbiParameters(PACKED_USER_OPERATION_TYPES, [
    sender,
    input.nonce,
    "0x",
    callData,
    zeroHash,
    0n,
    zeroHash,
    "0x",
    "0x",
  ]) as Hex;
}

export function encodeHashInstructionMemo(input: HashInstructionInput): HashInstructionEncoding {
  normalizeAddress(input.sender, "user operation sender");
  if (!Number.isInteger(input.walletId) || input.walletId < 0 || input.walletId > 0xff) {
    throw new Error("wallet ID is out of range");
  }
  assertUint(input.executorFeeUBA, MAX_UINT64, "executor fee");
  const userOperationData = encodePackedUserOperationData(input);
  const userOperationHash = keccak256(userOperationData);
  const memoData = concatHex([
    SMART_ACCOUNT_CUSTOM_INSTRUCTION_OPCODE,
    numberToHex(input.walletId, { size: 1 }),
    numberToHex(input.executorFeeUBA, { size: 8 }),
    userOperationHash,
  ]);
  const totalCallValue = sumCallValues(input.calls);
  if (memoData.length !== 2 + 42 * 2) throw new Error("custom instruction memo length is invalid");
  return { memoData, userOperationData, userOperationHash, totalCallValue, nonce: input.nonce };
}

export async function resolvePersonalAccount(
  reader: SmartAccountReader,
  masterAccountController: string,
  xrplOwner: string,
): Promise<Hex> {
  const controller = normalizeAddress(masterAccountController, "MasterAccountController");
  const owner = normalizeXrplOwner(xrplOwner);
  let value: unknown;
  try {
    value = await reader.readContract({
      address: controller,
      abi: MASTER_ACCOUNT_CONTROLLER_ABI,
      functionName: "getPersonalAccount",
      args: [owner],
    });
  } catch {
    throw new Error("PersonalAccount lookup unavailable");
  }
  return normalizeAddress(value, "PersonalAccount");
}

export async function readPersonalAccountNonce(
  reader: SmartAccountReader,
  masterAccountController: string,
  personalAccount: string,
): Promise<bigint> {
  const controller = normalizeAddress(masterAccountController, "MasterAccountController");
  const account = normalizeAddress(personalAccount, "PersonalAccount");
  let value: unknown;
  try {
    value = await reader.readContract({
      address: controller,
      abi: MASTER_ACCOUNT_CONTROLLER_ABI,
      functionName: "getNonce",
      args: [account],
    });
  } catch {
    throw new Error("PersonalAccount nonce lookup unavailable");
  }
  if (typeof value !== "bigint") throw new Error("PersonalAccount nonce is malformed");
  assertUint(value, MAX_UINT256, "PersonalAccount nonce");
  return value;
}
