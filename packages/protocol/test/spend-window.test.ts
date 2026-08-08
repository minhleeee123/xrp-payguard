import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { spendWindowTotalsV1 } from "../src/spend-window.js";

interface SpendWindowVector {
  name: string;
  now: string;
  window: string;
  entryCount: number;
  entries: { value: string; executedAt: string }[];
  daily: string;
  rolling: string;
  valid: boolean;
}

const fixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../fixtures/spend-window-v1.json"), "utf8"),
) as { schema: string; calendarBoundary: string; rollingBoundary: string; caseCount: number; cases: SpendWindowVector[] };

describe("SPEND_WINDOW_V1 shared vectors", () => {
  it("sums exact UTC calendar and sliding windows", () => {
    expect(fixture.schema).toBe("SPEND_WINDOW_V1");
    expect(fixture.calendarBoundary).toBe("[dayStart, now]");
    expect(fixture.rollingBoundary).toBe("(now-window, now]");
    expect(fixture.caseCount).toBe(fixture.cases.length);
    for (const vector of fixture.cases) {
      expect(vector.entryCount, vector.name).toBe(vector.entries.length);
      const actual = spendWindowTotalsV1(
        vector.entries.map((entry) => ({ value: BigInt(entry.value), executedAt: BigInt(entry.executedAt) })),
        BigInt(vector.now),
        BigInt(vector.window),
      );
      expect(actual, vector.name).toEqual(vector.valid
        ? { dailySpend: BigInt(vector.daily), rollingSpend: BigInt(vector.rolling) }
        : null);
    }
  });

  it("rejects invalid wire timestamps and window", () => {
    expect(spendWindowTotalsV1([], -1n, 1n)).toBeNull();
    expect(spendWindowTotalsV1([], 1n, 0n)).toBeNull();
    expect(spendWindowTotalsV1([{ value: -1n, executedAt: 1n }], 1n, 1n)).toBeNull();
  });

  it("caps private history work", () => {
    const oversized = Array.from({ length: 4_097 }, () => ({ value: 1n, executedAt: 0n }));
    expect(spendWindowTotalsV1(oversized, 0n, 1n)).toBeNull();
  });
});
