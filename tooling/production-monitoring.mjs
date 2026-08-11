import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const SERVICE = "payguard-monitor";
const ENVIRONMENT = "production";
const EVIDENCE_PATH = resolve(root, "evidence/coston2/production-monitoring.json");
const PROFILE = "COSTON2_SIMULATED_V2";

export function deploymentPlan() {
  return {
    status: "planned",
    service: SERVICE,
    environment: ENVIRONMENT,
    source: "apps/monitor",
    publicRoute: "/healthz",
    operatorRoutes: ["/metrics", "/v1/status", "/v1/incidents"],
    command: "PAYGUARD_ALLOW_PRODUCTION_MONITOR_DEPLOY=1 pnpm monitor:deploy --allow-production-monitor",
    writes: ["Railway service/domain/runtime secret/deployment", "sanitized Coston2 evidence"],
  };
}

export function buildMonitoringEvidence({ sourceCommit, deploymentId, origin, health, status, incidents, http, logsVerified }) {
  if (!/^[0-9a-f]{40}$/.test(sourceCommit) || !/^[0-9a-f-]{36}$/.test(deploymentId)) throw new Error("monitor deployment identifiers are invalid");
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("monitor origin is invalid");
  if (health.status !== "ready" || health.service !== "payguard-production-monitor" || health.profile !== PROFILE
    || health.monitoredDependencies !== 5 || health.activeAlerts !== 0 || health.retentionSamples !== 1_440
    || health.operatorAuthenticationRequired !== true || health.aggregateOnly !== true
    || health.simulatedTee !== true || health.hardwareTeeVerified !== false || health.verifiedPayGuardRelease !== false) {
    throw new Error("public monitor health is outside the reviewed boundary");
  }
  if (status.status !== "available" || status.profile !== PROFILE || status.dependencies?.relay !== "ready"
    || status.dependencies?.rpc !== "ready" || status.dependencies?.fccQuorum !== "ready"
    || status.dependencies?.fccCustodySet !== "ready" || status.dependencies?.fccReadyCount !== 3
    || status.activeAlerts?.length !== 0 || status.retentionSamples !== 1_440
    || Object.values(status.assertions ?? {}).some((value) => value !== true)) throw new Error("operator monitor status is invalid");
  if (incidents.status !== "available" || incidents.retentionLimit !== 128 || !Array.isArray(incidents.incidents)) throw new Error("monitor incident feed is invalid");
  if (http.publicHealth !== 200 || http.metricsWithoutToken !== 401 || http.statusWithoutToken !== 401
    || http.incidentsWithoutToken !== 401 || http.metricsWithToken !== 200
    || http.statusWithToken !== 200 || http.incidentsWithToken !== 200 || logsVerified !== true) {
    throw new Error("monitor access-control observation is incomplete");
  }
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-production-monitoring",
    status: "verified-live-production-monitoring",
    recordedAt: new Date().toISOString(),
    sourceCommit,
    network: { name: "flare-coston2", chainId: 114, testnetOnly: true },
    service: { platform: "railway", name: SERVICE, origin: url.origin, deploymentId, profile: PROFILE },
    observation: {
      monitoredDependencies: health.monitoredDependencies,
      dependencyStates: status.dependencies,
      activeAlerts: health.activeAlerts,
      aggregateHistorySamples: status.historySamples,
      retentionSamples: health.retentionSamples,
      incidentRetentionLimit: incidents.retentionLimit,
      incidentRecordsObserved: incidents.incidents.length,
      http,
    },
    assertions: {
      testnetOnly: true,
      liveServiceVerified: true,
      independentProcessVerified: true,
      managedRuntimeCredentialVerified: true,
      authenticatedHttpsVerified: true,
      unauthorizedOperatorRoutesRejected: true,
      boundedAggregateRetentionVerified: true,
      fixedAlertKindsVerified: true,
      sanitizedIncidentIntegrationVerified: true,
      runtimeLogsCredentialFree: true,
      aggregateOnly: true,
      noRequestIdentifiersRecorded: true,
      noPolicyPlaintextOrCiphertextRecorded: true,
      noAuthorizationDecisionRecorded: true,
      noCredentialRecorded: true,
      noPrivateKeyRecorded: true,
      simulatedTee: true,
      hardwareTeeVerified: false,
      verifiedPayGuardRelease: false,
    },
    blockers: ["HARDWARE_ATTESTATION_NOT_VERIFIED", "VERIFIED_RELEASE_NOT_PROMOTED"],
    notes: [
      "The monitor is an independent Railway process and verifies public operational readiness only; it cannot authorize or execute PayGuard actions.",
      "Detailed status, Prometheus metrics, and bounded incident records require a Railway-managed runtime bearer token that is absent from this evidence.",
      "Healthy production observation confirms alerts are armed with zero active alerts; outage behavior is covered separately and is not inferred from this record.",
    ],
  };
}

async function railway(args) {
  try {
    return await execFileAsync("railway", args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
  } catch {
    throw new Error(`Railway command failed safely: ${args[0] ?? "unknown"}`);
  }
}

async function railwayWithStdin(args, input) {
  return await new Promise((resolveRun, rejectRun) => {
    const child = spawn("railway", args, { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", () => rejectRun(new Error(`Railway command failed safely: ${args[0] ?? "unknown"}`)));
    child.once("close", (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else rejectRun(new Error(`Railway command failed safely: ${args[0] ?? "unknown"}`));
    });
    child.stdin.end(input);
  });
}

async function gitState() {
  const [{ stdout: commit }, { stdout: status }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root }),
    execFileAsync("git", ["status", "--porcelain"], { cwd: root }),
  ]);
  if (status.trim()) throw new Error("production monitor deployment requires a clean Git tree");
  return commit.trim();
}

async function serviceState() {
  const { stdout } = await railway(["status", "--json"]);
  const project = JSON.parse(stdout);
  const environment = project.environments?.edges?.map((edge) => edge.node).find((item) => item.name === ENVIRONMENT);
  return environment?.serviceInstances?.edges?.map((edge) => edge.node).find((item) => item.serviceName === SERVICE) ?? null;
}

async function ensureService() {
  let service = await serviceState();
  if (!service) {
    await railway(["add", "--service", SERVICE, "--json"]);
    service = await serviceState();
  }
  if (!service?.serviceId) throw new Error("monitor service was not created");
  return service;
}

async function ensureDomain() {
  const listed = await railway(["domain", "list", "--service", SERVICE, "--environment", ENVIRONMENT, "--json"]);
  const domains = JSON.parse(listed.stdout);
  const existing = Array.isArray(domains) ? domains.find((item) => typeof item.domain === "string" && item.domain.endsWith(".up.railway.app")) : null;
  if (existing) return `https://${existing.domain}`;
  const created = await railway(["domain", "--service", SERVICE, "--environment", ENVIRONMENT, "--port", "8080", "--json"]);
  const value = JSON.parse(created.stdout);
  const domain = value.domain ?? value.serviceDomain ?? value.url;
  if (typeof domain !== "string") throw new Error("monitor Railway domain was not created");
  return domain.startsWith("https://") ? domain : `https://${domain}`;
}

async function latestDeployment() {
  const result = await railway(["deployment", "list", "--service", SERVICE, "--environment", ENVIRONMENT, "--limit", "1", "--json"]);
  const values = JSON.parse(result.stdout);
  const item = Array.isArray(values) ? values[0] : values.deployments?.[0];
  return item ?? null;
}

async function waitForDeployment(timeoutMs = 600_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const item = await latestDeployment();
    if (item?.status === "SUCCESS") return item;
    if (["FAILED", "CRASHED", "REMOVED"].includes(item?.status)) throw new Error("monitor Railway deployment failed");
    await new Promise((resolveWait) => setTimeout(resolveWait, 5_000));
  }
  throw new Error("monitor Railway deployment timed out");
}

async function request(origin, path, token) {
  const response = await fetch(`${origin}${path}`, {
    headers: token ? { authorization: `Bearer ${token}`, accept: path === "/metrics" ? "text/plain" : "application/json" } : {},
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (Buffer.byteLength(text) > 256 * 1024) throw new Error("monitor response exceeded audit bound");
  return { status: response.status, type: response.headers.get("content-type") ?? "", text };
}

async function waitForHealth(origin, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await request(origin, "/healthz");
      if (response.status === 200) return JSON.parse(response.text);
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 5_000));
  }
  throw new Error("monitor health did not become available");
}

async function verifyRuntimeLogs(deploymentId, token) {
  const result = await railway(["logs", "--service", SERVICE, "--environment", ENVIRONMENT, "--deployment", deploymentId, "--lines", "100", "--json"]);
  const text = `${result.stdout}\n${result.stderr}`;
  if (text.includes(token) || /ciphertext|policyPlaintext|privateKey|mnemonic|seed|authorization:\s*Bearer/i.test(text)) {
    throw new Error("monitor runtime logs failed privacy verification");
  }
  return true;
}

export async function deployProductionMonitor() {
  if (process.env.PAYGUARD_ALLOW_PRODUCTION_MONITOR_DEPLOY !== "1") throw new Error("production monitor capability is missing");
  const sourceCommit = await gitState();
  await ensureService();
  const origin = await ensureDomain();
  const token = randomBytes(32).toString("hex");
  await railwayWithStdin(["variable", "set", "PAYGUARD_MONITOR_BEARER_TOKEN", "--stdin", "--service", SERVICE, "--environment", ENVIRONMENT, "--skip-deploys", "--json"], token);
  await railway(["up", "apps/monitor", "--path-as-root", "--service", SERVICE, "--environment", ENVIRONMENT, "--detach", "--json", "--message", `Deploy PayGuard monitor from ${sourceCommit.slice(0, 7)}`]);
  const deployment = await waitForDeployment();
  const deploymentId = deployment.id ?? deployment.deploymentId;
  if (typeof deploymentId !== "string") throw new Error("monitor deployment ID is unavailable");
  const health = await waitForHealth(origin);
  const [metricsDenied, statusDenied, incidentsDenied, metricsAllowed, statusAllowed, incidentsAllowed] = await Promise.all([
    request(origin, "/metrics"), request(origin, "/v1/status"), request(origin, "/v1/incidents"),
    request(origin, "/metrics", token), request(origin, "/v1/status", token), request(origin, "/v1/incidents", token),
  ]);
  if (!metricsAllowed.type.startsWith("text/plain") || /https?:|0x[0-9a-f]{8}|request|policy|ciphertext|account|signature|credential|allow|deny/i.test(metricsAllowed.text)) {
    throw new Error("monitor metrics failed aggregate-only verification");
  }
  const status = JSON.parse(statusAllowed.text);
  const incidents = JSON.parse(incidentsAllowed.text);
  const http = {
    publicHealth: 200,
    metricsWithoutToken: metricsDenied.status,
    statusWithoutToken: statusDenied.status,
    incidentsWithoutToken: incidentsDenied.status,
    metricsWithToken: metricsAllowed.status,
    statusWithToken: statusAllowed.status,
    incidentsWithToken: incidentsAllowed.status,
  };
  const evidence = buildMonitoringEvidence({
    sourceCommit, deploymentId, origin, health, status, incidents, http,
    logsVerified: await verifyRuntimeLogs(deploymentId, token),
  });
  await mkdir(dirname(EVIDENCE_PATH), { recursive: true });
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
  return { status: evidence.status, service: SERVICE, origin, deploymentId, sourceCommit, evidence: "evidence/coston2/production-monitoring.json" };
}

function parseCli(argv) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === "plan")) return "plan";
  if (argv.length === 2 && argv[0] === "deploy" && argv[1] === "--allow-production-monitor") return "deploy";
  throw new Error("usage: plan | deploy --allow-production-monitor");
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const mode = parseCli(process.argv.slice(2));
    console.log(JSON.stringify(mode === "plan" ? deploymentPlan() : await deployProductionMonitor(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
