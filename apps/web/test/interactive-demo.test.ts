import { describe, expect, it } from "vitest";
import type { DemoEvaluationEnvelope } from "@xrp-payguard/demo";
import { selectDemoThreshold } from "../src/interactive-demo.js";

const hex32 = (digit: string): `0x${string}` => `0x${digit.repeat(64)}`;

function envelope(actor: 1 | 2 | 3, machineDigit: string, digestDigit: string): DemoEvaluationEnvelope {
  return {
    mode: "SIMULATED_FCC_COSTON2_TESTNET_V1",
    actor,
    result: { machineId: hex32(machineDigit) } as DemoEvaluationEnvelope["result"],
    digest: hex32(digestDigit),
    signer: `0x${String(actor).repeat(40)}`,
    signature: `0x${"1".repeat(130)}`,
    assertions: {
      hardwareTeeVerified: false,
      registeredProductionMachinesVerified: false,
      independentOperatorsVerified: false,
      sealedPersistenceVerified: false,
      productionFccReleaseVerified: false,
    },
  };
}

describe("interactive demo threshold selection", () => {
  it("requires two distinct machines with the same actor-computed digest", () => {
    const outcome = selectDemoThreshold([
      envelope(1, "1", "a"),
      envelope(2, "2", "a"),
      envelope(3, "3", "b"),
    ]);
    expect(outcome.status).toBe("THRESHOLD_READY");
    expect(outcome.matching.map((item) => item.actor)).toEqual([1, 2]);
    expect(outcome.digest).toBe(hex32("a"));
  });

  it("does not count duplicate responses from one machine", () => {
    const outcome = selectDemoThreshold([
      envelope(1, "1", "a"),
      envelope(1, "1", "a"),
    ]);
    expect(outcome.status).toBe("UNAVAILABLE");
    expect(outcome.valid).toHaveLength(1);
  });

  it("fails closed when distinct actors split on the result digest", () => {
    const outcome = selectDemoThreshold([
      envelope(1, "1", "a"),
      envelope(2, "2", "b"),
      envelope(3, "3", "c"),
    ]);
    expect(outcome.status).toBe("SPLIT");
    expect(outcome.matching).toEqual([]);
  });
});
