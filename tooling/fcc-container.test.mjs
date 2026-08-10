import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const dockerfile = readFileSync(new URL("apps/fcc-extension/Dockerfile", root), "utf8");
const dockerignore = readFileSync(new URL("apps/fcc-extension/Dockerfile.dockerignore", root), "utf8");
const compose = readFileSync(new URL("apps/fcc-extension/compose.local.yaml", root), "utf8");

test("FCC image pins every executable build input and defaults to production mode", () => {
  const imageLines = dockerfile.split("\n").filter((line) => line.startsWith("FROM "));
  assert.equal(imageLines.length, 2);
  for (const line of imageLines) assert.match(line, /@sha256:[0-9a-f]{64}(?:\s|$)/);
  assert.match(dockerfile.split("\n", 1)[0], /^# syntax=.*@sha256:[0-9a-f]{64}$/);
  assert.match(dockerfile, /ENV MODE=0 \\\n\s+SIMULATED_TEE=false/);
  assert.match(dockerfile, /CGO_ENABLED=0/);
  assert.match(dockerfile, /-trimpath/);
  assert.match(dockerfile, /-buildid=/);
  assert.doesNotMatch(dockerfile, /(?:ARG|ENV)\s+[^\n]*(?:PRIVATE_KEY|SECRET|TOKEN|PASSWORD|SEED)/i);
});

test("FCC build context excludes local credentials and non-runtime files", () => {
  for (const pattern of [".env", ".env.*", "**/*_test.go", "**/*.log"]) assert.ok(dockerignore.split("\n").includes(pattern));
});

test("local compose is explicit simulation with loopback-only hardened ingress", () => {
  for (const service of ["payguard-fcc-a", "payguard-fcc-b", "payguard-fcc-c"]) assert.match(compose, new RegExp(`^  ${service}:`, "m"));
  assert.match(compose, /MODE: "1"/);
  assert.match(compose, /SIMULATED_TEE: "true"/);
  assert.match(compose, /PAYGUARD_POLICY_STORE_DIR: \/var\/lib\/payguard\/policies/);
  assert.match(compose, /\/var\/lib\/payguard:size=16m,mode=0700/);
  assert.match(compose, /pull_policy: never/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /cap_drop:\n\s+- ALL/);
  assert.match(compose, /no-new-privileges:true/);
  assert.equal((compose.match(/127\.0\.0\.1:/g) ?? []).length, 3);
  assert.doesNotMatch(compose, /env_file|PRIVATE_KEY|PASSWORD|TOKEN|SECRET|SEED/i);
});
