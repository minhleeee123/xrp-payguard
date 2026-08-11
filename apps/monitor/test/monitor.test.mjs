import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ProductionMonitor } from "../src/monitor.mjs";
import { createMonitorServer } from "../src/server.mjs";

const targets = {
  relay: "https://relay.example.test",
  rpc: "https://rpc.example.test/rpc",
  machines: ["https://a.example.test", "https://b.example.test", "https://d.example.test"],
};

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function healthyFetch() {
  return async (url, options = {}) => {
    if (url === `${targets.relay}/healthz`) return response({
      status: "ready", registryVersion: "V2", deploymentProfile: "COSTON2_SIMULATED_V2",
      machineCount: 3, simulatedTee: true, hardwareTeeVerified: false, verifiedPayGuardRelease: false,
    });
    if (url === targets.rpc && options.method === "POST") return response({ jsonrpc: "2.0", id: 1, result: "0x72" });
    if (url.endsWith("/info")) return response({ teeInfo: { chainId: 114 }, machineData: { extensionId: "0x101f5" } });
    if (url.endsWith("/private/health")) return response({ status: "ready" });
    return response({}, 404);
  };
}

function monitor(fetcher = healthyFetch(), retentionSamples = 3) {
  let now = Date.parse("2026-08-11T13:00:00.000Z");
  return new ProductionMonitor({ fetcher, targets, retentionSamples, now: () => (now += 1_000) });
}

describe("production monitor", () => {
  it("reports a healthy V2 simulated candidate using aggregate-only fields", async () => {
    const value = monitor();
    await value.sample();
    assert.deepEqual(value.publicHealth(), {
      status: "ready", service: "payguard-production-monitor", profile: "COSTON2_SIMULATED_V2",
      sampled: true, sampleAt: "2026-08-11T13:00:01.000Z", monitoredDependencies: 5,
      activeAlerts: 0, retentionSamples: 3, operatorAuthenticationRequired: true,
      aggregateOnly: true, simulatedTee: true, hardwareTeeVerified: false, verifiedPayGuardRelease: false,
    });
    const serialized = JSON.stringify(value.operatorStatus());
    assert.doesNotMatch(serialized, /https?:|0x[0-9a-f]{8}|PAYGUARD_RELAY_AUTH|BEGIN [A-Z ]*PRIVATE|"decision":|"ciphertext":|"requestId":/i);
    assert.match(value.prometheus(), /payguard_monitor_fcc_ready_machines 3/);
  });

  it("raises sanitized alerts, records recovery, and bounds retention", async () => {
    let failed = true;
    const fetcher = async (url, options) => failed && (url === targets.rpc || url.includes("b.example"))
      ? response({}, 503) : healthyFetch()(url, options);
    const value = monitor(fetcher, 2);
    await value.sample();
    assert.equal(value.publicHealth().status, "critical");
    assert.equal(value.operatorStatus().dependencies.fccReadyCount, 2);
    assert.deepEqual(value.incidents().incidents.map((item) => item.kind), ["rpc-unavailable", "fcc-custody-set-degraded"]);
    failed = false;
    await value.sample();
    await value.sample();
    assert.equal(value.publicHealth().status, "ready");
    assert.equal(value.operatorStatus().historySamples, 2);
    assert.deepEqual(value.incidents().incidents.slice(-2).map((item) => item.state), ["resolved", "resolved"]);
  });
});

const servers = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))));

describe("operator-only monitor HTTP boundary", () => {
  it("keeps detailed status, incidents, and metrics behind a bearer token", async () => {
    const value = monitor();
    await value.sample();
    const server = createMonitorServer(value, { bearerToken: "a".repeat(64) });
    servers.push(server);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${origin}/healthz`, { headers: { origin: "https://xrp-payguard.vercel.app" } });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("access-control-allow-origin"), "https://xrp-payguard.vercel.app");
    assert.equal((await health.json()).operatorAuthenticationRequired, true);
    const untrustedHealth = await fetch(`${origin}/healthz`, { headers: { origin: "https://untrusted.example" } });
    assert.equal(untrustedHealth.headers.get("access-control-allow-origin"), null);
    for (const path of ["/metrics", "/v1/status", "/v1/incidents"]) {
      const denied = await fetch(`${origin}${path}`);
      assert.equal(denied.status, 401);
      assert.doesNotMatch(await denied.text(), /a{16}/);
      const accepted = await fetch(`${origin}${path}`, { headers: { authorization: `Bearer ${"a".repeat(64)}` } });
      assert.equal(accepted.status, 200);
      assert.equal(accepted.headers.get("cache-control"), "no-store");
    }
  });
});
