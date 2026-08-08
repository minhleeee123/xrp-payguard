import { getAddress, stringToHex, zeroAddress } from "viem";
import { COSTON2_CHAIN_ID, FCC_TEE_MANAGER } from "./fcc-foundation-registration.mjs";

export const PAYGUARD_EXTENSION_ID = 66037n;
export const PAYGUARD_TEE_VERSION = "0.1.0-payguard";
export const PAYGUARD_TEE_VERSION_BYTES32 = stringToHex(PAYGUARD_TEE_VERSION, { size: 32 });
export const PAYGUARD_FOUNDATION_SENDER = getAddress("0xA1e95721aD7F96D7f9bcd1d62b3A38A8625Cf8dC");
export const PAYGUARD_EXTENSION_OWNER = getAddress("0xDC1cc527423C882156a632C250528D1922d18Fc7");

export const PRODUCTION_PLATFORMS = new Set([
  "0x4743505f414d445f534556000000000000000000000000000000000000000000", // GCP_AMD_SEV
  "0x4743505f414d445f5345565f4553000000000000000000000000000000000000", // GCP_AMD_SEV_ES
  "0x4743505f494e54454c5f54445800000000000000000000000000000000000000", // GCP_INTEL_TDX
]);

const hashPattern = /^0x[0-9a-fA-F]{64}$/;
const exactAdmissionKeys = [
  "attestationPkiVerified",
  "chainId",
  "codeHash",
  "extensionId",
  "governanceHash",
  "keyFingerprint",
  "machineId",
  "machineSignatureVerified",
  "noRawAttestationOrSignatureOutput",
  "platform",
  "productionPlatformVerified",
  "proxyId",
  "proxySignatureVerified",
  "status",
  "teeId",
  "teeTimestamp",
].sort();

function hash(value, label) {
  if (typeof value !== "string" || !hashPattern.test(value) || /^0x0{64}$/i.test(value)) {
    throw new Error(`${label} must be non-zero bytes32`);
  }
  return value.toLowerCase();
}

export function normalizeExpectedImageID(value) {
  if (typeof value !== "string") throw new Error("expected image ID is required");
  const normalized = value.startsWith("sha256:") ? `0x${value.slice(7)}` : value;
  return hash(normalized, "expected image ID");
}

function address(value, label) {
  try {
    if (typeof value !== "string" || value.toLowerCase() === zeroAddress) throw new Error();
    return getAddress(value);
  } catch {
    throw new Error(`${label} must be a non-zero EVM address`);
  }
}

function exactKeys(value, expected, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expected)) throw new Error(`${label} fields are not exact`);
}

export function validateMachineAdmission(value, { expectedCodeHash, nowSeconds = Math.floor(Date.now() / 1000), maximumAgeSeconds = 120 } = {}) {
  exactKeys(value, exactAdmissionKeys, "machine admission");
  if (value.status !== "verified" || value.chainId !== COSTON2_CHAIN_ID || value.extensionId !== PAYGUARD_EXTENSION_ID.toString()) {
    throw new Error("machine admission network or extension mismatch");
  }
  for (const field of [
    "attestationPkiVerified",
    "machineSignatureVerified",
    "proxySignatureVerified",
    "productionPlatformVerified",
    "noRawAttestationOrSignatureOutput",
  ]) {
    if (value[field] !== true) throw new Error(`machine admission assertion ${field} did not pass`);
  }
  const teeId = address(value.teeId, "TEE ID");
  const proxyId = address(value.proxyId, "proxy ID");
  if (teeId === proxyId) throw new Error("TEE and proxy IDs must be distinct");
  const machineId = hash(value.machineId, "machine ID");
  if (!machineId.endsWith(teeId.slice(2).toLowerCase()) || machineId.slice(2, 26) !== "0".repeat(24)) {
    throw new Error("machine ID does not bind the TEE ID");
  }
  const codeHash = hash(value.codeHash, "machine code hash");
  if (expectedCodeHash !== undefined && codeHash !== hash(expectedCodeHash, "expected code hash")) {
    throw new Error("machine code hash does not match the expected image ID");
  }
  const platform = hash(value.platform, "machine platform");
  if (!PRODUCTION_PLATFORMS.has(platform)) throw new Error("machine platform is not a supported production platform");
  if (!Number.isSafeInteger(value.teeTimestamp) || value.teeTimestamp <= 0) throw new Error("TEE timestamp is invalid");
  if (!Number.isSafeInteger(nowSeconds) || !Number.isInteger(maximumAgeSeconds) || maximumAgeSeconds <= 0) {
    throw new Error("admission freshness configuration is invalid");
  }
  if (Math.abs(nowSeconds - value.teeTimestamp) > maximumAgeSeconds) throw new Error("machine admission is stale or from the future");
  return {
    ...value,
    teeId,
    proxyId,
    machineId,
    keyFingerprint: hash(value.keyFingerprint, "machine key fingerprint"),
    codeHash,
    platform,
    governanceHash: hash(value.governanceHash, "machine governance hash"),
  };
}

export function evaluateCodeVersionPlan(input) {
  const admission = validateMachineAdmission(input.admission, {
    expectedCodeHash: input.expectedCodeHash,
    nowSeconds: input.nowSeconds,
    maximumAgeSeconds: input.maximumAgeSeconds,
  });
  const supportedCodeHashes = (input.supportedCodeHashes ?? []).map((entry) => hash(entry, "supported code hash"));
  const systemPlatforms = (input.systemPlatforms ?? []).map((entry) => hash(entry, "system platform"));
  const registeredVersion = input.registeredVersion === undefined ? undefined : hash(input.registeredVersion, "registered version");
  const registeredPlatforms = (input.registeredPlatforms ?? []).map((entry) => hash(entry, "registered platform"));
  const codeHashKnown = supportedCodeHashes.includes(admission.codeHash);
  const exactReadback = registeredVersion === PAYGUARD_TEE_VERSION_BYTES32.toLowerCase()
    && registeredPlatforms.length === 1 && registeredPlatforms[0] === admission.platform;
  const assertions = {
    chainIdVerified: input.chainId === COSTON2_CHAIN_ID,
    managerVerified: input.manager === FCC_TEE_MANAGER && input.managerRuntimePresent === true,
    extensionOwnerVerified: input.extensionOwner === PAYGUARD_EXTENSION_OWNER,
    foundationSenderVerified: input.foundationSender === PAYGUARD_FOUNDATION_SENDER,
    zeroStateVerifierVerified: input.stateVerifier === zeroAddress,
    systemPlatformSupported: systemPlatforms.includes(admission.platform),
    codeHashNotDisabled: input.codeHashPlatformDisabled === false,
    existingCodeHashCompatible: !codeHashKnown || (input.codeHashPlatformSupported === true && exactReadback),
    supportReadbackConsistent: input.codeHashPlatformSupported === true
      ? codeHashKnown && exactReadback
      : input.codeHashPlatformSupported === false && !codeHashKnown,
  };
  const status = Object.values(assertions).every(Boolean) ? "ready" : "failed";
  return {
    status,
    action: status === "ready" ? (input.codeHashPlatformSupported === true ? "already-supported" : "add-version") : "none",
    extensionId: PAYGUARD_EXTENSION_ID.toString(),
    version: PAYGUARD_TEE_VERSION,
    versionBytes32: PAYGUARD_TEE_VERSION_BYTES32.toLowerCase(),
    codeHash: admission.codeHash,
    platform: admission.platform,
    teeId: admission.teeId,
    assertions,
  };
}
