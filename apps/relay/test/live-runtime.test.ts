import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { liveEvaluationAuthorizationDigest } from "../src/live-runtime.js";

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
