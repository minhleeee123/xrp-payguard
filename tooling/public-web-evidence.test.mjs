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

test("collects current public-safe Coston2, simulation, and Vercel evidence", async () => {
  const entries = await collectPublicWebEvidence(root);
  assert.ok(entries.length >= 12);
  assert.ok(entries.some((entry) => entry.path === "evidence/web/vercel-preview-2026-08-09.json"));
  assert.ok(entries.some((entry) => entry.path === "evidence/simulation/fcc-local-three-machine-2026-08-09.json"));
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
});

test("plugin emits each evidence asset and the index", async () => {
  const emitted = [];
  const plugin = createPublicWebEvidencePlugin(root);
  await plugin.generateBundle.call({ emitFile: (file) => emitted.push(file) });
  assert.ok(emitted.some((file) => file.fileName === "evidence/index.json"));
  assert.ok(emitted.some((file) => file.fileName === "evidence/coston2/contracts-deployment.json"));
  assert.ok(emitted.some((file) => file.fileName === "evidence/simulation/fcc-local-three-machine-2026-08-09.json"));
});
