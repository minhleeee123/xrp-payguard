import assert from "node:assert/strict";
import test from "node:test";
import type { Address, Hex } from "viem";
import { buildMultiOwnerEvidence, parseMultiOwnerCLI } from "./fcc-multi-owner-lifecycle.js";

const address = (byte: string) => `0x${byte.repeat(40 / byte.length)}` as Address;
const hash = (byte: string) => `0x${byte.repeat(64 / byte.length)}` as Hex;
const accounting = (available: bigint, spent: bigint, withdrawn = 0n) => ({ deposited: 500_000n, available, reserved: 0n, spent, withdrawn, refunded: 0n });

test("multi-owner runner requires explicit live-private and broadcast acknowledgements", () => {
  assert.equal(parseMultiOwnerCLI(["plan"]).plan, true);
  assert.throws(() => parseMultiOwnerCLI(["run", "--broadcast", "--relay", "https://relay.example.test"]), /write-live-private-policy/);
  assert.equal(parseMultiOwnerCLI(["run", "--broadcast", "--write-live-private-policy", "--relay", "https://relay.example.test"]).relayOrigin, "https://relay.example.test");
  assert.equal(parseMultiOwnerCLI(["cleanup", "--policy", hash("ab")]).cleanupPolicy, hash("ab"));
  assert.throws(() => parseMultiOwnerCLI(["cleanup"]), /exact bytes32/);
});

test("multi-owner runner builds public-safe evidence for a distinct policy owner", () => {
  const deny = (reason: "REQUESTER_DENIED" | "TARGET_DENIED" | "CAP_EXCEEDED", byte: string) => ({
    status: "threshold-submitted" as const,
    requestId: hash(`${byte}1`),
    routerStatus: 3 as const,
    decision: "DENY" as const,
    publicReasonClass: reason,
    instructionId: hash(`${byte}2`),
    transactions: { dispatch: hash(`${byte}3`), submit: [hash(`${byte}4`), hash(`${byte}5`)] },
    create: hash(`${byte}6`),
  });
  const result = buildMultiOwnerEvidence({
    sourceCommit: "1".repeat(40), relayOrigin: "https://relay.example.test", observedBlock: 1n,
    sourceAccount: address("11"), policyOwner: address("22"), authorizedRequester: address("33"), policyCommitment: hash("33"),
    funding: { ownerGas: hash("41"), ownerToken: hash("42"), requesterGas: hash("43") }, custodyFreeze: hash("43"),
    allow: { status: "threshold-submitted", requestId: hash("44"), routerStatus: 2, decision: "ALLOW", publicReasonClass: "OK", instructionId: hash("45"), transactions: { dispatch: hash("46"), submit: [hash("47"), hash("48")] }, create: hash("49"), execute: hash("50") },
    denies: { requester: deny("REQUESTER_DENIED", "6"), target: deny("TARGET_DENIED", "7"), cap: deny("CAP_EXCEEDED", "8") },
    governance: { stop: hash("51"), resume: hash("52"), revoke: hash("53") },
    cleanup: { withdraw: hash("54"), ownerTokenReturn: hash("55"), requesterTokenReturn: hash("56"), ownerGasReturn: hash("57"), requesterGasReturn: hash("58") },
    accounting: { before: accounting(500_000n, 0n), afterExecution: accounting(400_000n, 100_000n), afterWithdrawal: accounting(0n, 100_000n, 400_000n) },
    recordedAt: "2026-08-12T00:00:00.000Z",
  });
  assert.equal(result.assertions.independentOwnerRegisteredPolicy, true);
  assert.equal(result.assertions.requesterCreatedRequestWithoutOwnerSignature, true);
  assert.equal(result.assertions.unauthorizedRequesterDenied, true);
  assert.equal(result.assertions.nonOwnerGovernanceRejected, true);
  assert.equal(result.assertions.noPrivateKeyRecorded, true);
  const serialized = JSON.stringify(result, (_key, value) => typeof value === "bigint" ? value.toString() : value);
  for (const forbidden of ["privateKey", "ciphertext", "signature"]) assert.equal(serialized.includes(`\"${forbidden}\"`), false);
});
