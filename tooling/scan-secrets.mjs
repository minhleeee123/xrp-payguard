import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const skipped = new Set([".git", "node_modules", "dist", "coverage", ".local"]);
const allowedExtensions = new Set([".md", ".json", ".mjs", ".js", ".ts", ".tsx", ".sol", ".go", ".sh", ".css", ".html", ".toml", ".yaml", ".yml", ""]);
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
  { label: "bearer-token", value: /\bBearer\s+[A-Za-z0-9._~-]{24,}/i },
  { label: "secret-assignment", value: /\b(?:API_KEY|TOKEN|PASSWORD|MNEMONIC|SEED)\s*[=:]\s*["'][^"']{12,}["']/i },
];

const findings = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const pattern of patterns) {
    if (pattern.value.test(text)) findings.push(`${relative(root, file)}: ${pattern.label}`);
  }
}

// Scan every reachable Git revision without printing matching content. This catches
// a secret removed from the working tree but still present in repository history.
let historyFindings = [];
let revisionsInspected = 0;
try {
  const revisions = execFileSync("git", ["rev-list", "--all"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  revisionsInspected = revisions.length;
  const historyPattern = "((PRIVATE_KEY|SECRET_KEY|DEPLOYER_KEY)[[:space:]]*[=:][[:space:]]*[\\\"']?(0x)?[0-9a-fA-F]{64}|(API_KEY|TOKEN|PASSWORD|MNEMONIC|SEED)[[:space:]]*[=:][[:space:]]*[\\\"'][^\\\"']{12,}[\\\"']|Bearer[[:space:]]+[A-Za-z0-9._~-]{24,}|-----BEGIN[[:space:]]+(EC[[:space:]]+|RSA[[:space:]]+|OPENSSH[[:space:]]+)?PRIVATE[[:space:]]+KEY-----)";
  for (const revision of revisions) {
    try {
      const matches = execFileSync("git", ["grep", "-I", "-l", "-E", historyPattern, revision, "--"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      historyFindings.push(...matches.trim().split("\n").filter((path) => path && !path.endsWith(":tooling/scan-secrets.mjs") && path !== "tooling/scan-secrets.mjs").map((path) => path.startsWith(`${revision}:`) ? path : `${revision}:${path}`));
    } catch {
      // git grep exits 1 when there are no matches.
    }
  }
} catch {
  // A non-Git source archive can still be scanned safely without history.
}
findings.push(...historyFindings.map((item) => `git-history: ${item}`));
if (findings.length > 0) throw new Error(`Potential secrets found:\n${findings.join("\n")}`);

console.log(JSON.stringify({ status: "ok", filesInspected: files.length, revisionsInspected, historyFindings: historyFindings.length }));
