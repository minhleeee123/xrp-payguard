import { describe, expect, it } from "vitest";
import { getAddress, type Hex } from "viem";
import {
  COSTON2_FDC_ROUND_CHAIN_ID,
  FDC_RELAY_ROUND_ABI,
  deriveCoston2FdcVotingRound,
} from "../src/fdc-round.js";

const relayAddress = getAddress("0x00000000000000000000000000000000000000a1") as Hex;

describe("Coston2 FDC voting-round derivation", () => {
  it("uses the runtime Relay calculator with the mined block timestamp", async () => {
    const calls: unknown[] = [];
    const result = await deriveCoston2FdcVotingRound({
      async readContract(args) {
        calls.push(args);
        expect(args.address).toBe(relayAddress);
        expect(args.abi).toBe(FDC_RELAY_ROUND_ABI);
        expect(args.functionName).toBe("getVotingRoundId");
        expect(args.args).toEqual([1_700_000_000n]);
        return 42n;
      },
    }, { relayAddress: relayAddress.toLowerCase(), blockTimestamp: 1_700_000_000n });
    expect(result).toEqual({
      chainId: COSTON2_FDC_ROUND_CHAIN_ID,
      relayAddress,
      blockTimestamp: 1_700_000_000n,
      votingRoundId: 42n,
    });
    expect(calls).toHaveLength(1);
  });

  it("fails closed for bad inputs, unavailable RPC, and unusable round output", async () => {
    await expect(deriveCoston2FdcVotingRound({ async readContract() { return 1n; } }, {
      relayAddress: "not-an-address", blockTimestamp: 1n,
    })).rejects.toMatchObject({ reason: "INVALID_INPUT" });
    await expect(deriveCoston2FdcVotingRound({ async readContract() { return 1n; } }, {
      relayAddress, blockTimestamp: 0n,
    })).rejects.toMatchObject({ reason: "INVALID_INPUT" });
    await expect(deriveCoston2FdcVotingRound({ async readContract() { throw new Error("offline"); } }, {
      relayAddress, blockTimestamp: 1n,
    })).rejects.toMatchObject({ reason: "UNAVAILABLE" });
    await expect(deriveCoston2FdcVotingRound({ async readContract() { return "0"; } }, {
      relayAddress, blockTimestamp: 1n,
    })).rejects.toMatchObject({ reason: "DRIFT" });
    await expect(deriveCoston2FdcVotingRound({ async readContract() { return "not-a-number"; } }, {
      relayAddress, blockTimestamp: 1n,
    })).rejects.toMatchObject({ reason: "MALFORMED" });
  });
});
