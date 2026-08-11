import assert from "node:assert/strict";
import test from "node:test";

import { buildDispatcherEvidence, parseDispatcherCLI } from "./fcc-dispatcher-deploy.mjs";

test("dispatcher CLI requires explicit broadcast authority", () => {
  assert.deepEqual(parseDispatcherCLI(["plan"]), { mode: "plan", broadcast: false });
  assert.throws(() => parseDispatcherCLI(["deploy"]), /requires --broadcast/);
  assert.throws(() => parseDispatcherCLI(["plan", "--broadcast"]), /cannot broadcast/);
});

test("dispatcher evidence remains public-safe and simulated", () => {
  const evidence = buildDispatcherEvidence({
    sourceCommit: "a".repeat(40),
    observedBlock: 123n,
    dispatcher: `0x${"1".repeat(40)}`,
    runtimeHash: `0x${"2".repeat(64)}`,
    deploymentTransaction: `0x${"3".repeat(64)}`,
    managerUpdateTransaction: `0x${"4".repeat(64)}`,
    extensionBindingTransaction: `0x${"5".repeat(64)}`,
    recordedAt: "2026-08-11T00:00:00.000Z",
  });
  assert.equal(evidence.assertions.clientDecisionFieldAbsent, true);
  assert.equal(evidence.assertions.liveThresholdEvaluationVerified, false);
  assert.equal(evidence.assertions.hardwareAttestationVerified, false);
  const keys = [];
  const walk = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) { keys.push(key); walk(child); }
  };
  walk(evidence);
  for (const forbidden of ["privateKey", "credential", "policyPlaintext", "ciphertext", "signature"]) assert.equal(keys.includes(forbidden), false);
});
