import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scheduleWindowV1 } from "../src/schedule.js";

interface ScheduleVector {
  name: string;
  startAt: string;
  interval: string;
  grace: string;
  occurrence: string;
  slot: string;
  deadline: string;
  valid: boolean;
}

const fixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../fixtures/schedule-v1.json"), "utf8"),
) as { schema: string; boundary: string; caseCount: number; cases: ScheduleVector[] };

describe("SCHEDULE_WINDOW_V1 shared vectors", () => {
  it("uses inclusive UTC windows and checked wire widths", () => {
    expect(fixture.schema).toBe("SCHEDULE_WINDOW_V1");
    expect(fixture.boundary).toBe("INCLUSIVE");
    expect(fixture.caseCount).toBe(fixture.cases.length);
    for (const vector of fixture.cases) {
      const actual = scheduleWindowV1(
        BigInt(vector.startAt),
        BigInt(vector.interval),
        BigInt(vector.grace),
        BigInt(vector.occurrence),
      );
      expect(actual, vector.name).toEqual(vector.valid
        ? { slot: BigInt(vector.slot), deadline: BigInt(vector.deadline) }
        : null);
    }
  });

  it("rejects signed values outside the wire domain", () => {
    expect(scheduleWindowV1(-1n, 10n, 1n, 1n)).toBeNull();
    expect(scheduleWindowV1(0n, -10n, 1n, 1n)).toBeNull();
    expect(scheduleWindowV1(0n, 10n, -1n, 1n)).toBeNull();
    expect(scheduleWindowV1(0n, 10n, 1n, -1n)).toBeNull();
  });
});
