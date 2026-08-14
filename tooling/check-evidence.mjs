import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const directory = resolve(root, "evidence/coston2");
const forbiddenKey = /^(?:privateKey|private_key|secret|seed|ciphertext|policyPlaintext|credential|password|mnemonic|signature)$/i;
function inspectKeys(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key !== "noPrivateKeyRecorded" && forbiddenKey.test(key)) throw new Error(`public evidence contains forbidden field ${key}`);
    inspectKeys(child);
  }
}

const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
if (files.length === 0) throw new Error("no public Coston2 evidence files found");

const suites = [];
const evidenceByFile = new Map();
for (const file of files) {
  const evidence = JSON.parse(await readFile(resolve(directory, file), "utf8"));
  evidenceByFile.set(file, evidence);
  inspectKeys(evidence);
  if (evidence.network?.chainId !== 114 || evidence.network?.name !== "flare-coston2") {
    throw new Error(`${file}: evidence network is not Coston2`);
  }
  if (!evidence.assertions || Object.values(evidence.assertions).some((value) => typeof value !== "boolean")) {
    throw new Error(`${file}: evidence assertions must be booleans`);
  }
  if (evidence.assertions.testnetOnly !== true || evidence.assertions.noPrivateKeyRecorded !== true) {
    throw new Error(`${file}: evidence must assert testnet-only and credential-free output`);
  }
  if (typeof evidence.suite !== "string" || evidence.suite.length === 0) {
    throw new Error(`${file}: evidence suite is required`);
  }
  suites.push(evidence.suite);
}

function canonicalMachineSet(machines, label, fields) {
  if (!Array.isArray(machines) || machines.length !== 3) {
    throw new Error(`${label}: current runtime evidence must contain exactly three machines`);
  }
  const canonical = machines.map((machine) => {
    const teeId = machine[fields.teeId];
    const url = machine[fields.url];
    if (typeof teeId !== "string" || !/^0x[0-9a-f]{40}$/iu.test(teeId)) {
      throw new Error(`${label}: invalid machine identity`);
    }
    if (typeof url !== "string" || !url.startsWith("https://")) {
      throw new Error(`${label}: machine origin must be stable HTTPS`);
    }
    if (machine.status !== 2) throw new Error(`${label}: current machine is not PRODUCTION`);
    return `${teeId.toLowerCase()}|${url}|${machine.status}`;
  }).sort();
  if (new Set(canonical).size !== canonical.length) {
    throw new Error(`${label}: current machine identities must be distinct`);
  }
  return canonical;
}

const deployment = evidenceByFile.get("contracts-v2-simulated.json");
const hostedLifecycle = evidenceByFile.get("fcc-hosted-relay-lifecycle.json");
const custodyLifecycle = evidenceByFile.get("fcc-live-three-machine-custody.json");
if (!deployment || !hostedLifecycle || !custodyLifecycle) {
  throw new Error("current runtime evidence set is incomplete");
}
const deployedMachines = canonicalMachineSet(
  deployment.machines,
  "contracts-v2-simulated.json",
  { teeId: "signer", url: "origin" },
);
const hostedMachines = canonicalMachineSet(
  hostedLifecycle.publicIdentifiers?.machines,
  "fcc-hosted-relay-lifecycle.json",
  { teeId: "teeId", url: "url" },
);
const custodyMachines = canonicalMachineSet(
  custodyLifecycle.publicIdentifiers?.machines,
  "fcc-live-three-machine-custody.json",
  { teeId: "teeId", url: "url" },
);
if (JSON.stringify(deployedMachines) !== JSON.stringify(hostedMachines)
  || JSON.stringify(deployedMachines) !== JSON.stringify(custodyMachines)) {
  throw new Error("current runtime evidence machine sets drifted");
}
const hostedPolicy = hostedLifecycle.publicIdentifiers?.policyCommitment;
const custodyPolicy = custodyLifecycle.publicIdentifiers?.policyCommitment;
if (typeof hostedPolicy !== "string" || !/^0x[0-9a-f]{64}$/iu.test(hostedPolicy)
  || hostedPolicy.toLowerCase() !== custodyPolicy?.toLowerCase()) {
  throw new Error("current hosted lifecycle and custody policy commitments drifted");
}

console.log(JSON.stringify({
  status: "ok",
  evidenceFiles: files.length,
  suites,
  currentRuntimeMachineSetConsistent: true,
  currentHostedCustodyPolicyConsistent: true,
  testnetOnly: true,
  note: "public testnet evidence files do not individually constitute a verified PayGuard release",
}));
