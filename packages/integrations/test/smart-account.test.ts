import { describe, expect, it } from "vitest";
import { keccak256, padHex, stringToHex, zeroHash, type Hex } from "viem";
import {
  encodeHashInstructionMemo,
  encodePackedUserOperationData,
  readPersonalAccountNonce,
  resolvePersonalAccount,
} from "../src/smart-account.js";

const id = (value: string): Hex => padHex(stringToHex(value), { size: 32 });
const controller = "0x00000000000000000000000000000000000000c1";
const sender = "0x00000000000000000000000000000000000000a1";
const target = "0x00000000000000000000000000000000000000b1";
const owner = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";

describe("Smart Account 0xFE public codec", () => {
  it("encodes a deterministic PackedUserOperation and 42-byte hash memo", () => {
    const input = { calls: [{ target, value: 7n, data: "0x12345678" as Hex }], sender, nonce: 3n, walletId: 0, executorFeeUBA: 11n };
    const first = encodeHashInstructionMemo(input);
    const second = encodeHashInstructionMemo(input);
    expect(first).toEqual(second);
    expect(first.userOperationData).toMatch(/^0x[0-9a-f]+$/);
    expect(first.userOperationHash).toBe(keccak256(first.userOperationData));
    expect(first.memoData).toMatch(/^0xfe00[0-9a-f]{16}[0-9a-f]{64}$/);
    expect(first.memoData.length).toBe(86);
    expect(first.totalCallValue).toBe(7n);
    expect(first.nonce).toBe(3n);
    expect(encodePackedUserOperationData(input)).toBe(first.userOperationData);
  });

  it("rejects malformed calls, fee/wallet overflow, and unsupported sender shapes", () => {
    const input = { calls: [{ target, value: 7n, data: "0x12345678" as Hex }], sender, nonce: 3n, walletId: 0, executorFeeUBA: 11n };
    const call = input.calls[0]!;
    expect(() => encodePackedUserOperationData({ ...input, sender: owner })).toThrow(/EVM address/);
    expect(() => encodePackedUserOperationData({ ...input, calls: [] })).toThrow(/call count/);
    expect(() => encodePackedUserOperationData({ ...input, calls: [{ ...call, data: "0x1" as Hex }] })).toThrow(/malformed/);
    expect(() => encodeHashInstructionMemo({ ...input, walletId: 256 })).toThrow(/wallet ID/);
    expect(() => encodeHashInstructionMemo({ ...input, executorFeeUBA: 1n << 64n })).toThrow(/executor fee/);
    expect(() => encodeHashInstructionMemo({ ...input, calls: [{ ...call, value: -1n }] })).toThrow(/range/);
  });

  it("resolves a deterministic personal account and reads only a bounded nonce", async () => {
    const calls: string[] = [];
    const reader = {
      async readContract(args: { functionName: string }): Promise<unknown> {
        calls.push(args.functionName);
        return args.functionName === "getPersonalAccount" ? "0x00000000000000000000000000000000000000d1" : 9n;
      },
    };
    const personalAccount = await resolvePersonalAccount(reader, controller, owner);
    expect(personalAccount).toBe("0x00000000000000000000000000000000000000D1");
    expect(await readPersonalAccountNonce(reader, controller, personalAccount)).toBe(9n);
    expect(calls).toEqual(["getPersonalAccount", "getNonce"]);
    await expect(resolvePersonalAccount(reader, controller, "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTj")).rejects.toThrow(/classic/);
    await expect(readPersonalAccountNonce({ readContract: async () => zeroHash }, controller, personalAccount)).rejects.toThrow(/malformed/);
  });
});
