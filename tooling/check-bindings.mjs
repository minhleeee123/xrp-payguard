import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
execFileSync("forge", ["build", "--root", "packages/contracts"], { cwd: root, stdio: "ignore" });
const temporary = await mkdtemp(resolve(tmpdir(), "payguard-bindings-"));
const expected = resolve(temporary, "generated.ts");
try {
  execFileSync("node", [resolve(root, "tooling/generate-bindings.mjs"), expected], { cwd: root, stdio: "ignore" });
  const [actualText, expectedText] = await Promise.all([
    readFile(resolve(root, "packages/bindings/src/generated.ts"), "utf8"),
    readFile(expected, "utf8"),
  ]);
  if (actualText !== expectedText) throw new Error("generated bindings are stale; run pnpm bindings:generate");
  console.log(JSON.stringify({ status: "ok", source: "packages/contracts/out", target: "packages/bindings/src/generated.ts" }));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
