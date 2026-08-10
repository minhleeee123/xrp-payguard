import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { buildLocalCandidate } from "./release-candidate.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const versions = JSON.parse(await readFile(resolve(root, "tooling/versions.json"), "utf8"));
const foundryImage = `ghcr.io/foundry-rs/foundry:v${versions.foundry}`;
const nodeImage = `node:${versions.node}-trixie`;

async function run(command, args, options = {}) {
  const result = await execFileAsync(command, args, { cwd: root, maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

async function localForgeMatches() {
  try {
    const { stdout } = await execFileAsync("forge", ["--version"], { cwd: root });
    return stdout.includes(`forge Version: ${versions.foundry}`);
  } catch {
    return false;
  }
}

async function buildContracts() {
  if (await localForgeMatches()) {
    await run("forge", ["build", "--root", "packages/contracts"]);
    return { foundry: versions.foundry, execution: "pinned-local" };
  }
  try {
    await execFileAsync("docker", ["image", "inspect", foundryImage], { cwd: root });
  } catch {
    throw new Error(`pinned forge ${versions.foundry} is unavailable; install it or pull ${foundryImage}`);
  }
  await run("docker", [
    "run", "--rm", "--user", `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    "--volume", `${root}:/workspace`, "--workdir", "/workspace", foundryImage,
    "forge build --root packages/contracts",
  ]);
  return { foundry: versions.foundry, execution: "pinned-container" };
}

try {
  const compiler = await buildContracts();
  let result;
  let nodeExecution = "pinned-local";
  if (process.versions.node === versions.node) {
    await run("node", ["tooling/check-bindings.mjs", "--skip-build"]);
    await run("pnpm", ["candidate:check"]);
    result = await buildLocalCandidate();
  } else {
    try {
      await execFileAsync("docker", ["image", "inspect", nodeImage], { cwd: root });
    } catch {
      throw new Error(`pinned Node ${versions.node} is unavailable; install it or pull ${nodeImage}`);
    }
    await run("docker", [
      "run", "--rm", "--user", `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      "--volume", `${root}:/workspace`, "--workdir", "/workspace", nodeImage, "sh", "-lc",
      "node tooling/check-bindings.mjs --skip-build && corepack pnpm candidate:check && node tooling/release-candidate.mjs build",
    ]);
    result = JSON.parse(await readFile(resolve(root, ".local/release-candidate/coston2-v2.build.json"), "utf8"));
    result.path = ".local/release-candidate/coston2-v2.build.json";
    nodeExecution = "pinned-container";
  }
  console.log(JSON.stringify({
    status: "local-build",
    verified: false,
    deployableRelease: false,
    compiler,
    node: versions.node,
    nodeExecution,
    pinnedNode: versions.node,
    pinnedNodeMatched: result.buildEnvironment?.pinnedNodeMatched === true,
    sourceTreeClean: result.sourceTreeClean,
    path: result.path,
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
