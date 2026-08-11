import { describe, expect, it } from "vitest";
import { APP_VIEWS, appViewHash, durationHint, parseAppRoute, requestStateLabels, unixTimeHint } from "../src/ui-state.js";

describe("desktop application presentation state", () => {
  it("provides refresh-safe hashes for every application view", () => {
    for (const view of APP_VIEWS) expect(parseAppRoute(appViewHash(view))).toEqual({ surface: "app", view });
    expect(parseAppRoute("")).toEqual({ surface: "app", view: "overview" });
    expect(parseAppRoute("#app/unknown")).toEqual({ surface: "app", view: "overview" });
  });

  it("keeps landing section anchors on the landing surface", () => {
    for (const anchor of ["landing", "why", "guardians", "journey", "use-cases", "evidence", "limits"]) {
      expect(parseAppRoute(`#${anchor}`)).toEqual({ surface: "landing", anchor });
    }
  });

  it("separates canonical request status from time-derived readiness", () => {
    expect(requestStateLabels("PENDING", "EXPIRED")).toEqual({
      canonical: "PENDING",
      timing: "EXPIRED",
      needsExpiryFinalization: true,
    });
    expect(requestStateLabels("EXPIRED", "EXPIRED").needsExpiryFinalization).toBe(false);
  });

  it("formats protocol timestamps and durations without changing their exact values", () => {
    expect(unixTimeHint("1800000000")).toBe("2027-01-15 08:00:00 UTC");
    expect(unixTimeHint("not-a-time")).toBeNull();
    expect(durationHint("604800")).toBe("7 days");
    expect(durationHint("86400")).toBe("1 day");
    expect(durationHint("0")).toBe("ad-hoc / disabled");
  });
});
