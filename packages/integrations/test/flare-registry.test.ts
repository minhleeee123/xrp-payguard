import { describe, expect, it } from "vitest";
import { getAddress, type Hex } from "viem";
import {
  DEFAULT_COSTON2_DEPENDENCIES,
  FLARE_CONTRACT_REGISTRY_ABI,
  FLARE_CONTRACT_REGISTRY_ADDRESS,
  FlareRegistryError,
  resolveCoston2Dependencies,
} from "../src/flare-registry.js";

const address = (value: number): Hex => getAddress(`0x${value.toString(16).padStart(40, "0")}`) as Hex;

describe("official Coston2 registry resolution", () => {
  it("reads every dependency dynamically from the canonical registry", async () => {
    const calls: string[] = [];
    const resolution = await resolveCoston2Dependencies({
      async readContract(args) {
        expect(args.address).toBe(FLARE_CONTRACT_REGISTRY_ADDRESS);
        expect(args.abi).toBe(FLARE_CONTRACT_REGISTRY_ABI);
        expect(args.functionName).toBe("getContractAddressByName");
        const name = args.args[0]!;
        calls.push(name);
        return address(calls.length);
      },
    });
    expect(resolution.chainId).toBe(114n);
    expect(calls).toEqual([...DEFAULT_COSTON2_DEPENDENCIES]);
    expect(Object.keys(resolution.addresses)).toHaveLength(DEFAULT_COSTON2_DEPENDENCIES.length);
    expect(resolution.addresses.FdcHub).toBe(address(1));
  });

  it("fails closed for RPC errors, zero/invalid registry responses, and duplicate requests", async () => {
    await expect(resolveCoston2Dependencies({ async readContract() { throw new Error("offline"); } }, ["FdcHub"]))
      .rejects.toMatchObject({ reason: "RPC_UNAVAILABLE", dependency: "FdcHub" });
    await expect(resolveCoston2Dependencies({ async readContract() { return address(0); } }, ["FdcHub"]))
      .rejects.toMatchObject({ reason: "DEPENDENCY_INVALID", dependency: "FdcHub" });
    await expect(resolveCoston2Dependencies({ async readContract() { return "not-an-address"; } }, ["FdcHub"]))
      .rejects.toMatchObject({ reason: "DEPENDENCY_INVALID" });
    await expect(resolveCoston2Dependencies({ async readContract() { return address(1); } }, ["FdcHub", "FdcHub"]))
      .rejects.toMatchObject({ reason: "REGISTRY_INVALID" });
  });
});
