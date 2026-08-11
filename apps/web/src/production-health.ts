export interface ProductionHealth {
  status: "ready" | "degraded" | "critical";
  service: "payguard-production-monitor";
  profile: "COSTON2_SIMULATED_V2";
  sampled: true;
  sampleAt: string;
  monitoredDependencies: 5;
  activeAlerts: number;
  retentionSamples: 1440;
  operatorAuthenticationRequired: true;
  aggregateOnly: true;
  simulatedTee: true;
  hardwareTeeVerified: false;
  verifiedPayGuardRelease: false;
}

export const PRODUCTION_MONITOR_ORIGIN = "https://payguard-monitor-production.up.railway.app";
const HEALTH_FIELDS = new Set([
  "status", "service", "profile", "sampled", "sampleAt", "monitoredDependencies", "activeAlerts",
  "retentionSamples", "operatorAuthenticationRequired", "aggregateOnly", "simulatedTee",
  "hardwareTeeVerified", "verifiedPayGuardRelease",
]);

export function decodeProductionHealth(value: unknown): ProductionHealth {
  if (!record(value) || Object.keys(value).some((key) => !HEALTH_FIELDS.has(key))
    || !["ready", "degraded", "critical"].includes(String(value.status))
    || value.service !== "payguard-production-monitor" || value.profile !== "COSTON2_SIMULATED_V2"
    || value.sampled !== true || typeof value.sampleAt !== "string" || !Number.isFinite(Date.parse(value.sampleAt))
    || value.monitoredDependencies !== 5 || !Number.isSafeInteger(value.activeAlerts) || Number(value.activeAlerts) < 0
    || value.retentionSamples !== 1440 || value.operatorAuthenticationRequired !== true
    || value.aggregateOnly !== true || value.simulatedTee !== true
    || value.hardwareTeeVerified !== false || value.verifiedPayGuardRelease !== false) {
    throw new Error("production monitor health is unavailable or outside the reviewed boundary");
  }
  return value as unknown as ProductionHealth;
}

export async function fetchProductionHealth(fetcher: typeof fetch = fetch): Promise<ProductionHealth> {
  const response = await fetcher(`${PRODUCTION_MONITOR_ORIGIN}/healthz`, {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    headers: { accept: "application/json" },
  });
  if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
    throw new Error(`production monitor health returned HTTP ${response.status}`);
  }
  return decodeProductionHealth(await response.json());
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
