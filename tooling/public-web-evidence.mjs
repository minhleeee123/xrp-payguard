import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const PUBLIC_EVIDENCE_SOURCES = [
  { directory: "evidence/coston2", include: () => true },
  { directory: "evidence/simulation", include: () => true },
];
const FORBIDDEN_FIELD = /(?:ciphertext|plaintext|password|mnemonic|private[_-]?key|secret|api[_-]?key|credential|seed)/iu;
const SAFETY_ASSERTION = /^no(?:private|policy|api|credential)/iu;
const FORBIDDEN_VALUE = /-----BEGIN (?:RSA|OPENSSH|EC|PGP) PRIVATE KEY-----/u;

export function assertPublicSafe(value, path = "$", field = "") {
  if (FORBIDDEN_FIELD.test(field) && !(SAFETY_ASSERTION.test(field) && typeof value === "boolean")) {
    throw new Error(`forbidden public-evidence field at ${path}: ${field}`);
  }
  if (typeof value === "string" && FORBIDDEN_VALUE.test(value)) {
    throw new Error(`private-key material at ${path}`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPublicSafe(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) assertPublicSafe(entry, `${path}.${key}`, key);
  }
}

export function assertSimulationEvidence(value, path = "evidence/simulation") {
  const assertions = value?.assertions;
  if (value?.status !== "local-simulated-pass" || value?.mode !== "SIMULATED_TEE"
    || value?.network?.publicChainConnected !== false || !assertions
    || assertions.simulationOnly !== true || assertions.hardwareTeeVerified !== false
    || assertions.registeredMachinesVerified !== false || assertions.stableHttpsOriginsVerified !== false
    || assertions.authenticatedIndexerVerified !== false || assertions.noLiveFccResultClaimed !== true
    || assertions.noPayGuardReleaseClaimed !== true) {
    throw new Error(`${path} must remain an explicit non-live simulation record`);
  }
}

async function jsonFiles(directory, include) {
  let names = [];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  return names.filter((name) => include(name) && name.endsWith(".json")).sort();
}

export async function collectPublicWebEvidence(repositoryRoot) {
  const root = resolve(repositoryRoot);
  const entries = [];
  for (const source of PUBLIC_EVIDENCE_SOURCES) {
    const directory = resolve(root, source.directory);
    for (const name of await jsonFiles(directory, source.include)) {
      const sourcePath = join(directory, name);
      const data = JSON.parse(await readFile(sourcePath, "utf8"));
      assertPublicSafe(data, source.directory, "");
      if (source.directory === "evidence/simulation") assertSimulationEvidence(data, sourcePath);
      entries.push({
        path: relative(root, sourcePath).replaceAll("\\", "/"),
        data,
      });
    }
  }
  return entries;
}

export function buildPublicWebEvidenceManifest(entries) {
  return {
    schemaVersion: 1,
    status: "AVAILABLE",
    testnetOnly: true,
    staticShellOnly: true,
    entries: entries.map(({ path, data }) => {
      assertPublicSafe(data, path, "");
      if (path.startsWith("evidence/simulation/")) assertSimulationEvidence(data, path);
      const coston2ChainId = data.network?.name === "flare-coston2" ? data.network.chainId : null;
      return {
        path: `/${path}`,
        suite: typeof data.suite === "string" ? data.suite : "UNSPECIFIED",
        status: typeof data.status === "string" ? data.status : "UNSPECIFIED",
        recordedAt: typeof data.recordedAt === "string" ? data.recordedAt : null,
        chainId: typeof data.chainId === "string" || typeof data.chainId === "number" ? String(data.chainId)
          : typeof coston2ChainId === "string" || typeof coston2ChainId === "number" ? String(coston2ChainId) : null,
        testnetOnly: data.testnetOnly === true || data.assertions?.testnetOnly === true,
        noPrivateKeyRecorded: data.noPrivateKeyRecorded === true || data.assertions?.noPrivateKeyRecorded === true,
        noCredentialRecorded: true,
        noPolicyPlaintextOrCiphertextRecorded: true,
      };
    }),
  };
}

export function createPublicWebEvidencePlugin(repositoryRoot) {
  return {
    name: "payguard-public-web-evidence",
    apply: "build",
    async generateBundle() {
      const entries = await collectPublicWebEvidence(repositoryRoot);
      for (const entry of entries) {
        this.emitFile({
          type: "asset",
          fileName: entry.path,
          source: `${JSON.stringify(entry.data, null, 2)}\n`,
        });
      }
      this.emitFile({
        type: "asset",
        fileName: "evidence/index.json",
        source: `${JSON.stringify(buildPublicWebEvidenceManifest(entries), null, 2)}\n`,
      });
    },
  };
}
