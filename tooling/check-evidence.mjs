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
for (const file of files) {
  const evidence = JSON.parse(await readFile(resolve(directory, file), "utf8"));
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

console.log(JSON.stringify({
  status: "ok",
  evidenceFiles: files.length,
  suites,
  testnetOnly: true,
  note: "public testnet evidence files do not individually constitute a verified PayGuard release",
}));
