import { getAddress, isAddress, zeroAddress, zeroHash, type Hex } from "viem";

const MAX_UINT8 = (1n << 8n) - 1n;
const MAX_UINT64 = (1n << 64n) - 1n;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;

export const COSTON2_FDC_CHAIN_ID = 114n;

export const FDC_VERIFICATION_FINALITY_ABI = [
  {
    type: "function",
    name: "fdcProtocolId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "_fdcProtocolId", type: "uint8" }],
  },
  {
    type: "function",
    name: "relay",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "_relay", type: "address" }],
  },
] as const;

export const FDC_RELAY_FINALITY_ABI = [
  {
    type: "function",
    name: "isFinalized",
    stateMutability: "view",
    inputs: [{ name: "_protocolId", type: "uint256" }, { name: "_votingRoundId", type: "uint256" }],
    outputs: [{ name: "_finalized", type: "bool" }],
  },
  {
    type: "function",
    name: "merkleRoots",
    stateMutability: "view",
    inputs: [{ name: "_protocolId", type: "uint256" }, { name: "_votingRoundId", type: "uint256" }],
    outputs: [{ name: "_merkleRoot", type: "bytes32" }],
  },
] as const;

export type FdcFinalityFailure = "INVALID_INPUT" | "UNAVAILABLE" | "MALFORMED" | "DRIFT";

export class FdcFinalityError extends Error {
  constructor(readonly reason: FdcFinalityFailure, message: string) {
    super(message);
    this.name = "FdcFinalityError";
  }
}

export interface FdcFinalityReader {
  readContract(args: {
    address: Hex;
    abi: typeof FDC_VERIFICATION_FINALITY_ABI;
    functionName: "fdcProtocolId" | "relay";
  } | {
    address: Hex;
    abi: typeof FDC_RELAY_FINALITY_ABI;
    functionName: "isFinalized" | "merkleRoots";
    args: readonly [bigint, bigint];
  }): Promise<unknown>;
}

export type Coston2FdcRoundFinality = {
  chainId: typeof COSTON2_FDC_CHAIN_ID;
  verificationAddress: Hex;
  relayAddress: Hex;
  protocolId: bigint;
  votingRoundId: bigint;
} & ({ finalized: false; merkleRoot: null } | { finalized: true; merkleRoot: Hex });

function fail(reason: FdcFinalityFailure, message: string): never {
  throw new FdcFinalityError(reason, message);
}

function address(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) {
    fail("MALFORMED", `${label} is invalid`);
  }
  return getAddress(value) as Hex;
}

function uint(value: unknown, max: bigint, label: string): bigint {
  let parsed: bigint;
  if (typeof value === "bigint") parsed = value;
  else if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) parsed = BigInt(value);
  else if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) parsed = BigInt(value);
  else fail("MALFORMED", `${label} is invalid`);
  if (parsed < 0n || parsed > max) fail("MALFORMED", `${label} is out of range`);
  return parsed;
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") fail("MALFORMED", `${label} is invalid`);
  return value;
}

function root(value: unknown): Hex {
  if (typeof value !== "string" || !HEX32.test(value) || value.toLowerCase() === zeroHash) {
    fail("DRIFT", "FDC finalized round has no non-zero Merkle root");
  }
  return value.toLowerCase() as Hex;
}

async function read<T>(operation: () => Promise<T>, label: string): Promise<T> {
  try {
    return await operation();
  } catch {
    fail("UNAVAILABLE", `FDC ${label} read failed`);
  }
}

export async function readCoston2FdcRoundFinality(
  reader: FdcFinalityReader,
  input: { verificationAddress: string; votingRoundId: bigint },
): Promise<Coston2FdcRoundFinality> {
  const verificationAddress = address(input.verificationAddress, "FDC verification address");
  if (typeof input.votingRoundId !== "bigint" || input.votingRoundId <= 0n || input.votingRoundId > MAX_UINT64) {
    fail("INVALID_INPUT", "FDC voting round is invalid");
  }
  const protocolId = uint(await read(() => reader.readContract({
    address: verificationAddress,
    abi: FDC_VERIFICATION_FINALITY_ABI,
    functionName: "fdcProtocolId",
  }), "protocol ID"), MAX_UINT8, "FDC protocol ID");
  if (protocolId === 0n) fail("DRIFT", "FDC protocol ID is zero");
  const relayAddress = address(await read(() => reader.readContract({
    address: verificationAddress,
    abi: FDC_VERIFICATION_FINALITY_ABI,
    functionName: "relay",
  }), "relay address"), "FDC relay address");
  const args = [protocolId, input.votingRoundId] as const;
  const finalized = bool(await read(() => reader.readContract({
    address: relayAddress,
    abi: FDC_RELAY_FINALITY_ABI,
    functionName: "isFinalized",
    args,
  }), "round finality"), "FDC round finality");
  if (!finalized) {
    return {
      chainId: COSTON2_FDC_CHAIN_ID,
      verificationAddress,
      relayAddress,
      protocolId,
      votingRoundId: input.votingRoundId,
      finalized: false,
      merkleRoot: null,
    };
  }
  const merkleRoot = root(await read(() => reader.readContract({
    address: relayAddress,
    abi: FDC_RELAY_FINALITY_ABI,
    functionName: "merkleRoots",
    args,
  }), "Merkle root"));
  return {
    chainId: COSTON2_FDC_CHAIN_ID,
    verificationAddress,
    relayAddress,
    protocolId,
    votingRoundId: input.votingRoundId,
    finalized: true,
    merkleRoot,
  };
}
