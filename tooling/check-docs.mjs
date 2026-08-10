import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "README.md",
  "AGENTS.md",
  "PLAN.md",
  "docs/README.md",
  "docs/competition.md",
  "docs/product/product-plan.md",
  "docs/product/user-journeys.md",
  "docs/product/user-validation-protocol.md",
  "docs/technology/requirements.md",
  "docs/technology/architecture.md",
  "docs/technology/contract-spec.md",
  "docs/technology/threat-model.md",
  "docs/technology/verification.md",
  "docs/technology/coston2-v2-promotion-runbook.md",
  "docs/technology/reuse-inventory.md",
  "docs/technology/repository-layout.md",
  "docs/lessons/veilbid-build-lessons.md",
  "docs/reference/original/README.md",
];

for (const path of required) await access(resolve(root, path));

const documents = await Promise.all(
  required.filter((path) => path.endsWith(".md")).map(async (path) => ({
    path,
    text: await readFile(resolve(root, path), "utf8"),
  })),
);

const forbiddenClaims = [
  /PayGuard (?:is|has been) (?:deployed|verified|audited|production-ready)/i,
  /(?:provides|supports|enables|offers) private (?:FXRP|FTestXRP|token) transfer/i,
  /guaranteed (?:security|privacy|availability)/i,
];
const violations = documents.flatMap(({ path, text }) =>
  forbiddenClaims.flatMap((pattern) => pattern.test(text) ? [`${path}: ${pattern}`] : []),
);
if (violations.length > 0) {
  throw new Error(`Unsupported release claims:\n${violations.join("\n")}`);
}

const brokenLinks = [];
for (const { path, text } of documents) {
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1].trim().replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:|#)/.test(link)) continue;
    const target = link.split("#", 1)[0];
    if (target === "") continue;
    try {
      await access(resolve(root, dirname(path), decodeURIComponent(target)));
    } catch {
      brokenLinks.push(`${path}: ${link}`);
    }
  }
}
if (brokenLinks.length > 0) {
  throw new Error(`Broken local documentation links:\n${brokenLinks.join("\n")}`);
}

console.log(JSON.stringify({ status: "ok", requiredDocuments: required.length }));
