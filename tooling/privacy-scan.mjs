import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const targets = ["apps/web/src", "apps/web/dist", "apps/relay/src", "apps/fcc-extension/internal"];
const skipped = new Set(["node_modules", ".git"]);
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".html", ".css", ".go"]);
const files = [];

async function walk(directory) {
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (skipped.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (extensions.has(extname(entry.name))) files.push(absolute);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
for (const target of targets) await walk(resolve(root, target));

const forbidden = [
  ["browser-persistence", /\b(?:localStorage|sessionStorage|indexedDB|document\.cookie)\b/],
  ["private-body-log", /console\.(?:log|info|debug|warn)\s*\([^)]*(?:ciphertext|privateSalt|policyPlaintext|sealedPolicy)/i],
];
const findings = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const [label, pattern] of forbidden) if (pattern.test(text)) findings.push(`${relative(root, file)}: ${label}`);
}
if (findings.length > 0) throw new Error(`Privacy scan failed:\n${findings.join("\n")}`);
console.log(JSON.stringify({ status: "ok", filesInspected: files.length, browserPersistence: "none" }));
