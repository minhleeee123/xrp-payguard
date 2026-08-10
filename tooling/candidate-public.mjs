import { readFile } from "node:fs/promises";

export const HEX32 = /^0x[0-9a-fA-F]{64}$/;
export const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const COMMIT = /^[0-9a-fA-F]{40}$/;
export const DECIMAL = /^(0|[1-9][0-9]*)$/;
const ZERO32 = `0x${"00".repeat(32)}`;
const ZERO_ADDRESS = `0x${"00".repeat(20)}`;
const FORBIDDEN_KEY = /^(?:privateKey|private_key|secret|seed|ciphertext|policyPlaintext|policyCiphertext|credential|password|mnemonic|apiKey|authorization|signature)$/i;
const FORBIDDEN_VALUE = /(?:-----BEGIN [^-]*PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._~-]{24,}|(?:^|[\s=:])s[a-zA-Z0-9]{28,35}(?:$|[\s,]))/;

export function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

export function array(value, label, length) {
  if (!Array.isArray(value) || (length !== undefined && value.length !== length)) {
    throw new Error(`${label} must be an array${length === undefined ? "" : ` of length ${length}`}`);
  }
  return value;
}

export function nonEmpty(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string`);
  return value;
}

export function exact(value, expected, label) {
  if (value !== expected) throw new Error(`${label} must be ${JSON.stringify(expected)}`);
  return value;
}

export function boolean(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}

export function hex32(value, label) {
  if (typeof value !== "string" || !HEX32.test(value) || value.toLowerCase() === ZERO32) {
    throw new Error(`${label} must be a non-zero bytes32`);
  }
  return value.toLowerCase();
}

export function address(value, label) {
  if (typeof value !== "string" || !ADDRESS.test(value) || value.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(`${label} must be a non-zero address`);
  }
  return value.toLowerCase();
}

export function commit(value, label) {
  if (typeof value !== "string" || !COMMIT.test(value)) throw new Error(`${label} must be a 40-hex commit`);
  return value.toLowerCase();
}

export function decimal(value, label, { positive = false } = {}) {
  if (typeof value !== "string" || !DECIMAL.test(value) || (positive && value === "0")) {
    throw new Error(`${label} must be a ${positive ? "positive " : ""}quoted decimal`);
  }
  return BigInt(value);
}

export function timestamp(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO UTC timestamp`);
  return value;
}

export function publicOnly(value, label = "public evidence") {
  if (typeof value === "string") {
    if (FORBIDDEN_VALUE.test(value)) throw new Error(`${label} contains forbidden private material`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => publicOnly(item, `${label}[${index}]`));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`${label} contains forbidden field ${key}`);
    publicOnly(child, `${label}.${key}`);
  }
}

export function liveHeader(value, expectedKind) {
  const evidence = record(value, "evidence");
  exact(evidence.schemaVersion, 1, "schemaVersion");
  exact(evidence.kind, expectedKind, "kind");
  exact(evidence.status, "verified", "status");
  exact(evidence.verified, true, "verified");
  exact(evidence.live, true, "live");
  const network = record(evidence.network, "network");
  exact(network.name, "flare-coston2", "network.name");
  exact(network.chainId, 114, "network.chainId");
  const release = record(evidence.release, "release");
  commit(release.sourceCommit, "release.sourceCommit");
  hex32(release.manifestDigest, "release.manifestDigest");
  timestamp(evidence.observedAt, "observedAt");
  exact(evidence.publicOnly, true, "publicOnly");
  publicOnly(evidence, expectedKind);
  return evidence;
}

export async function readJson(path, maxBytes = 1_048_576) {
  const text = await readFile(path, "utf8");
  if (Buffer.byteLength(text) > maxBytes) throw new Error(`${path} exceeds the public evidence size limit`);
  return JSON.parse(text);
}

export function parsePlanVerifyCLI(argv) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === "plan")) return { mode: "plan" };
  if (argv.length === 2 && argv[0] === "verify" && !argv[1].startsWith("-")) return { mode: "verify", path: argv[1] };
  throw new Error("usage: plan | verify <public-evidence.json>");
}
