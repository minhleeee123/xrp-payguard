import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pins = JSON.parse(await readFile(resolve(root, "tooling/versions.json"), "utf8"));
const strict = process.argv.includes("--strict");
const failures = [];

function commandVersion(command, args = ["--version"]) {
  try {
    return execFileSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function exact(label, actual, expected) {
  if (actual !== expected) failures.push(`${label}: expected ${expected}, got ${actual ?? "missing"}`);
}

const node = process.versions.node;
exact("node", node, pins.node);
exact("pnpm", commandVersion("pnpm"), pins.pnpm);

const go = commandVersion("go", ["version"]);
exact("go", go?.match(/^go version go([^ ]+)/)?.[1] ?? null, pins.go);

const forge = commandVersion("forge");
exact("forge", forge?.match(/forge Version: ([^\n]+)/)?.[1] ?? null, pins.foundry);

if (strict) {
  for (const command of ["docker", "git", "rg"]) {
    if (commandVersion(command) === null) failures.push(`${command}: required command is missing`);
  }
}

const report = {
  status: failures.length === 0 ? "ok" : "failed",
  strict,
  node,
  pnpm: commandVersion("pnpm"),
  go: go?.match(/^go version go([^ ]+)/)?.[1] ?? null,
  forge: forge?.match(/forge Version: ([^\n]+)/)?.[1] ?? null,
  required: {
    node: pins.node,
    pnpm: pins.pnpm,
    go: pins.go,
    foundry: pins.foundry,
    solidity: pins.solidity,
  },
};

if (failures.length > 0) {
  console.error(JSON.stringify({ ...report, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(report));
}
