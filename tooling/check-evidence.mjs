import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const path = resolve(root, "evidence/coston2/bootstrap-funding.json");
const evidence = JSON.parse(await readFile(path, "utf8"));
const forbiddenKey = /^(?:privateKey|private_key|secret|seed|ciphertext|policyPlaintext|credential|password|mnemonic|signature)$/i;
function inspectKeys(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key !== "noPrivateKeyRecorded" && forbiddenKey.test(key)) throw new Error(`public evidence contains forbidden field ${key}`);
    inspectKeys(child);
  }
}
inspectKeys(evidence);
if (evidence.network?.chainId !== 114 || evidence.network?.name !== "flare-coston2") throw new Error("evidence network is not Coston2");
if (!evidence.assertions || Object.values(evidence.assertions).some((value) => typeof value !== "boolean")) throw new Error("evidence assertions must be booleans");
console.log(JSON.stringify({ status: "ok", suite: evidence.suite, testnetOnly: evidence.assertions.testnetOnly, note: "bootstrap evidence is not a PayGuard release manifest" }));
