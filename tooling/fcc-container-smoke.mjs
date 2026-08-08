import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import process from "node:process";

const root = new URL("../", import.meta.url).pathname;
const composeFile = `${root}apps/fcc-extension/compose.local.yaml`;
const project = `payguard-fcc-smoke-${process.pid}`;
const imageTag = `smoke-${process.pid}`;
const imageName = `xrp-payguard/fcc-extension:${imageTag}`;
const services = ["payguard-fcc-a", "payguard-fcc-b", "payguard-fcc-c"];

function command(args, options = {}) {
  return execFileSync("docker", args, { cwd: root, encoding: "utf8", stdio: options.capture ? "pipe" : "inherit", env: options.env });
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "string" || address === null) return reject(new Error("failed to allocate loopback port"));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function gitValue(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function waitForHealth(port, previousMachineId) {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/private/health`, { signal: AbortSignal.timeout(750) });
      if (!response.ok) throw new Error(`health returned ${response.status}`);
      const body = await response.json();
      if (previousMachineId && body.machineId === previousMachineId) throw new Error("machine identity has not rotated yet");
      return body;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError ?? new Error("machine health timed out");
}

function assertDescriptor(value) {
  if (value?.status !== "ready") throw new Error("machine is not ready");
  if (!/^0x[0-9a-fA-F]{64}$/.test(value.machineId) || !/^0x[0-9a-fA-F]{64}$/.test(value.keyFingerprint)) throw new Error("invalid machine descriptor");
  if (!/^0x[0-9a-fA-F]{40}$/.test(value.signer)) throw new Error("invalid machine signer");
  const signer = value.signer.slice(2).toLowerCase();
  if (!value.machineId.toLowerCase().endsWith(signer) || !value.keyFingerprint.toLowerCase().endsWith(signer)) throw new Error("machine descriptor does not bind signer");
}

function assertContainerHardening(containerId) {
  const inspected = JSON.parse(command(["inspect", containerId], { capture: true }))[0];
  if (!inspected?.HostConfig?.ReadonlyRootfs) throw new Error("container filesystem is writable");
  if (!inspected.HostConfig.CapDrop?.includes("ALL")) throw new Error("container capabilities were not dropped");
  if (!inspected.HostConfig.SecurityOpt?.includes("no-new-privileges:true")) throw new Error("no-new-privileges is missing");
  const published = inspected.NetworkSettings?.Ports?.["7703/tcp"] ?? [];
  if (published.length !== 1 || published[0].HostIp !== "127.0.0.1") throw new Error("private ingress is not loopback-only");
  const environmentNames = (inspected.Config?.Env ?? []).map((entry) => entry.split("=", 1)[0]);
  const allowed = new Set(["PATH", "SSL_CERT_FILE", "MODE", "SIMULATED_TEE", "CHAIN_ID", "CONFIG_PORT", "SIGN_PORT", "EXTENSION_PORT", "PRIVATE_INGRESS_PORT", "LOG_LEVEL"]);
  if (environmentNames.some((name) => !allowed.has(name))) throw new Error("unexpected container environment variable");
}

const ports = await Promise.all(services.map(() => freePort()));
const env = {
  ...process.env,
  SOURCE_COMMIT: gitValue(["rev-parse", "HEAD"]),
  SOURCE_DATE_EPOCH: gitValue(["show", "-s", "--format=%ct", "HEAD"]),
  PAYGUARD_FCC_IMAGE_TAG: imageTag,
  PAYGUARD_FCC_A_PORT: String(ports[0]),
  PAYGUARD_FCC_B_PORT: String(ports[1]),
  PAYGUARD_FCC_C_PORT: String(ports[2]),
};
const compose = ["compose", "--project-name", project, "--file", composeFile];

try {
  command([...compose, "up", "--detach", "--build"], { env });
  const descriptors = await Promise.all(ports.map((port) => waitForHealth(port)));
  descriptors.forEach(assertDescriptor);
  for (const field of ["machineId", "keyFingerprint", "signer"]) {
    if (new Set(descriptors.map((entry) => entry[field].toLowerCase())).size !== 3) throw new Error(`${field} values are not distinct`);
  }
  for (const service of services) {
    const containerId = command([...compose, "ps", "--quiet", service], { capture: true, env }).trim();
    if (!containerId) throw new Error(`missing ${service} container`);
    assertContainerHardening(containerId);
  }
  for (const port of ports) {
    const response = await fetch(`http://127.0.0.1:${port}/private/ingress`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(1_000),
    });
    const body = await response.text();
    if (response.status < 400 || /ALLOW|ciphertext|authorization/i.test(body)) throw new Error("malformed ingress did not fail closed safely");
  }
  command([...compose, "restart", services[0]], { env });
  const rotated = await waitForHealth(ports[0], descriptors[0].machineId);
  assertDescriptor(rotated);
  process.stdout.write(`${JSON.stringify({ status: "ok", machines: 3, distinctIdentities: true, failClosedIngress: true, restartRotatedIdentity: true })}\n`);
} catch (error) {
  try { command([...compose, "logs", "--no-color", "--tail", "100"], { env }); } catch {}
  throw error;
} finally {
  try { command([...compose, "down", "--volumes", "--remove-orphans"], { env }); } catch {}
  try { command(["image", "rm", "--force", imageName]); } catch {}
}
