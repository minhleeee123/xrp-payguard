import { execFileSync } from "node:child_process";
import process from "node:process";

const root = new URL("../", import.meta.url).pathname;
const context = `${root}apps/fcc-extension`;
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sourceDateEpoch = execFileSync("git", ["show", "-s", "--format=%ct", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const tags = ["a", "b"].map((suffix) => `xrp-payguard/fcc-extension:repro-${process.pid}-${suffix}`);

function docker(args, capture = false) {
  return execFileSync("docker", args, { cwd: root, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
}

function build(tag) {
  docker([
    "buildx", "build", "--load", "--no-cache", "--provenance=false", "--platform", "linux/amd64",
    "--build-arg", `SOURCE_COMMIT=${sourceCommit}`, "--build-arg", `SOURCE_DATE_EPOCH=${sourceDateEpoch}`,
    "--tag", tag, context,
  ]);
  return docker(["image", "inspect", "--format", "{{.Id}}", tag], true).trim();
}

try {
  const first = build(tags[0]);
  const second = build(tags[1]);
  if (!/^sha256:[0-9a-f]{64}$/.test(first) || first !== second) throw new Error("FCC image builds are not byte-identical");
  process.stdout.write(`${JSON.stringify({ status: "ok", platform: "linux/amd64", imageId: first, sourceCommit })}\n`);
} finally {
  for (const tag of tags) {
    try { docker(["image", "rm", "--force", tag]); } catch {}
  }
}
