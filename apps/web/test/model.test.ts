import { describe, expect, it } from "vitest";
import { buildInMemoryPolicy, buildPublicPreview, normalizeStudioAddress } from "../src/model.js";

const input = {
  policyId: "subscription-01",
  owner: "0x00000000000000000000000000000000000000a1" as `0x${string}`,
  target: "0x00000000000000000000000000000000000000c3" as `0x${string}`,
  maxPerAction: 75n,
  dailyCap: 500n,
  startAt: 1_000n,
  endAt: 10_000n,
};

describe("Policy Studio boundary", () => {
  it("computes a deterministic commitment without exposing private fields", () => {
    const first = buildPublicPreview(input);
    const second = buildPublicPreview(input);
    expect(first.commitment).toBe(second.commitment);
    expect(first.chain).toContain("planned");
    expect(first.visible).toContain("policy commitment");
    expect(first.privateBoundary.join(" ")).toContain("private salt");
    expect(JSON.stringify(first)).not.toContain("in-memory:");
    expect(JSON.stringify(first)).not.toContain("submission:");
  });

  it("does not let malformed owner/target values become policy input", () => {
    expect(() => normalizeStudioAddress("not-an-address")).toThrow();
    expect(() => buildPublicPreview({ ...input, maxPerAction: -1n })).toThrow();
  });
});
