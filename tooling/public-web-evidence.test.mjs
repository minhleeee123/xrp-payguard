import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import {
  assertPublicSafe,
  assertSimulationEvidence,
  buildPublicWebEvidenceManifest,
  collectPublicWebEvidence,
  createPublicWebEvidencePlugin,
} from "./public-web-evidence.mjs";

const root = resolve(import.meta.dirname, "..");

test("collects public-safe Coston2 and simulation evidence without self-reference", async () => {
  const entries = await collectPublicWebEvidence(root);
  assert.ok(entries.length >= 11);
  assert.ok(entries.some((entry) => entry.path === "evidence/simulation/fcc-local-three-machine-2026-08-09.json"));
  assert.equal(entries.some((entry) => entry.path.startsWith("evidence/web/")), false);
  assert.equal(entries.some((entry) => entry.path.includes("github-pages")), false);
  for (const entry of entries) assert.equal(entry.data.testnetOnly === true || entry.data.assertions?.testnetOnly === true, true);
});

test("manifest exposes public metadata without copying evidence payload into the index", async () => {
  const entries = await collectPublicWebEvidence(root);
  const manifest = buildPublicWebEvidenceManifest(entries);
  assert.equal(manifest.status, "AVAILABLE");
  assert.equal(manifest.testnetOnly, true);
  assert.equal(manifest.staticShellOnly, true);
  assert.equal(Array.isArray(manifest.entries), true);
  assert.equal(JSON.stringify(manifest).includes("privateSalt"), false);
  assert.equal(JSON.stringify(manifest).includes("ciphertext"), false);
  assert.equal(manifest.entries.every((entry) => entry.noPrivateKeyRecorded
    && entry.noCredentialRecorded && entry.noPolicyPlaintextOrCiphertextRecorded), true);
  assert.equal(manifest.entries.find((entry) => entry.path === "/evidence/coston2/contracts-deployment.json")?.chainId, "114");
  assert.equal(manifest.entries.find((entry) => entry.path === "/evidence/simulation/fcc-local-three-machine-2026-08-09.json")?.chainId, null);
  assert.throws(() => buildPublicWebEvidenceManifest([{
    path: "evidence/coston2/unsafe.json",
    data: { secret: "not-public" },
  }]), /forbidden public-evidence field/);
});

test("rejects private fields and key material", () => {
  assert.throws(() => assertPublicSafe({ secret: "value" }), /forbidden public-evidence field/);
  const pem = ["-----BEGIN EC ", "PRIVATE KEY-----"].join("");
  assert.throws(() => assertPublicSafe({ payload: pem }), /private-key material/);
  assert.doesNotThrow(() => assertPublicSafe({ noPrivateKeyRecorded: true, notes: ["public only"] }));
});

test("rejects simulation evidence that upgrades a live FCC claim", () => {
  const simulation = {
    status: "local-simulated-pass",
    mode: "SIMULATED_TEE",
    network: { publicChainConnected: false },
    assertions: {
      simulationOnly: true,
      hardwareTeeVerified: false,
      registeredMachinesVerified: false,
      stableHttpsOriginsVerified: false,
      authenticatedIndexerVerified: false,
      noLiveFccResultClaimed: true,
      noPayGuardReleaseClaimed: true,
    },
  };
  assert.doesNotThrow(() => assertSimulationEvidence(simulation));
  assert.throws(() => assertSimulationEvidence({
    ...simulation,
    assertions: { ...simulation.assertions, hardwareTeeVerified: true },
  }), /explicit non-live simulation/);
  const onChain = {
    status: "coston2-simulated-pass",
    mode: "SIMULATED_TEE_ONCHAIN",
    network: { name: "flare-coston2", chainId: 114, publicChainConnected: true },
    assertions: {
      ...simulation.assertions,
      payGuardLocalMachineEntriesVerified: true,
      onChainTransactionsVerified: true,
    },
  };
  assert.doesNotThrow(() => assertSimulationEvidence(onChain));
  assert.throws(() => assertSimulationEvidence({
    ...onChain,
    assertions: { ...onChain.assertions, registeredMachinesVerified: true },
  }), /explicit non-live simulation/);
});

test("plugin emits each evidence asset and the index", async () => {
  const emitted = [];
  const plugin = createPublicWebEvidencePlugin(root);
  await plugin.generateBundle.call({ emitFile: (file) => emitted.push(file) });
  assert.ok(emitted.some((file) => file.fileName === "evidence/index.json"));
  assert.ok(emitted.some((file) => file.fileName === "evidence/coston2/contracts-deployment.json"));
  assert.ok(emitted.some((file) => file.fileName === "evidence/simulation/fcc-local-three-machine-2026-08-09.json"));
  assert.equal(emitted.some((file) => file.fileName?.startsWith("evidence/web/")), false);
});

test("development middleware serves only scanner-approved same-origin JSON", async () => {
  const plugin = createPublicWebEvidencePlugin(root);
  let middleware;
  await plugin.configureServer({ middlewares: { use: (handler) => { middleware = handler; } } });
  assert.equal(typeof middleware, "function");
  const headers = new Map();
  let body = "";
  let nextCalled = false;
  const response = {
    statusCode: 0,
    setHeader: (name, value) => headers.set(name, value),
    end: (value) => { body = value; },
  };
  middleware({ url: "/evidence/simulation/coston2-simulated-policy-lifecycle-2026-08-09.json" }, response, () => { nextCalled = true; });
  assert.equal(response.statusCode, 200);
  assert.equal(headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(headers.get("cache-control"), "no-store");
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(JSON.parse(body).assertions.simulationOnly, true);
  assert.equal(nextCalled, false);

  middleware({ url: "/src/main.ts" }, response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
