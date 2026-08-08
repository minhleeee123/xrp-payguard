import { describe, expect, it } from "vitest";
import { getAddress, type Hex } from "viem";
import {
  COSTON2_FDC_CHAIN_ID,
  FDC_RELAY_FINALITY_ABI,
  FDC_VERIFICATION_FINALITY_ABI,
  readCoston2FdcRoundFinality,
} from "../src/fdc-finality.js";

const verificationAddress = getAddress("0x00000000000000000000000000000000000000a1") as Hex;
const relayAddress = getAddress("0x00000000000000000000000000000000000000b2") as Hex;
const merkleRoot = `0x${"ab".repeat(32)}` as Hex;

describe("Coston2 FDC finality reader", () => {
  it("resolves protocol/relay metadata and returns a finalized round with its root", async () => {
    const calls: unknown[] = [];
    const finality = await readCoston2FdcRoundFinality({
      async readContract(args) {
        calls.push(args);
        if (args.abi === FDC_VERIFICATION_FINALITY_ABI && args.functionName === "fdcProtocolId") return 200n;
        if (args.abi === FDC_VERIFICATION_FINALITY_ABI && args.functionName === "relay") return relayAddress;
        if (args.abi === FDC_RELAY_FINALITY_ABI && args.functionName === "isFinalized") return true;
        if (args.abi === FDC_RELAY_FINALITY_ABI && args.functionName === "merkleRoots") return merkleRoot;
        throw new Error("unexpected call");
      },
    }, { verificationAddress, votingRoundId: 42n });
    expect(finality).toEqual({
      chainId: COSTON2_FDC_CHAIN_ID,
      verificationAddress,
      relayAddress,
      protocolId: 200n,
      votingRoundId: 42n,
      finalized: true,
      merkleRoot,
    });
    expect(calls).toHaveLength(4);
    expect(calls[0]).toMatchObject({ address: verificationAddress, abi: FDC_VERIFICATION_FINALITY_ABI, functionName: "fdcProtocolId" });
    expect(calls[1]).toMatchObject({ address: verificationAddress, abi: FDC_VERIFICATION_FINALITY_ABI, functionName: "relay" });
    expect(calls[2]).toMatchObject({ address: relayAddress, abi: FDC_RELAY_FINALITY_ABI, functionName: "isFinalized", args: [200n, 42n] });
    expect(calls[3]).toMatchObject({ address: relayAddress, abi: FDC_RELAY_FINALITY_ABI, functionName: "merkleRoots", args: [200n, 42n] });
  });

  it("returns a pending checkpoint without reading a root", async () => {
    let rootRead = false;
    const pending = await readCoston2FdcRoundFinality({
      async readContract(args) {
        if (args.functionName === "fdcProtocolId") return 200n;
        if (args.functionName === "relay") return relayAddress;
        if (args.functionName === "isFinalized") return false;
        rootRead = true;
        return merkleRoot;
      },
    }, { verificationAddress, votingRoundId: 42n });
    expect(pending).toMatchObject({ chainId: 114n, finalized: false, merkleRoot: null, votingRoundId: 42n });
    expect(rootRead).toBe(false);
  });

  it("fails closed for invalid input, RPC failure, zero protocol/root, and malformed finality", async () => {
    await expect(readCoston2FdcRoundFinality({ async readContract() { return 1n; } }, { verificationAddress: "not-an-address", votingRoundId: 1n }))
      .rejects.toMatchObject({ reason: "MALFORMED" });
    await expect(readCoston2FdcRoundFinality({ async readContract() { return 1n; } }, { verificationAddress, votingRoundId: 0n }))
      .rejects.toMatchObject({ reason: "INVALID_INPUT" });
    await expect(readCoston2FdcRoundFinality({ async readContract() { throw new Error("offline"); } }, { verificationAddress, votingRoundId: 1n }))
      .rejects.toMatchObject({ reason: "UNAVAILABLE" });
    await expect(readCoston2FdcRoundFinality({ async readContract(args) {
      if (args.functionName === "fdcProtocolId") return 0n;
      return relayAddress;
    } }, { verificationAddress, votingRoundId: 1n })).rejects.toMatchObject({ reason: "DRIFT" });
    await expect(readCoston2FdcRoundFinality({ async readContract(args) {
      if (args.functionName === "fdcProtocolId") return 200n;
      if (args.functionName === "relay") return relayAddress;
      if (args.functionName === "isFinalized") return true;
      return `0x${"00".repeat(32)}`;
    } }, { verificationAddress, votingRoundId: 1n })).rejects.toMatchObject({ reason: "DRIFT" });
    await expect(readCoston2FdcRoundFinality({ async readContract(args) {
      if (args.functionName === "fdcProtocolId") return 200n;
      if (args.functionName === "relay") return relayAddress;
      if (args.functionName === "isFinalized") return "true";
      return merkleRoot;
    } }, { verificationAddress, votingRoundId: 1n })).rejects.toMatchObject({ reason: "MALFORMED" });
  });
});
