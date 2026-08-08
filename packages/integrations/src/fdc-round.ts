import { getAddress, isAddress, zeroAddress, type Hex } from "viem";

export const COSTON2_FDC_ROUND_CHAIN_ID = 114n;
const MAX_UINT64 = (1n << 64n) - 1n;

/** Runtime Relay calculator for assigning a mined FDC request to a round. */
export const FDC_RELAY_ROUND_ABI = [{
  type: "function",
  name: "getVotingRoundId",
  stateMutability: "view",
  inputs: [{ name: "_timestamp", type: "uint256" }],
  outputs: [{ name: "_votingRoundId", type: "uint256" }],
}] as const;

export type FdcRoundFailure = "INVALID_INPUT" | "UNAVAILABLE" | "MALFORMED" | "DRIFT";

export class FdcRoundError extends Error {
  constructor(readonly reason: FdcRoundFailure, message: string) {
    super(message);
    this.name = "FdcRoundError";
  }
}

export interface FdcRoundReader {
  readContract(args: {
    address: Hex;
    abi: typeof FDC_RELAY_ROUND_ABI;
    functionName: "getVotingRoundId";
    args: readonly [bigint];
  }): Promise<unknown>;
}

export interface Coston2FdcVotingRound {
  chainId: typeof COSTON2_FDC_ROUND_CHAIN_ID;
  relayAddress: Hex;
  blockTimestamp: bigint;
  votingRoundId: bigint;
}

function fail(reason: FdcRoundFailure, message: string): never {
  throw new FdcRoundError(reason, message);
}

function normalizeAddress(value: unknown): Hex {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) {
    fail("INVALID_INPUT", "FDC Relay address is invalid");
  }
  return getAddress(value) as Hex;
}

function normalizeTimestamp(value: unknown): bigint {
  if (typeof value !== "bigint" || value <= 0n || value > MAX_UINT64) {
    fail("INVALID_INPUT", "FDC request block timestamp is invalid");
  }
  return value;
}

function normalizeRound(value: unknown): bigint {
  let round: bigint;
  if (typeof value === "bigint") round = value;
  else if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) round = BigInt(value);
  else if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) round = BigInt(value);
  else fail("MALFORMED", "FDC voting round is malformed");
  if (round <= 0n || round > MAX_UINT64) fail("DRIFT", "FDC Relay returned an unsupported voting round");
  return round;
}

/**
 * Derive the FDC round from the timestamp of the mined request block using
 * the runtime Relay contract. A wall-clock timestamp is not interchangeable.
 */
export async function deriveCoston2FdcVotingRound(
  reader: FdcRoundReader,
  input: { relayAddress: string; blockTimestamp: bigint },
): Promise<Coston2FdcVotingRound> {
  const relayAddress = normalizeAddress(input.relayAddress);
  const blockTimestamp = normalizeTimestamp(input.blockTimestamp);
  let value: unknown;
  try {
    value = await reader.readContract({
      address: relayAddress,
      abi: FDC_RELAY_ROUND_ABI,
      functionName: "getVotingRoundId",
      args: [blockTimestamp],
    });
  } catch {
    fail("UNAVAILABLE", "FDC Relay voting-round read failed");
  }
  return {
    chainId: COSTON2_FDC_ROUND_CHAIN_ID,
    relayAddress,
    blockTimestamp,
    votingRoundId: normalizeRound(value),
  };
}
