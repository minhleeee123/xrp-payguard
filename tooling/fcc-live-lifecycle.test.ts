import assert from "node:assert/strict";
import test from "node:test";

import { getAddress, type Hex } from "viem";

import { buildSanitizedLifecycleEvidence, parseLifecycleCLI } from "./fcc-live-lifecycle.js";

const hash = (character: string): Hex => `0x${character.repeat(64)}` as Hex;
const address = (character: string) => getAddress(`0x${character.repeat(40)}`);
const transactionSet = (offset: number, execute = false) => ({
  create: hash(String(offset)), dispatch: hash(String(offset + 1)),
  submit: [hash(String(offset + 2)), hash(String(offset + 3))] as [Hex, Hex],
  ...(execute ? { execute: hash(String(offset + 4)) } : {}),
});
const accounting = (available: bigint, spent: bigint) => ({
  deposited: 1_000_000n, available, reserved: 0n, spent, withdrawn: 0n,
  refunded: 1_000_000n - available - spent,
});
const executorPause = {
  pendingStatus: 1, startedBlock: 100n, resumedBlock: 110n,
  observedDurationMs: 15_000, accountingStable: true,
};

test("live lifecycle CLI requires both explicit write acknowledgements", () => {
  assert.equal(parseLifecycleCLI(["plan"]).plan, true);
  assert.throws(() => parseLifecycleCLI(["run", "--broadcast"]), /requires --broadcast/);
  assert.throws(() => parseLifecycleCLI(["run", "--write-live-private-policy"]), /requires --broadcast/);
  assert.equal(parseLifecycleCLI(["run", "--broadcast", "--write-live-private-policy"]).broadcast, true);
  assert.equal(parseLifecycleCLI(["run", "--broadcast", "--write-live-private-policy", "--replacement"]).replacement, true);
});

test("live lifecycle evidence is sanitized and preserves conservation claims", () => {
  const machines = ["1", "2", "3"].map((character, index) => ({
    origin: `https://machine-${index + 1}.example`, teeId: address(character), machineId: hash(character),
    keyFingerprint: hash(String(index + 4)), signer: address(character), proxyId: address(String(index + 4)),
    publicKey: { x: hash("a"), y: hash("b") }, codeHash: hash("c"), platform: hash("d"), status: 2,
  }));
  const before = accounting(900_000n, 100_000n);
  const after = accounting(800_000n, 200_000n);
  const evidence = buildSanitizedLifecycleEvidence({
    sourceCommit: "a".repeat(40), observedBlock: 123n, policyCommitment: hash("e"), custodyFreeze: hash("f"), machines,
    allow: { instructionId: hash("6"), digest: hash("7"), transactions: transactionSet(1, true), status: 4, accountingBefore: before, accountingAfter: after, executorPause },
    deny: { instructionId: hash("8"), digest: hash("9"), reason: "CAP_EXCEEDED", transactions: transactionSet(5), status: 3, accountingAfter: after },
    policyTransactions: { stop: hash("a"), resume: hash("b"), revoke: hash("c") }, recordedAt: "2026-08-11T00:00:00.000Z",
  });
  const serialized = JSON.stringify(evidence, (_key, value) => typeof value === "bigint" ? value.toString() : value);
  for (const forbidden of ["privateKey", "ciphertext", "signature", "policyPlaintext", "authorization"]) assert.equal(serialized.includes(`\"${forbidden}\"`), false);
  assert.equal(evidence.assertions.twoMatchingAllowVerified, true);
  assert.equal(evidence.assertions.twoMatchingDenyVerified, true);
  assert.equal(evidence.assertions.fullExecutorPauseRecoveryVerified, true);
  assert.equal(evidence.assertions.noPrivateKeyRecorded, true);
  assert.equal(evidence.assertions.hardwareAttestationVerified, false);
});

test("live lifecycle evidence rejects accounting changes on DENY", () => {
  const machines = ["1", "2", "3"].map((character, index) => ({
    origin: `https://machine-${index + 1}.example`, teeId: address(character), machineId: hash(character),
    keyFingerprint: hash(String(index + 4)), signer: address(character), proxyId: address(String(index + 4)),
    publicKey: { x: hash("a"), y: hash("b") }, codeHash: hash("c"), platform: hash("d"), status: 2,
  }));
  assert.throws(() => buildSanitizedLifecycleEvidence({
    sourceCommit: "a".repeat(40), observedBlock: 123n, policyCommitment: hash("e"), custodyFreeze: hash("f"), machines,
    allow: { instructionId: hash("6"), digest: hash("7"), transactions: transactionSet(1, true), status: 4, accountingBefore: accounting(900_000n, 100_000n), accountingAfter: accounting(800_000n, 200_000n), executorPause },
    deny: { instructionId: hash("8"), digest: hash("9"), reason: "CAP_EXCEEDED", transactions: transactionSet(5), status: 3, accountingAfter: accounting(799_999n, 200_001n) },
    policyTransactions: { stop: hash("a"), resume: hash("b"), revoke: hash("c") },
  }), /conservation/);
});

test("live lifecycle evidence rejects an unobserved executor pause", () => {
  const machines = ["1", "2", "3"].map((character, index) => ({
    origin: `https://machine-${index + 1}.example`, teeId: address(character), machineId: hash(character),
    keyFingerprint: hash(String(index + 4)), signer: address(character), proxyId: address(String(index + 4)),
    publicKey: { x: hash("a"), y: hash("b") }, codeHash: hash("c"), platform: hash("d"), status: 2,
  }));
  assert.throws(() => buildSanitizedLifecycleEvidence({
    sourceCommit: "a".repeat(40), observedBlock: 123n, policyCommitment: hash("e"), custodyFreeze: hash("f"), machines,
    allow: {
      instructionId: hash("6"), digest: hash("7"), transactions: transactionSet(1, true), status: 4,
      accountingBefore: accounting(900_000n, 100_000n), accountingAfter: accounting(800_000n, 200_000n),
      executorPause: { ...executorPause, accountingStable: false },
    },
    deny: { instructionId: hash("8"), digest: hash("9"), reason: "CAP_EXCEEDED", transactions: transactionSet(5), status: 3, accountingAfter: accounting(800_000n, 200_000n) },
    policyTransactions: { stop: hash("a"), resume: hash("b"), revoke: hash("c") },
  }), /executor pause/);
});
