import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { liveEvaluationAuthorizationDigest, parseExecutedRequestIds } from "../src/live-runtime.js";

const hash = (byte: string) => `0x${byte.repeat(64 / byte.length)}` as Hex;
const address = (byte: string) => `0x${byte.repeat(40 / byte.length)}` as Address;

describe("live FCC relay authorization domain", () => {
  it("matches the browser request-specific authorization fixture", () => {
    expect(liveEvaluationAuthorizationDigest({
      requestId: hash("11"),
      owner: address("22"),
      issuedAt: 100n,
      expiry: 200n,
    })).toBe("0x62eccde019645aa462f1b237ddd1a59a7cf856fe36721fa0728fd8004160033d");
  });
});

describe("executed history discovery", () => {
  const topic0 = "0x4d3c486e056cfb79101ca2f7e2e656f03944aae15d67bc0c48d8904b502df6d3";
  const router = "0x28A969018975Fb40aEd0BfA98f6d1c3023B6a7Da";
  const item = {
    address: router,
    blockNumber: "0x20582f9",
    transactionHash: hash("33"),
    topics: [topic0, hash("44"), `0x${"00".repeat(12)}${"55".repeat(20)}`],
  };

  it("accepts explorer discovery only for the exact router event domain", () => {
    expect(parseExecutedRequestIds({ status: "1", message: "OK", result: [item] })).toEqual([hash("44")]);
  });

  it("fails closed on duplicate or foreign log discovery", () => {
    expect(() => parseExecutedRequestIds({ status: "1", message: "OK", result: [item, item] })).toThrow(/duplicate/);
    expect(() => parseExecutedRequestIds({ status: "1", message: "OK", result: [{ ...item, address: address("66") }] })).toThrow(/router domain/);
  });
});
