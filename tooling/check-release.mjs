import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { validateLifecycleEvidence } from "./coston2-v2-lifecycle.mjs";
import { validateOutageDrillEvidence } from "./coston2-v2-outage-drills.mjs";
import { validateRedemptionEvidence } from "./coston2-v2-redemption.mjs";
import { validateUserValidationReport } from "./user-validation.mjs";

const root = resolve(import.meta.dirname, "..");
export const RELEASE_MANIFEST_PATH = resolve(root, "releases/coston2.release.json");

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const COMMIT = /^[0-9a-fA-F]{40}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const ZERO32 = `0x${"00".repeat(32)}`;
const ZERO_ADDRESS = `0x${"00".repeat(20)}`;
const FORBIDDEN_KEY = /^(?:privateKey|private_key|secret|seed|ciphertext|policyPlaintext|credential|password|mnemonic|apiKey|token)$/i;
const FORBIDDEN_VALUE = /(?:-----BEGIN [^-]*PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._~-]{24,}|(?:^|[\s=:])s[a-zA-Z0-9]{28,35}(?:$|[\s,]))/;
const REQUIRED_LIVE_ARTIFACTS = {
  lifecycle: validateLifecycleEvidence,
  outageDrills: validateOutageDrillEvidence,
  redemption: validateRedemptionEvidence,
  userValidation: validateUserValidationReport,
};

/**
 * Validate the exact public-safe shape required before a Coston2 manifest can
 * become authoritative. This function never reads a key or performs a write.
 */
export function validateReleaseManifest(manifest) {
  if (!isRecord(manifest)) throw new Error("release manifest must be an object");
  if (manifest.status !== "verified" || manifest.verified !== true) throw new Error("release manifest must be verified");
  const network = requireRecord(manifest.network, "network");
  if (network.chainId !== 114 || network.name !== "flare-coston2") throw new Error("release manifest must target verified Coston2");
  if (typeof manifest.sourceCommit !== "string" || !COMMIT.test(manifest.sourceCommit)) throw new Error("release sourceCommit must be a 40-hex commit");

  const contracts = requireArray(manifest.contracts, "contracts");
  if (contracts.length < 3) throw new Error("release manifest must include all PayGuard contracts");
  const contractNames = new Set();
  for (const [index, value] of contracts.entries()) {
    const contract = requireRecord(value, `contracts[${index}]`);
    requireNonZeroAddress(contract.address, `contracts[${index}].address`);
    requireNonZeroHex32(contract.runtimeCodeHash, `contracts[${index}].runtimeCodeHash`);
    requireDecimal(contract.deploymentBlock, `contracts[${index}].deploymentBlock`);
    requireNonZeroHex32(contract.deploymentTransactionHash, `contracts[${index}].deploymentTransactionHash`);
    if (typeof contract.name !== "string" || contract.name.length === 0 || contractNames.has(contract.name)) {
      throw new Error(`contracts[${index}].name must be unique`);
    }
    contractNames.add(contract.name);
  }

  if (!contractNames.has("PayGuardPolicyRegistryV2")) {
    throw new Error("release contracts must include PayGuardPolicyRegistryV2");
  }

  const fcc = requireRecord(manifest.fcc, "fcc");
  requireNonZeroAddress(fcc.teeManager, "fcc.teeManager");
  requireNonZeroHex32(fcc.teeManagerSourceSha256, "fcc.teeManagerSourceSha256");
  requireNonZeroHex32(fcc.extensionId, "fcc.extensionId");
  const codeVersion = requireNonZeroHex32(fcc.codeVersion, "fcc.codeVersion");
  const codeHash = requireNonZeroHex32(fcc.codeHash, "fcc.codeHash");
  if (codeVersion !== codeHash) throw new Error("V2 codeVersion must bind the official machine codeHash");
  if (fcc.registryContract !== "PayGuardPolicyRegistryV2" || fcc.machineAuthorization !== "official-manager-live-recheck") {
    throw new Error("FCC machine authorization must use the V2 official-manager live recheck");
  }
  if (fcc.simulated !== false || fcc.registeredMachinesVerified !== true) {
    throw new Error("verified release FCC machines must be registered and non-simulated");
  }
  if (fcc.custodyThreshold !== 3 || fcc.resultThreshold !== 2) throw new Error("FCC thresholds must be 3-of-3 custody and 2-of-3 result");
  const machines = requireArray(fcc.machines, "fcc.machines");
  if (machines.length !== 3) throw new Error("release manifest requires exactly three FCC machines");
  const machineIds = new Set();
  const fingerprints = new Set();
  const signers = new Set();
  for (const [index, value] of machines.entries()) {
    const machine = requireRecord(value, `fcc.machines[${index}]`);
    const machineId = requireNonZeroHex32(machine.machineId, `fcc.machines[${index}].machineId`);
    const fingerprint = requireNonZeroHex32(machine.keyFingerprint, `fcc.machines[${index}].keyFingerprint`);
    const signer = requireNonZeroAddress(machine.signer, `fcc.machines[${index}].signer`);
    const paddedSigner = `0x${"0".repeat(24)}${signer.slice(2)}`;
    if (machineId !== paddedSigner || !fingerprint.endsWith(signer.slice(2))) {
      throw new Error("FCC machine ID and key fingerprint must bind the exact TEE signer");
    }
    if (machineIds.has(machineId) || fingerprints.has(fingerprint) || signers.has(signer)) {
      throw new Error("FCC machine IDs, key fingerprints, and signers must be distinct");
    }
    machineIds.add(machineId);
    fingerprints.add(fingerprint);
    signers.add(signer);
    const origin = machine.origin;
    if (typeof origin !== "string") throw new Error(`fcc.machines[${index}].origin is required`);
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error(`fcc.machines[${index}].origin must be a credential-free HTTPS origin`);
    }
    if (url.pathname !== "/") throw new Error(`fcc.machines[${index}].origin must be an origin, not a path`);
  }

  const bindings = requireRecord(manifest.bindings, "bindings");
  requireNonZeroHex32(bindings.digest, "bindings.digest");
  const evidence = requireRecord(manifest.evidence, "evidence");
  if (evidence.publicOnly !== true) throw new Error("release evidence must be publicOnly");
  const assertions = requireRecord(evidence.assertions, "evidence.assertions");
  if (Object.values(assertions).some((value) => typeof value !== "boolean")) throw new Error("release evidence assertions must be booleans");
  for (const required of ["officialTeeManagerVerified", "machineStatusRecheckedAtResult", "ownerOnlyPolicyLifecycleVerified", "boundedGovernanceVerified", "canonicalLifecycleVerified", "outageDrillsVerified", "canonicalRedemptionVerified", "userValidationVerified"]) {
    if (assertions[required] !== true) throw new Error(`release evidence assertion ${required} must be true`);
  }
  const artifacts = requireRecord(evidence.artifacts, "evidence.artifacts");
  for (const name of Object.keys(REQUIRED_LIVE_ARTIFACTS)) {
    const artifact = requireRecord(artifacts[name], `evidence.artifacts.${name}`);
    requireNonZeroHex32(artifact.sha256, `evidence.artifacts.${name}.sha256`);
    if (typeof artifact.path !== "string" || !/^evidence\/coston2\/[A-Za-z0-9._-]+\.json$/.test(artifact.path)) {
      throw new Error(`evidence.artifacts.${name}.path must be a direct public Coston2 JSON path`);
    }
  }

  inspectPublicOnly(manifest, "release manifest");
  return { status: "ok", sourceCommit: manifest.sourceCommit, network: { name: network.name, chainId: network.chainId }, contractCount: contracts.length, machineCount: machines.length };
}

export async function checkReleaseManifest(manifestPath = RELEASE_MANIFEST_PATH) {
  try {
    await access(manifestPath);
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "planned", reason: "no verified PayGuard Coston2 release manifest exists" };
    throw error;
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const result = validateReleaseManifest(manifest);
  await validateReleaseArtifacts(manifest);
  return { ...result, liveArtifactCount: Object.keys(REQUIRED_LIVE_ARTIFACTS).length };
}

export async function validateReleaseArtifacts(manifest, options = {}) {
  const validators = options.validators ?? REQUIRED_LIVE_ARTIFACTS;
  const readArtifact = options.readArtifact ?? ((path) => readFile(resolve(root, path)));
  for (const [name, validator] of Object.entries(validators)) {
    const artifact = manifest.evidence.artifacts[name];
    const bytes = await readArtifact(artifact.path);
    const digest = `0x${createHash("sha256").update(bytes).digest("hex")}`;
    if (digest !== artifact.sha256.toLowerCase()) throw new Error(`release evidence artifact ${name} digest mismatch`);
    validator(JSON.parse(bytes));
  }
  return { status: "ok", liveArtifactCount: Object.keys(validators).length };
}

function inspectPublicOnly(value, label) {
  if (typeof value === "string") {
    if (FORBIDDEN_VALUE.test(value)) throw new Error(`${label} contains forbidden private material`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectPublicOnly(item, `${label}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`${label} contains forbidden field ${key}`);
    inspectPublicOnly(child, `${label}.${key}`);
  }
}

function requireRecord(value, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function requireNonZeroHex32(value, label) {
  if (typeof value !== "string" || !HEX32.test(value) || value.toLowerCase() === ZERO32) throw new Error(`${label} must be a non-zero bytes32`);
  return value.toLowerCase();
}

function requireNonZeroAddress(value, label) {
  if (typeof value !== "string" || !ADDRESS.test(value) || value.toLowerCase() === ZERO_ADDRESS) throw new Error(`${label} must be a non-zero address`);
  return value.toLowerCase();
}

function requireDecimal(value, label) {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new Error(`${label} must be a quoted decimal`);
  return value;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await checkReleaseManifest()));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
