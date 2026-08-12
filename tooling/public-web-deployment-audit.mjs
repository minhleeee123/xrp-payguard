import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import {
  assertPublicSafe,
  assertSimulationEvidence,
  buildPublicWebEvidenceManifest,
  collectPublicWebEvidence,
} from "./public-web-evidence.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
export const PUBLIC_WEB_ORIGIN = "https://xrp-payguard.vercel.app";
export const PUBLIC_WEB_DEPLOYMENT_AUDIT_PATH = resolve(
  root,
  "evidence/web/public-evidence-deployment-audit-2026-08-13.json",
);
const MAX_JSON_BYTES = 256 * 1024;
const REVIEWED_CORPUS_COUNTS = Object.freeze({ total: 26, chain114: 25, simulation: 3 });

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonBytes(value) {
  return Buffer.byteLength(value, "utf8");
}

export function parsePublicWebDeploymentAuditCLI(argv) {
  const [mode = "audit", ...tokens] = argv;
  if (mode !== "audit") throw new Error("mode must be audit");
  let write = false;
  for (const token of tokens) {
    if (token === "--write" && !write) {
      write = true;
      continue;
    }
    throw new Error(`invalid or duplicate argument ${token}`);
  }
  return { mode, write };
}

async function readJsonResponse(response, label) {
  if (!response || response.status !== 200) throw new Error(`${label} returned HTTP ${response?.status ?? "unknown"}`);
  const contentType = response.headers?.get("content-type") ?? "";
  if (!/^application\/json(?:;|$)/iu.test(contentType)) throw new Error(`${label} returned a non-JSON content type`);
  const text = await response.text();
  const bytes = jsonBytes(text);
  if (bytes === 0 || bytes > MAX_JSON_BYTES) throw new Error(`${label} exceeded the JSON body boundary`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${label} returned malformed JSON`);
  }
  if (!isRecord(data)) throw new Error(`${label} returned a non-object JSON payload`);
  return { data, text, bytes, contentType };
}

function exactJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function auditDeployedPublicEvidence({
  fetcher = fetch,
  localEntries,
  origin = PUBLIC_WEB_ORIGIN,
} = {}) {
  if (origin !== PUBLIC_WEB_ORIGIN) throw new Error("public evidence audit origin is not pinned");
  const sourceEntries = localEntries ?? await collectPublicWebEvidence(root);
  const expectedManifest = buildPublicWebEvidenceManifest(sourceEntries);
  const indexResponse = await fetcher(`${origin}/evidence/index.json`, {
    headers: { accept: "application/json", "cache-control": "no-cache" },
    signal: AbortSignal.timeout(15_000),
  });
  const index = await readJsonResponse(indexResponse, "public evidence index");
  assertPublicSafe(index.data, "deployed evidence index");
  if (!equalJson(index.data, expectedManifest)) throw new Error("deployed evidence index drifted from local reviewed sources");

  const auditedEntries = [];
  for (const source of sourceEntries) {
    const publicPath = `/${source.path}`;
    const metadata = index.data.entries.find((entry) => entry.path === publicPath);
    if (!metadata) throw new Error(`deployed evidence index omitted ${publicPath}`);
    const response = await fetcher(`${origin}${publicPath}`, {
      headers: { accept: "application/json", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(15_000),
    });
    const deployed = await readJsonResponse(response, publicPath);
    assertPublicSafe(deployed.data, publicPath);
    if (source.path.startsWith("evidence/simulation/")) assertSimulationEvidence(deployed.data, publicPath);
    if (!equalJson(deployed.data, source.data)) throw new Error(`${publicPath} JSON drifted from its reviewed source`);
    const expectedText = exactJson(source.data);
    if (deployed.text !== expectedText) throw new Error(`${publicPath} bytes drifted from its reviewed source`);
    auditedEntries.push({
      path: publicPath,
      suite: metadata.suite,
      status: metadata.status,
      chainId: metadata.chainId,
      sha256: sha256(deployed.text),
      bytes: deployed.bytes,
      httpStatus: response.status,
      contentType: deployed.contentType,
      exactSourceBytesVerified: true,
      publicFieldScanVerified: true,
      explicitSimulationBoundaryVerified: source.path.startsWith("evidence/simulation/") ? true : null,
    });
  }
  const chain114Count = index.data.entries.filter((entry) => entry.chainId === "114").length;
  const simulationCount = index.data.entries.filter((entry) => entry.path.startsWith("/evidence/simulation/")).length;
  if (auditedEntries.length !== REVIEWED_CORPUS_COUNTS.total
    || chain114Count !== REVIEWED_CORPUS_COUNTS.chain114
    || simulationCount !== REVIEWED_CORPUS_COUNTS.simulation) {
    throw new Error(`deployed evidence corpus does not match the reviewed ${REVIEWED_CORPUS_COUNTS.total}/${REVIEWED_CORPUS_COUNTS.chain114}/${REVIEWED_CORPUS_COUNTS.simulation} baseline`);
  }
  return {
    origin,
    index: {
      path: "/evidence/index.json",
      httpStatus: indexResponse.status,
      contentType: index.contentType,
      sha256: sha256(index.text),
      bytes: index.bytes,
      exactSourceBytesVerified: index.text === exactJson(expectedManifest),
    },
    entries: auditedEntries,
    counts: { total: auditedEntries.length, chain114: chain114Count, simulation: simulationCount },
  };
}

function assertAuditObservation(observation) {
  if (!isRecord(observation) || observation.origin !== PUBLIC_WEB_ORIGIN
    || observation.index?.httpStatus !== 200 || observation.index?.exactSourceBytesVerified !== true
    || observation.counts?.total !== REVIEWED_CORPUS_COUNTS.total
    || observation.counts?.chain114 !== REVIEWED_CORPUS_COUNTS.chain114
    || observation.counts?.simulation !== REVIEWED_CORPUS_COUNTS.simulation
    || !Array.isArray(observation.entries)
    || observation.entries.length !== REVIEWED_CORPUS_COUNTS.total) {
    throw new Error("public web deployment audit observation is incomplete");
  }
  if (observation.entries.some((entry) => entry.httpStatus !== 200
    || entry.exactSourceBytesVerified !== true || entry.publicFieldScanVerified !== true
    || typeof entry.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(entry.sha256)
    || !Number.isInteger(entry.bytes) || entry.bytes <= 0)) {
    throw new Error("public web deployment audit entry is incomplete");
  }
  const simulations = observation.entries.filter((entry) => entry.path.startsWith("/evidence/simulation/"));
  if (simulations.length !== REVIEWED_CORPUS_COUNTS.simulation
    || simulations.some((entry) => entry.explicitSimulationBoundaryVerified !== true)) {
    throw new Error("public web deployment audit lost the explicit simulation boundary");
  }
}

export function buildPublicWebDeploymentAuditEvidence(
  observation,
  sourceCommit,
  recordedAt = new Date().toISOString(),
) {
  assertAuditObservation(observation);
  if (typeof sourceCommit !== "string" || !/^[0-9a-f]{40}$/u.test(sourceCommit)) {
    throw new Error("public web deployment audit source commit is invalid");
  }
  const evidence = {
    schemaVersion: 1,
    suite: "payguard-vercel-public-evidence-deployment-audit",
    status: "public-evidence-deployment-audit-pass",
    recordedAt,
    sourceCommit,
    platform: {
      name: "vercel",
      origin: observation.origin,
      indexPath: observation.index.path,
      indexSha256: observation.index.sha256,
      indexBytes: observation.index.bytes,
    },
    corpus: {
      totalEntries: observation.counts.total,
      chain114Entries: observation.counts.chain114,
      simulationEntries: observation.counts.simulation,
      entries: observation.entries,
    },
    assertions: {
      productionOriginPinned: true,
      indexHttpVerified: true,
      allListedAssetsHttpVerified: true,
      exactLocalSourceBytesVerified: true,
      publicFieldScanVerified: true,
      explicitSimulationBoundariesVerified: true,
      metadataOnlyIndexVerified: true,
      recursiveWebEvidenceExcluded: true,
      testnetOnly: true,
      noPrivateKeyRecorded: true,
      noCredentialRecorded: true,
      noPolicyPlaintextOrCiphertextRecorded: true,
      noRawSignatureRecorded: true,
      noPayGuardReleaseClaimed: true,
    },
    blockers: [
      "HARDWARE_ATTESTATION_NOT_VERIFIED",
      "VERIFIED_RELEASE_NOT_PROMOTED",
      "PAYGUARD_RELEASE_MANIFEST_NOT_VERIFIED",
    ],
    notes: [
      "This audit fetched the pinned production origin and compared the manifest plus every listed JSON body byte-for-byte with the reviewed local Coston2/simulation sources.",
      `The ${observation.counts.chain114} chain-114 and ${observation.counts.simulation} simulation counts overlap and are not additive.`,
      "Repository-only evidence/web records are intentionally excluded from the hosted corpus to avoid recursive deployment claims.",
      "A clean public evidence corpus does not turn the live V2 simulated candidate into a hardware-attested verified release or mainnet system.",
    ],
  };
  assertPublicSafe(evidence, "public web deployment audit evidence");
  return evidence;
}

async function git(args) {
  const result = await execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  return result.stdout.trim();
}

async function writeEvidenceAtomically(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export async function runPublicWebDeploymentAudit({ write = false } = {}) {
  if (write && await git(["status", "--porcelain"]) !== "") {
    throw new Error("refusing to record deployment audit from a dirty Git tree");
  }
  const sourceCommit = await git(["rev-parse", "HEAD"]);
  const observation = await auditDeployedPublicEvidence();
  const evidence = buildPublicWebDeploymentAuditEvidence(observation, sourceCommit);
  if (write) await writeEvidenceAtomically(PUBLIC_WEB_DEPLOYMENT_AUDIT_PATH, evidence);
  return { evidence, wrote: write ? PUBLIC_WEB_DEPLOYMENT_AUDIT_PATH : null };
}

async function main() {
  const options = parsePublicWebDeploymentAuditCLI(process.argv.slice(2));
  console.log(JSON.stringify(await runPublicWebDeploymentAudit(options), null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
