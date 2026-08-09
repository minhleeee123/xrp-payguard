import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeSimulatedLifecycleEvidence, fetchSimulatedLifecycleEvidence } from "../src/demo-evidence.js";

const source = JSON.parse(readFileSync(
  new URL("../../../evidence/simulation/coston2-simulated-policy-lifecycle-2026-08-09.json", import.meta.url),
  "utf8",
)) as Record<string, unknown>;

describe("simulation-only lifecycle evidence", () => {
  it("accepts the reviewed three-machine Coston2 lifecycle without upgrading FCC claims", () => {
    const decoded = decodeSimulatedLifecycleEvidence(source);
    expect(decoded.machines).toHaveLength(3);
    expect(decoded.steps).toHaveLength(14);
    expect(decoded.amount).toBe(10_000n);
    expect(decoded.deposited).toBe(decoded.availableAfter + decoded.spentAfter);
    expect(decoded.simulationOnly).toBe(true);
  });

  it("rejects hardware, secret-safety, quorum, and conservation claim drift", () => {
    const assertions = source.assertions as Record<string, unknown>;
    expect(() => decodeSimulatedLifecycleEvidence({ ...source, assertions: { ...assertions, hardwareTeeVerified: true } })).toThrow(/limitation/);
    expect(() => decodeSimulatedLifecycleEvidence({ ...source, assertions: { ...assertions, noPrivateKeyRecorded: false } })).toThrow(/assertion/);
    const lifecycle = source.lifecycle as Record<string, unknown>;
    const allow = lifecycle.recurringAllow as Record<string, unknown>;
    expect(() => decodeSimulatedLifecycleEvidence({ ...source, lifecycle: { ...lifecycle, recurringAllow: { ...allow, evaluations: [] } } })).toThrow(/threshold/);
    const accounting = source.accounting as Record<string, unknown>;
    const after = accounting.afterDeny as Record<string, unknown>;
    expect(() => decodeSimulatedLifecycleEvidence({ ...source, accounting: { ...accounting, afterDeny: { ...after, available: "1" } } })).toThrow(/conservation/);
  });

  it("fetches only the supported same-origin evidence body", async () => {
    const decoded = await fetchSimulatedLifecycleEvidence(async () => new Response(JSON.stringify(source), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    expect(decoded.observedBlock).toBe(33_811_982n);
    await expect(fetchSimulatedLifecycleEvidence(async () => new Response("", { status: 404 }))).rejects.toThrow(/HTTP 404/);
  });
});
