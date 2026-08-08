import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { publicReasonCode } from "../src/codec.js";
import { composePolicyDecisionV1 } from "../src/evaluator.js";

interface CompositionVector {
  name: string;
  violations: string;
  decision: 0 | 1;
  reason: number;
}

const fixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../fixtures/composition-v1.json"), "utf8"),
) as { schema: string; caseCount: number; cases: CompositionVector[] };

describe("POLICY_COMPOSITION_V1 shared vectors", () => {
  it("applies the fixed fail-closed reason priority", () => {
    expect(fixture.schema).toBe("POLICY_COMPOSITION_V1");
    expect(fixture.caseCount).toBe(fixture.cases.length);
    for (const vector of fixture.cases) {
      const actual = composePolicyDecisionV1(BigInt(vector.violations));
      expect(actual.decision, vector.name).toBe(vector.decision === 1 ? "ALLOW" : "DENY");
      expect(publicReasonCode(actual.publicReasonClass), vector.name).toBe(vector.reason);
    }
  });

  it("rejects a signed mask outside the wire domain", () => {
    expect(composePolicyDecisionV1(-1n)).toEqual({ decision: "DENY", publicReasonClass: "MALFORMED" });
  });
});
