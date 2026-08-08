import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

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

  const fcc = requireRecord(manifest.fcc, "fcc");
  requireNonZeroHex32(fcc.extensionId, "fcc.extensionId");
  requireNonZeroHex32(fcc.codeVersion, "fcc.codeVersion");
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
  return validateReleaseManifest(manifest);
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
