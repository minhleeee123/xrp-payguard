import { describe, expect, it } from "vitest";
import { RelayTelemetry } from "../src/observability.js";

describe("public-safe relay telemetry", () => {
  it("renders only fixed aggregate counters and gauges", () => {
    const telemetry = new RelayTelemetry();
    telemetry.evaluationStarted();
    telemetry.evaluationFinished("THRESHOLD_READY", 2, 1);
    telemetry.evaluationRejected("invalid");
    telemetry.evaluationRejected("capacity");
    telemetry.evaluationWasCoalesced();
    telemetry.submissionFinished("success");
    telemetry.submissionFinished("error");
    telemetry.submissionRejected("not_ready");
    telemetry.submissionWasCoalesced();

    expect(telemetry.snapshot()).toMatchObject({
      activeEvaluations: 0,
      evaluations: { threshold_ready: 1n, split: 0n, unavailable: 0n, error: 0n },
      evaluationRejections: { invalid: 1n, capacity: 1n },
      evaluationCoalesced: 1n,
      machineResults: { valid: 2n, failed: 1n },
      submissions: { success: 1n, error: 1n },
      submissionRejections: { not_ready: 1n },
      submissionCoalesced: 1n,
    });

    const metrics = telemetry.renderPrometheus();
    expect(metrics).toContain('payguard_relay_evaluations_total{outcome="threshold_ready"} 1');
    expect(metrics).toContain('payguard_relay_machine_results_total{outcome="failed"} 1');
    expect(metrics).not.toMatch(/0x[0-9a-f]/i);
    expect(metrics).not.toMatch(/policy|ciphertext|account|endpoint|machine_id|request_id|allow|deny/i);
  });

  it("rejects unbalanced or impossible aggregate lifecycle values", () => {
    const telemetry = new RelayTelemetry();
    expect(() => telemetry.evaluationFinished("UNAVAILABLE", 0, 3)).toThrow(/unbalanced/);
    telemetry.evaluationStarted();
    expect(() => telemetry.evaluationFinished("UNAVAILABLE", 0, 2)).toThrow(/result count/);
    expect(telemetry.snapshot().activeEvaluations).toBe(1);
    expect(() => telemetry.evaluationFinished("UNAVAILABLE", -1, 4)).toThrow(/machine count/);
    telemetry.evaluationFinished("UNAVAILABLE", 0, 3);
    expect(telemetry.snapshot().activeEvaluations).toBe(0);
  });
});
