import { describe, expect, it } from "vitest";
import { getAddress, type Hex } from "viem";
import {
  COSTON2_FDC_SUBMISSION_CHAIN_ID,
  FDC_HUB_REQUEST_ABI,
  FDC_REQUEST_FEE_ABI,
  prepareCoston2FdcSubmission,
} from "../src/fdc-submit.js";

const hubAddress = getAddress("0x00000000000000000000000000000000000000a1") as Hex;
const feeConfigurationAddress = getAddress("0x00000000000000000000000000000000000000b2") as Hex;
const requestBytes = `0x${"ab".repeat(160)}` as Hex;

describe("Coston2 FDC submission intent", () => {
  it("resolves the live fee configuration and builds exact payable calldata", async () => {
    const calls: unknown[] = [];
    const intent = await prepareCoston2FdcSubmission({
      async readContract(args) {
        calls.push(args);
        if (args.abi === FDC_HUB_REQUEST_ABI) return feeConfigurationAddress;
        if (args.functionName === "getRequestFee") {
          expect(args.args).toEqual([requestBytes]);
          return 1_000_000_000_000_000n;
        }
        throw new Error("unexpected call");
      },
    }, { hubAddress, requestBytes });
    expect(intent).toMatchObject({
      chainId: COSTON2_FDC_SUBMISSION_CHAIN_ID,
      hubAddress,
      feeConfigurationAddress,
      requestBytes,
      feeWei: 1_000_000_000_000_000n,
    });
    expect(intent.calldata).toMatch(/^0x[0-9a-f]+$/);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ address: hubAddress, functionName: "fdcRequestFeeConfigurations" });
    expect(calls[1]).toMatchObject({ address: feeConfigurationAddress, functionName: "getRequestFee" });
  });

  it("normalizes public inputs and fails closed for invalid/unsupported reads", async () => {
    const intent = await prepareCoston2FdcSubmission({
      async readContract(args) {
        if (args.functionName === "fdcRequestFeeConfigurations") return feeConfigurationAddress.toLowerCase();
        return "100";
      },
    }, { hubAddress: hubAddress.toLowerCase(), requestBytes: `0x${requestBytes.slice(2).toUpperCase()}` as Hex });
    expect(intent.hubAddress).toBe(hubAddress);
    expect(intent.requestBytes).toBe(requestBytes);
    expect(intent.feeWei).toBe(100n);
    await expect(prepareCoston2FdcSubmission({ async readContract() { return feeConfigurationAddress; } }, { hubAddress: "not-an-address", requestBytes }))
      .rejects.toMatchObject({ reason: "MALFORMED" });
    await expect(prepareCoston2FdcSubmission({ async readContract() { return feeConfigurationAddress; } }, { hubAddress, requestBytes: "0x" as Hex }))
      .rejects.toMatchObject({ reason: "INVALID_INPUT" });
    await expect(prepareCoston2FdcSubmission({ async readContract() { return feeConfigurationAddress; } }, { hubAddress, requestBytes: `0x${"aa".repeat(65_537)}` as Hex }))
      .rejects.toMatchObject({ reason: "INVALID_INPUT" });
    await expect(prepareCoston2FdcSubmission({ async readContract() { throw new Error("offline"); } }, { hubAddress, requestBytes }))
      .rejects.toMatchObject({ reason: "UNAVAILABLE" });
    await expect(prepareCoston2FdcSubmission({ async readContract(args) {
      if (args.functionName === "fdcRequestFeeConfigurations") return feeConfigurationAddress;
      return 0n;
    } }, { hubAddress, requestBytes })).rejects.toMatchObject({ reason: "DRIFT" });
    await expect(prepareCoston2FdcSubmission({ async readContract(args) {
      if (args.functionName === "fdcRequestFeeConfigurations") return "not-an-address";
      return 100n;
    } }, { hubAddress, requestBytes })).rejects.toMatchObject({ reason: "MALFORMED" });
  });
});
