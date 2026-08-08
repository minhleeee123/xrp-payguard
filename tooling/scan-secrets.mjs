import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const skipped = new Set([".git", "node_modules", "dist", "coverage", ".local"]);
const allowedExtensions = new Set([".md", ".json", ".mjs", ".js", ".ts", ".tsx", ".yaml", ".yml", ""]);
const files = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name) || entry.name.startsWith(".env")) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute);
    else if (allowedExtensions.has(extname(entry.name))) files.push(absolute);
  }
}

await walk(root);

const patterns = [
  { label: "private-key-assignment", value: /(?:PRIVATE_KEY|SECRET_KEY|DEPLOYER_KEY)\s*[=:]\s*["']?(?:0x)?[0-9a-fA-F]{64}\b/ },
  { label: "xrpl-seed", value: /\bs[a-zA-Z0-9]{28,35}\b/ },
  { label: "pem-material", value: /-----BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY-----/ },
  { label: "credential-url", value: /https?:\/\/[^\s:@/]+:[^\s@/]+@/ },
];

const findings = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const pattern of patterns) {
    if (pattern.value.test(text)) findings.push(`${relative(root, file)}: ${pattern.label}`);
  }
}
if (findings.length > 0) throw new Error(`Potential secrets found:\n${findings.join("\n")}`);

console.log(JSON.stringify({ status: "ok", filesInspected: files.length }));
