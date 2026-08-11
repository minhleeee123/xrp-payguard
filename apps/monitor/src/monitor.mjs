const PROFILE = "COSTON2_SIMULATED_V2";
const MAX_INCIDENTS = 128;
const DEPENDENCIES = ["relay", "rpc", "fcc-a", "fcc-b", "fcc-d"];

export class ProductionMonitor {
  #fetch;
  #now;
  #retentionSamples;
  #targets;
  #history = [];
  #incidents = [];
  #activeAlerts = new Map();

  constructor({ fetcher = fetch, now = Date.now, retentionSamples = 1_440, targets }) {
    if (!Number.isSafeInteger(retentionSamples) || retentionSamples < 2 || retentionSamples > 1_440) {
      throw new Error("monitor retention is invalid");
    }
    if (!targets || typeof targets !== "object") throw new Error("monitor targets are missing");
    this.#fetch = fetcher;
    this.#now = now;
    this.#retentionSamples = retentionSamples;
    this.#targets = normalizeTargets(targets);
  }

  async sample() {
    const [relay, rpc, ...machines] = await Promise.all([
      this.#probeRelay(),
      this.#probeRpc(),
      ...this.#targets.machines.map((origin) => this.#probeMachine(origin)),
    ]);
    const at = new Date(this.#now()).toISOString();
    const machineReady = machines.filter(Boolean).length;
    const snapshot = Object.freeze({ at, relay, rpc, machineReady });
    this.#history.push(snapshot);
    if (this.#history.length > this.#retentionSamples) this.#history.splice(0, this.#history.length - this.#retentionSamples);
    this.#reconcileAlerts(snapshot);
    return snapshot;
  }

  publicHealth() {
    const latest = this.#history.at(-1);
    if (!latest) return { status: "starting", service: "payguard-production-monitor", profile: PROFILE, sampled: false };
    const critical = [...this.#activeAlerts.values()].some((alert) => alert.severity === "critical");
    return {
      status: critical ? "critical" : this.#activeAlerts.size > 0 ? "degraded" : "ready",
      service: "payguard-production-monitor",
      profile: PROFILE,
      sampled: true,
      sampleAt: latest.at,
      monitoredDependencies: DEPENDENCIES.length,
      activeAlerts: this.#activeAlerts.size,
      retentionSamples: this.#retentionSamples,
      operatorAuthenticationRequired: true,
      aggregateOnly: true,
      simulatedTee: true,
      hardwareTeeVerified: false,
      verifiedPayGuardRelease: false,
    };
  }

  operatorStatus() {
    const latest = this.#history.at(-1);
    if (!latest) throw new Error("monitor has not sampled dependencies");
    return {
      schemaVersion: 1,
      status: "available",
      profile: PROFILE,
      sampleAt: latest.at,
      dependencies: {
        relay: latest.relay ? "ready" : "unavailable",
        rpc: latest.rpc ? "ready" : "unavailable",
        fccQuorum: latest.machineReady >= 2 ? "ready" : "unavailable",
        fccCustodySet: latest.machineReady === 3 ? "ready" : "degraded",
        fccReadyCount: latest.machineReady,
      },
      activeAlerts: [...this.#activeAlerts.values()].map((alert) => ({ ...alert })),
      historySamples: this.#history.length,
      retentionSamples: this.#retentionSamples,
      assertions: {
        aggregateOnly: true,
        noRequestIdentifiers: true,
        noPolicyMaterial: true,
        noCredentials: true,
        noAuthorizationDecision: true,
      },
    };
  }

  incidents() {
    return {
      schemaVersion: 1,
      status: "available",
      retentionLimit: MAX_INCIDENTS,
      incidents: this.#incidents.map((incident) => ({ ...incident })),
    };
  }

  prometheus() {
    const latest = this.#history.at(-1);
    if (!latest) throw new Error("monitor has not sampled dependencies");
    const lines = [
      "# HELP payguard_monitor_dependency_up Fixed production dependency readiness.",
      "# TYPE payguard_monitor_dependency_up gauge",
      `payguard_monitor_dependency_up{dependency="relay"} ${Number(latest.relay)}`,
      `payguard_monitor_dependency_up{dependency="rpc"} ${Number(latest.rpc)}`,
      "# HELP payguard_monitor_fcc_ready_machines Registered candidate machines responding to public-safe probes.",
      "# TYPE payguard_monitor_fcc_ready_machines gauge",
      `payguard_monitor_fcc_ready_machines ${latest.machineReady}`,
      "# HELP payguard_monitor_active_alerts Current aggregate operational alerts.",
      "# TYPE payguard_monitor_active_alerts gauge",
      `payguard_monitor_active_alerts ${this.#activeAlerts.size}`,
      "# HELP payguard_monitor_history_samples Bounded in-memory aggregate samples.",
      "# TYPE payguard_monitor_history_samples gauge",
      `payguard_monitor_history_samples ${this.#history.length}`,
    ];
    return `${lines.join("\n")}\n`;
  }

  async #probeRelay() {
    try {
      const value = await json(this.#fetch, `${this.#targets.relay}/healthz`);
      return value.status === "ready" && value.registryVersion === "V2"
        && value.deploymentProfile === PROFILE && value.machineCount === 3
        && value.simulatedTee === true && value.hardwareTeeVerified === false
        && value.verifiedPayGuardRelease === false;
    } catch {
      return false;
    }
  }

  async #probeRpc() {
    try {
      const value = await json(this.#fetch, this.#targets.rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      return value.jsonrpc === "2.0" && value.id === 1 && value.result === "0x72";
    } catch {
      return false;
    }
  }

  async #probeMachine(origin) {
    try {
      const [info, health] = await Promise.all([
        json(this.#fetch, `${origin}/info`),
        json(this.#fetch, `${origin}/private/health`),
      ]);
      return info.teeInfo?.chainId === 114 && typeof info.machineData?.extensionId === "string"
        && BigInt(info.machineData.extensionId) === 66037n && health.status === "ready";
    } catch {
      return false;
    }
  }

  #reconcileAlerts(snapshot) {
    const desired = new Map();
    if (!snapshot.relay) desired.set("relay-unavailable", "critical");
    if (!snapshot.rpc) desired.set("rpc-unavailable", "critical");
    if (snapshot.machineReady < 2) desired.set("fcc-quorum-unavailable", "critical");
    else if (snapshot.machineReady < 3) desired.set("fcc-custody-set-degraded", "warning");
    for (const [kind, severity] of desired) {
      if (this.#activeAlerts.has(kind)) continue;
      const alert = { kind, severity, since: snapshot.at };
      this.#activeAlerts.set(kind, alert);
      this.#recordIncident(kind, severity, "active", snapshot.at);
    }
    for (const [kind, alert] of [...this.#activeAlerts]) {
      if (desired.has(kind)) continue;
      this.#activeAlerts.delete(kind);
      this.#recordIncident(kind, alert.severity, "resolved", snapshot.at);
    }
  }

  #recordIncident(kind, severity, state, at) {
    this.#incidents.push({ kind, severity, state, at, runbook: "docs/technology/operations-runbook.md" });
    if (this.#incidents.length > MAX_INCIDENTS) this.#incidents.splice(0, this.#incidents.length - MAX_INCIDENTS);
  }
}

function normalizeTargets(targets) {
  const relay = httpsOrigin(targets.relay, "relay");
  const rpc = httpsUrl(targets.rpc, "rpc");
  if (!Array.isArray(targets.machines) || targets.machines.length !== 3) throw new Error("monitor requires three machine origins");
  const machines = targets.machines.map((origin, index) => httpsOrigin(origin, `machine ${index + 1}`));
  if (new Set(machines).size !== 3) throw new Error("monitor machine origins must be distinct");
  return { relay, rpc, machines };
}

function httpsOrigin(value, label) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${label} origin is invalid`);
  }
  return url.origin;
}

function httpsUrl(value, label) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error(`${label} URL is invalid`);
  return url.toString();
}

async function json(fetcher, url, options = {}) {
  const response = await fetcher(url, { ...options, redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") throw new Error("dependency unavailable");
  const length = Number(response.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length > 128 * 1024) throw new Error("dependency response too large");
  const text = await response.text();
  if (Buffer.byteLength(text) > 128 * 1024) throw new Error("dependency response too large");
  return JSON.parse(text);
}
