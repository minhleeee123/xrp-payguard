import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  array,
  exact,
  nonEmpty,
  publicOnly,
  readJson,
  record,
} from "./candidate-public.mjs";
import { validateUserValidationTemplate } from "./user-validation.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
export const CANDIDATE_PLAN_PATH = resolve(root, "releases/candidates/coston2-v2.plan.json");
export const LOCAL_BUILD_PATH = resolve(root, ".local/release-candidate/coston2-v2.build.json");
const userValidationTemplatePath = resolve(root, "docs/product/user-validation-aggregate.template.json");
const artifactPath = resolve(root, "packages/contracts/out/PayGuardPolicyRegistryV2.sol/PayGuardPolicyRegistryV2.json");
const versions = JSON.parse(await readFile(resolve(root, "tooling/versions.json"), "utf8"));
const requiredBlockers = new Set([
  "official-fcc-manager-and-three-machines",
  "coston2-v2-deployment",
  "canonical-live-lifecycle",
  "outage-drills",
  "canonical-redemption",
  "user-validation",
]);

export function validateCandidatePlan(value) {
  const plan = record(value, "candidate plan");
  exact(plan.schemaVersion, 1, "schemaVersion");
  exact(plan.kind, "payguard-coston2-v2-release-candidate-plan", "kind");
  exact(plan.status, "live-candidate", "status");
  exact(plan.verified, false, "verified");
  const network = record(plan.network, "network");
  exact(network.name, "flare-coston2", "network.name");
  exact(network.chainId, 114, "network.chainId");
  exact(plan.authoritativeManifest, "releases/coston2.release.json", "authoritativeManifest");
  const candidate = record(plan.candidate, "candidate");
  exact(candidate.registryContract, "PayGuardPolicyRegistryV2", "candidate.registryContract");
  exact(candidate.profile, "COSTON2_SIMULATED_V2", "candidate.profile");
  exact(candidate.machineAuthorization, "official-manager-live-recheck", "candidate.machineAuthorization");
  exact(candidate.custodyThreshold, 3, "candidate.custodyThreshold");
  exact(candidate.resultThreshold, 2, "candidate.resultThreshold");
  exact(candidate.buildCommand, "pnpm candidate:build", "candidate.buildCommand");
  exact(candidate.checkCommand, "pnpm candidate:check", "candidate.checkCommand");

  const boundaries = record(plan.boundaries, "boundaries");
  for (const key of ["deployed", "liveFccVerified", "canonicalLifecycleVerified"]) exact(boundaries[key], true, `boundaries.${key}`);
  for (const key of ["outageDrillsVerified", "canonicalRedemptionVerified", "userValidationVerified"]) exact(boundaries[key], false, `boundaries.${key}`);

  const blockers = array(plan.requiredLiveInputs, "requiredLiveInputs");
  const ids = new Set();
  for (const [index, item] of blockers.entries()) {
    const blocker = record(item, `requiredLiveInputs[${index}]`);
    const id = nonEmpty(blocker.id, `requiredLiveInputs[${index}].id`);
    if (ids.has(id)) throw new Error(`duplicate live blocker ${id}`);
    ids.add(id);
    if (blocker.status !== "blocked" && blocker.status !== "candidate-satisfied") throw new Error(`requiredLiveInputs[${index}].status is invalid`);
    nonEmpty(blocker.requiredEvidence, `requiredLiveInputs[${index}].requiredEvidence`);
  }
  for (const id of requiredBlockers) if (!ids.has(id)) throw new Error(`missing live blocker ${id}`);

  const prepared = array(plan.preparedArtifacts, "preparedArtifacts");
  if (prepared.length < 10 || new Set(prepared).size !== prepared.length) throw new Error("preparedArtifacts must be distinct and complete");
  array(plan.promotionRules, "promotionRules").forEach((rule, index) => nonEmpty(rule, `promotionRules[${index}]`));
  publicOnly(plan, "candidate plan");
  const openBlockers = blockers.filter((blocker) => blocker.status === "blocked").length;
  return { status: "live-candidate", verified: false, blockers: openBlockers, preparedArtifacts: prepared.length };
}

function sha256(value) {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

async function gitState() {
  const [{ stdout: commit }, { stdout: status }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root }),
    execFileAsync("git", ["status", "--porcelain"], { cwd: root }),
  ]);
  return { sourceCommit: commit.trim(), sourceTreeClean: status.trim() === "" };
}

export async function buildLocalCandidate() {
  const planBytes = await readFile(CANDIDATE_PLAN_PATH);
  const plan = JSON.parse(planBytes);
  validateCandidatePlan(plan);
  const artifact = await readJson(artifactPath, 16 * 1024 * 1024);
  const metadata = typeof artifact.metadata === "string" ? JSON.parse(artifact.metadata) : artifact.metadata;
  if (metadata?.compiler?.version !== "0.8.25+commit.b61c2a91") throw new Error("V2 artifact must use the pinned Solidity 0.8.25 compiler");
  const creationBytecode = artifact?.bytecode?.object;
  const runtimeBytecode = artifact?.deployedBytecode?.object;
  if (typeof creationBytecode !== "string" || !/^0x[0-9a-fA-F]+$/.test(creationBytecode)) throw new Error("V2 creation bytecode is missing; run forge build first");
  if (typeof runtimeBytecode !== "string" || !/^0x[0-9a-fA-F]+$/.test(runtimeBytecode)) throw new Error("V2 runtime bytecode is missing; run forge build first");
  const sourceDigests = {};
  for (const path of [...new Set(["packages/contracts/src/PayGuardTypes.sol", ...plan.preparedArtifacts])]) {
    sourceDigests[path] = sha256(await readFile(resolve(root, path)));
  }
  const state = await gitState();
  const output = {
    schemaVersion: 1,
    kind: "payguard-coston2-v2-local-build",
    status: "local-build",
    verified: false,
    deployableRelease: false,
    networkTarget: { name: "flare-coston2", chainId: 114 },
    buildEnvironment: {
      node: process.versions.node,
      pinnedNode: versions.node,
      pinnedNodeMatched: process.versions.node === versions.node,
      solidityCompiler: metadata.compiler.version,
    },
    ...state,
    candidatePlanSha256: sha256(planBytes),
    artifacts: {
      contract: "PayGuardPolicyRegistryV2",
      creationBytecodeSha256: sha256(Buffer.from(creationBytecode.slice(2), "hex")),
      runtimeBytecodeSha256: sha256(Buffer.from(runtimeBytecode.slice(2), "hex")),
      sourceDigests,
    },
    blockers: "See releases/candidates/coston2-v2.plan.json; this local file contains no deployment or live verification facts",
  };
  publicOnly(output, "local candidate build");
  await mkdir(dirname(LOCAL_BUILD_PATH), { recursive: true, mode: 0o700 });
  await writeFile(LOCAL_BUILD_PATH, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
  return { ...output, path: ".local/release-candidate/coston2-v2.build.json" };
}

export async function checkCandidate() {
  const plan = await readJson(CANDIDATE_PLAN_PATH);
  const result = validateCandidatePlan(plan);
  for (const path of plan.preparedArtifacts) {
    if (typeof path !== "string" || path.startsWith("/") || path.includes("..")) throw new Error(`prepared artifact path is unsafe: ${path}`);
    await readFile(resolve(root, path));
  }
  validateUserValidationTemplate(await readJson(userValidationTemplatePath));
  return result;
}

function parseCLI(argv) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === "check")) return "check";
  if (argv.length === 1 && argv[0] === "build") return "build";
  if (argv.length === 1 && argv[0] === "plan") return "plan";
  throw new Error("usage: check | build | plan");
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const mode = parseCLI(process.argv.slice(2));
    const result = mode === "build" ? await buildLocalCandidate() : await checkCandidate();
    console.log(JSON.stringify(mode === "plan" ? {
      ...result,
      next: [
        "pnpm candidate:build",
        "collect real live inputs in an ignored operator workspace",
        "verify lifecycle, outage, redemption, and user-validation evidence",
        "follow the promotion runbook; do not promote this candidate plan",
      ],
    } : result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
