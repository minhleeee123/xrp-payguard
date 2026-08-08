import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { referenceValueV1 } from "../src/evaluator.js";

interface MathVector {
  name: string;
  amount: string;
  price: string;
  decimals: number;
  expected: string;
  valid: boolean;
}

const fixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../fixtures/math-v1.json"), "utf8"),
) as { schema: string; rounding: string; caseCount: number; cases: MathVector[] };

describe("REFERENCE_VALUE_V1 shared vectors", () => {
  it("uses checked uint256 multiplication and ceiling rounding", () => {
    expect(fixture.schema).toBe("REFERENCE_VALUE_V1");
    expect(fixture.rounding).toBe("CEILING");
    expect(fixture.caseCount).toBe(fixture.cases.length);
    for (const vector of fixture.cases) {
      const actual = referenceValueV1(BigInt(vector.amount), BigInt(vector.price), vector.decimals);
      expect(actual, vector.name).toBe(vector.valid ? BigInt(vector.expected) : null);
    }
  });

  it("rejects non-integer and signed inputs outside the wire domain", () => {
    expect(referenceValueV1(-1n, 1n, 0)).toBeNull();
    expect(referenceValueV1(1n, -1n, 0)).toBeNull();
    expect(referenceValueV1(1n, 1n, 1.5)).toBeNull();
    expect(referenceValueV1(1n << 256n, 1n, 0)).toBeNull();
  });
});
