import assert from "node:assert/strict";
import test from "node:test";
import { getAddress, type Hex } from "viem";
import { buildHostedLifecycleEvidence, parseHostedLifecycleCLI } from "./fcc-hosted-relay-lifecycle.js";

const hash = (character: string): Hex => `0x${character.repeat(64)}` as Hex;
const address = (character: string) => getAddress(`0x${character.repeat(40)}`);

test("hosted lifecycle CLI requires all write acknowledgements", () => {
  assert.equal(parseHostedLifecycleCLI(["plan"]).plan, true);
  assert.throws(() => parseHostedLifecycleCLI(["run", "--broadcast"]), /requires/);
  assert.throws(() => parseHostedLifecycleCLI(["run", "--broadcast", "--write-live-private-policy", "--relay", "http://relay.example"]), /HTTPS/);
  assert.equal(parseHostedLifecycleCLI(["run", "--broadcast", "--write-live-private-policy", "--relay", "https://relay.example"]).relayOrigin, "https://relay.example");
});

test("hosted lifecycle evidence is public-safe and explicit about simulated TEE", () => {
  const accounting = { deposited: 1_000_000n, available: 500_000n, reserved: 0n, spent: 500_000n, withdrawn: 0n, refunded: 0n };
  const machines = ["1", "2", "3"].map((character, index) => ({
    origin: `https://machine-${index + 1}.example`, teeId: address(character), machineId: hash(character),
    keyFingerprint: hash(String(index + 4)), signer: address(character), proxyId: address(String(index + 4)),
    publicKey: { x: hash("a"), y: hash("b") }, codeHash: hash("c"), platform: hash("d"), status: 2,
  }));
  const evidence = buildHostedLifecycleEvidence({
    sourceCommit: "a".repeat(40), relayOrigin: "https://relay.example", observedBlock: 10n,
    policyCommitment: hash("e"), custodyFreeze: hash("1"), machines,
    allow: { requestId: hash("2"), instructionId: hash("3"), create: hash("4"), dispatch: hash("5"), submit: [hash("6"), hash("7")], execute: hash("8") },
    deny: { requestId: hash("9"), instructionId: hash("a"), reason: "CAP_EXCEEDED", create: hash("b"), dispatch: hash("c"), submit: [hash("d"), hash("e")] },
    policyTransactions: { stop: hash("f"), resume: hash("1"), revoke: hash("2") },
    accounting: { before: { ...accounting, available: 600_000n, spent: 400_000n }, afterAllow: accounting, afterDeny: accounting },
    recordedAt: "2026-08-11T00:00:00.000Z",
  });
  const serialized = JSON.stringify(evidence, (_key, value) => typeof value === "bigint" ? value.toString() : value);
  for (const forbidden of ["privateKey", "ciphertext", "signature", "authorization", "policyPlaintext"]) assert.equal(serialized.includes(`\"${forbidden}\"`), false);
  assert.equal(evidence.assertions.clientDecisionAccepted, false);
  assert.equal(evidence.assertions.simulatedTee, true);
  assert.equal(evidence.assertions.hardwareAttestationVerified, false);
});
