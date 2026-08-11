import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMonitoringEvidence, deploymentPlan } from "./production-monitoring.mjs";

const health = {
  status: "ready", service: "payguard-production-monitor", profile: "COSTON2_SIMULATED_V2",
  monitoredDependencies: 5, activeAlerts: 0, retentionSamples: 1440,
  operatorAuthenticationRequired: true, aggregateOnly: true, simulatedTee: true,
  hardwareTeeVerified: false, verifiedPayGuardRelease: false,
};
const status = {
  status: "available", profile: "COSTON2_SIMULATED_V2", historySamples: 1, retentionSamples: 1440,
  dependencies: { relay: "ready", rpc: "ready", fccQuorum: "ready", fccCustodySet: "ready", fccReadyCount: 3 },
  activeAlerts: [],
  assertions: { aggregateOnly: true, noRequestIdentifiers: true, noPolicyMaterial: true, noCredentials: true, noAuthorizationDecision: true },
};
const incidents = { status: "available", retentionLimit: 128, incidents: [] };
const http = { publicHealth: 200, metricsWithoutToken: 401, statusWithoutToken: 401, incidentsWithoutToken: 401, metricsWithToken: 200, statusWithToken: 200, incidentsWithToken: 200 };

describe("production monitoring deployment", () => {
  it("is read-only by default and names every external write", () => {
    assert.deepEqual(deploymentPlan().writes, ["Railway service/domain/runtime secret/deployment", "sanitized Coston2 evidence"]);
  });

  it("accepts only a healthy authenticated aggregate observation", () => {
    const evidence = buildMonitoringEvidence({
      sourceCommit: "a".repeat(40), deploymentId: "11111111-1111-1111-1111-111111111111",
      origin: "https://monitor.example.test", health, status, incidents, http, logsVerified: true,
    });
    assert.equal(evidence.status, "verified-live-production-monitoring");
    assert.equal(evidence.assertions.hardwareTeeVerified, false);
    assert.equal(evidence.assertions.verifiedPayGuardRelease, false);
    assert.doesNotMatch(JSON.stringify(evidence), /PAYGUARD_MONITOR_BEARER_TOKEN|Bearer [A-Za-z0-9]/);
  });

  it("rejects missing access control, dependency health, or release boundaries", () => {
    assert.throws(() => buildMonitoringEvidence({ sourceCommit: "a".repeat(40), deploymentId: "11111111-1111-1111-1111-111111111111", origin: "https://monitor.example.test", health, status, incidents, http: { ...http, metricsWithoutToken: 200 }, logsVerified: true }), /access-control/);
    assert.throws(() => buildMonitoringEvidence({ sourceCommit: "a".repeat(40), deploymentId: "11111111-1111-1111-1111-111111111111", origin: "https://monitor.example.test", health, status: { ...status, dependencies: { ...status.dependencies, rpc: "unavailable" } }, incidents, http, logsVerified: true }), /status is invalid/);
    assert.throws(() => buildMonitoringEvidence({ sourceCommit: "a".repeat(40), deploymentId: "11111111-1111-1111-1111-111111111111", origin: "https://monitor.example.test", health: { ...health, hardwareTeeVerified: true }, status, incidents, http, logsVerified: true }), /health is outside/);
  });
});
