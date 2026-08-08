import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "releases/coston2.release.json");
try {
  await access(manifestPath);
} catch (error) {
  if (error?.code === "ENOENT") {
    console.log(JSON.stringify({ status: "planned", reason: "no verified PayGuard Coston2 release manifest exists" }));
    process.exit(0);
  }
  throw error;
}
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const required = ["status", "network", "contracts", "fcc", "sourceCommit", "evidence"];
for (const field of required) if (!(field in manifest)) throw new Error(`release manifest missing ${field}`);
if (manifest.status !== "verified" || manifest.network?.chainId !== 114) throw new Error("release manifest must be verified Coston2 data");
if (!manifest.sourceCommit || !Array.isArray(manifest.contracts) || !Array.isArray(manifest.fcc?.machines)) throw new Error("release manifest is incomplete");
const serialized = JSON.stringify(manifest);
if (/(?:privateKey|seed|ciphertext|policyPlaintext|credential|password|mnemonic)/i.test(serialized)) throw new Error("release manifest contains forbidden private material");
console.log(JSON.stringify({ status: "ok", sourceCommit: manifest.sourceCommit, network: manifest.network }));
