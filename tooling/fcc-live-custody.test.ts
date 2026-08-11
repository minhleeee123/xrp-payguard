import assert from "node:assert/strict";
import test from "node:test";

import { getAddress, type Hex } from "viem";

import { buildSanitizedCustodyEvidence, parseLiveCustodyCLI } from "./fcc-live-custody.js";

const hash = (character: string): Hex => `0x${character.repeat(64)}` as Hex;
const address = (character: string) => getAddress(`0x${character.repeat(40)}`);

test("live custody CLI requires an explicit private write acknowledgement", () => {
  assert.equal(parseLiveCustodyCLI(["plan"]).mode, "plan");
  assert.throws(() => parseLiveCustodyCLI(["run"]), /requires --write-live-private-policy/);
  assert.throws(() => parseLiveCustodyCLI(["freeze", "--write-live-private-policy"]), /requires --broadcast/);
  assert.throws(() => parseLiveCustodyCLI(["plan", "--write-live-private-policy"]), /plan cannot/);
  assert.throws(() => parseLiveCustodyCLI(["run", "--write-live-private-policy", "--url", "http:\/\/unsafe.example"]), /HTTPS/);
  assert.equal(
    parseLiveCustodyCLI(["freeze", "--write-live-private-policy", "--broadcast", "--relay", "https://relay.example"]).relayOrigin,
    "https://relay.example",
  );
  assert.throws(() => parseLiveCustodyCLI(["freeze", "--write-live-private-policy", "--broadcast", "--relay", "http://relay.example"]), /HTTPS/);
});

test("public evidence includes only sanitized custody facts", () => {
  const machines = ["1", "2", "3"].map((character, index) => ({
    origin: `https://machine-${index + 1}.example`,
    teeId: address(character),
    machineId: hash(character),
    keyFingerprint: hash(String(index + 4)),
    signer: address(character),
    proxyId: address(String(index + 4)),
    publicKey: { x: hash("a"), y: hash("b") },
    codeHash: hash("c"),
    platform: hash("d"),
    status: 2,
  }));
  const evidence = buildSanitizedCustodyEvidence({
    sourceCommit: "a".repeat(40),
    observedBlock: 123n,
    policyCommitment: hash("e"),
    bundleHash: hash("f"),
    machines,
    receiptDigests: [hash("6"), hash("7"), hash("8")],
    recordedAt: "2026-08-11T00:00:00.000Z",
  });
  const keys: string[] = [];
  const walk = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) { keys.push(key); walk(child); }
  };
  walk(evidence);
  for (const forbidden of ["privateKey", "ciphertext", "signature", "policyPlaintext", "authorization"]) {
    assert.equal(keys.includes(forbidden), false);
  }
  assert.equal(evidence.assertions.allThreeReceiptSignersVerified, true);
  assert.equal(evidence.assertions.hardwareAttestationVerified, false);
  assert.equal(evidence.publicIdentifiers.machines.length, 3);
});

test("public evidence rejects duplicate machine identities", () => {
  const machine = {
    origin: "https://machine.example",
    teeId: address("1"),
    machineId: hash("1"),
    keyFingerprint: hash("2"),
    signer: address("1"),
    proxyId: address("2"),
    publicKey: { x: hash("a"), y: hash("b") },
    codeHash: hash("c"),
    platform: hash("d"),
    status: 2,
  };
  assert.throws(() => buildSanitizedCustodyEvidence({
    sourceCommit: "a".repeat(40),
    observedBlock: 123n,
    policyCommitment: hash("e"),
    bundleHash: hash("f"),
    machines: [machine, machine, machine],
    receiptDigests: [hash("6"), hash("7"), hash("8")],
  }), /identities must be distinct/);
});
