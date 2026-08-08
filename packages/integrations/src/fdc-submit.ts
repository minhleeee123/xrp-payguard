import { encodeFunctionData, getAddress, isAddress, zeroAddress, type Hex } from "viem";

const MAX_REQUEST_BYTES = 65_536;
const MAX_UINT256 = (1n << 256n) - 1n;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;

export const COSTON2_FDC_SUBMISSION_CHAIN_ID = 114n;

export const FDC_HUB_REQUEST_ABI = [
  {
    type: "function",
    name: "fdcRequestFeeConfigurations",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "_fdcRequestFeeConfigurations", type: "address" }],
  },
  {
    type: "function",
    name: "requestAttestation",
    stateMutability: "payable",
    inputs: [{ name: "_data", type: "bytes" }],
    outputs: [],
  },
] as const;

export const FDC_REQUEST_FEE_ABI = [{
  type: "function",
  name: "getRequestFee",
  stateMutability: "view",
  inputs: [{ name: "_data", type: "bytes" }],
  outputs: [{ name: "_fee", type: "uint256" }],
}] as const;

export type FdcSubmissionFailure = "INVALID_INPUT" | "UNAVAILABLE" | "MALFORMED" | "DRIFT";

export class FdcSubmissionError extends Error {
  constructor(readonly reason: FdcSubmissionFailure, message: string) {
    super(message);
    this.name = "FdcSubmissionError";
  }
}

export interface FdcSubmissionReader {
  readContract(args: {
    address: Hex;
    abi: typeof FDC_HUB_REQUEST_ABI;
    functionName: "fdcRequestFeeConfigurations";
  } | {
    address: Hex;
    abi: typeof FDC_REQUEST_FEE_ABI;
    functionName: "getRequestFee";
    args: readonly [Hex];
  }): Promise<unknown>;
}

export interface Coston2FdcSubmissionIntentV1 {
  chainId: typeof COSTON2_FDC_SUBMISSION_CHAIN_ID;
  hubAddress: Hex;
  feeConfigurationAddress: Hex;
  requestBytes: Hex;
  feeWei: bigint;
  calldata: Hex;
}

function fail(reason: FdcSubmissionFailure, message: string): never {
  throw new FdcSubmissionError(reason, message);
}

function address(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) {
    fail("MALFORMED", `${label} is invalid`);
  }
  return getAddress(value) as Hex;
}

function requestBytes(value: unknown): Hex {
  if (typeof value !== "string" || !HEX_BYTES.test(value) || (value.length - 2) / 2 === 0 || (value.length - 2) / 2 > MAX_REQUEST_BYTES) {
    fail("INVALID_INPUT", "FDC request bytes are invalid or oversized");
  }
  return value.toLowerCase() as Hex;
}

function fee(value: unknown): bigint {
  let parsed: bigint;
  if (typeof value === "bigint") parsed = value;
  else if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) parsed = BigInt(value);
  else if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) parsed = BigInt(value);
  else fail("MALFORMED", "FDC request fee is invalid");
  if (parsed <= 0n || parsed > MAX_UINT256) fail("DRIFT", "FDC request fee is unsupported");
  return parsed;
}

async function read<T>(operation: () => Promise<T>, label: string): Promise<T> {
  try {
    return await operation();
  } catch {
    fail("UNAVAILABLE", `FDC ${label} read failed`);
  }
}

export async function prepareCoston2FdcSubmission(
  reader: FdcSubmissionReader,
  input: { hubAddress: string; requestBytes: Hex },
): Promise<Coston2FdcSubmissionIntentV1> {
  const hubAddress = address(input.hubAddress, "FDC Hub address");
  const normalizedRequestBytes = requestBytes(input.requestBytes);
  const feeConfigurationAddress = address(await read(() => reader.readContract({
    address: hubAddress,
    abi: FDC_HUB_REQUEST_ABI,
    functionName: "fdcRequestFeeConfigurations",
  }), "request fee configuration address"), "FDC request fee configuration address");
  const feeWei = fee(await read(() => reader.readContract({
    address: feeConfigurationAddress,
    abi: FDC_REQUEST_FEE_ABI,
    functionName: "getRequestFee",
    args: [normalizedRequestBytes],
  }), "request fee"));
  const calldata = encodeFunctionData({
    abi: FDC_HUB_REQUEST_ABI,
    functionName: "requestAttestation",
    args: [normalizedRequestBytes],
  }) as Hex;
  return {
    chainId: COSTON2_FDC_SUBMISSION_CHAIN_ID,
    hubAddress,
    feeConfigurationAddress,
    requestBytes: normalizedRequestBytes,
    feeWei,
    calldata,
  };
}
