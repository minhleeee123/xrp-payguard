import { describe, expect, it, vi } from "vitest";
import { PRODUCTION_MONITOR_ORIGIN, decodeProductionHealth, fetchProductionHealth } from "../src/production-health.js";

const health = {
  status: "ready", service: "payguard-production-monitor", profile: "COSTON2_SIMULATED_V2", sampled: true,
  sampleAt: "2026-08-11T16:37:50.462Z", monitoredDependencies: 5, activeAlerts: 0, retentionSamples: 1440,
  operatorAuthenticationRequired: true, aggregateOnly: true, simulatedTee: true,
  hardwareTeeVerified: false, verifiedPayGuardRelease: false,
};

describe("public production monitor health", () => {
  it("accepts only the aggregate simulated-V2 boundary", () => {
    expect(decodeProductionHealth(health)).toEqual(health);
    expect(() => decodeProductionHealth({ ...health, hardwareTeeVerified: true })).toThrow(/boundary/);
    expect(() => decodeProductionHealth({ ...health, requestId: "private" })).toThrow(/boundary/);
    expect(() => decodeProductionHealth({ ...health, monitoredDependencies: 4 })).toThrow(/boundary/);
  });

  it("uses a credential-free no-store cross-origin GET", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(health), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    await expect(fetchProductionHealth(fetcher as typeof fetch)).resolves.toEqual(health);
    expect(fetcher).toHaveBeenCalledWith(`${PRODUCTION_MONITOR_ORIGIN}/healthz`, {
      method: "GET", credentials: "omit", cache: "no-store", redirect: "error", headers: { accept: "application/json" },
    });
  });

  it("fails closed on an unavailable or non-JSON response", async () => {
    await expect(fetchProductionHealth(async () => new Response("no", { status: 503 })) as Promise<unknown>).rejects.toThrow(/HTTP 503/);
  });
});
