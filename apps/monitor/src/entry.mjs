import { ProductionMonitor } from "./monitor.mjs";
import { createMonitorServer } from "./server.mjs";

const port = Number(process.env.PORT ?? "8080");
const bearerToken = process.env.PAYGUARD_MONITOR_BEARER_TOKEN;
const intervalMs = Number(process.env.PAYGUARD_MONITOR_INTERVAL_MS ?? "60000");
const retentionSamples = Number(process.env.PAYGUARD_MONITOR_RETENTION_SAMPLES ?? "1440");
if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535
  || !Number.isSafeInteger(intervalMs) || intervalMs < 10_000 || intervalMs > 300_000) {
  throw new Error("monitor runtime configuration is invalid");
}

const monitor = new ProductionMonitor({
  retentionSamples,
  targets: {
    relay: "https://payguard-live-relay-production.up.railway.app",
    rpc: "https://coston2-api.flare.network/ext/C/rpc",
    machines: [
      "https://payguard-fcc-a-production.up.railway.app",
      "https://payguard-fcc-b-production.up.railway.app",
      "https://payguard-fcc-d-production.up.railway.app",
    ],
  },
});
await monitor.sample();
const timer = setInterval(() => void monitor.sample(), intervalMs);
timer.unref();
const server = createMonitorServer(monitor, { bearerToken });
server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({
    status: "listening",
    service: "payguard-production-monitor",
    port,
    intervalMs,
    retentionSamples,
    aggregateOnly: true,
    credentialLogged: false,
  }));
});
