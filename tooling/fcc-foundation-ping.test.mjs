import assert from "node:assert/strict";
import test from "node:test";

import { buildFoundationPingPayload, parseFoundationPingCLI } from "./fcc-foundation-ping.mjs";
import { PAYGUARD_FOUNDATION_SENDER } from "./fcc-code-version.mjs";

const hash = (byte) => `0x${byte.repeat(64)}`;

test("PING CLI requires explicit broadcast and normalizes image IDs", () => {
  assert.throws(() => parseFoundationPingCLI(["send", "--url", "https://machine.example", "--image-id", hash("1")]));
  assert.throws(() => parseFoundationPingCLI(["plan", "--broadcast", "--url", "https://machine.example", "--image-id", hash("1")]));
  const parsed = parseFoundationPingCLI(["send", "--broadcast", "--url", "https://machine.example", "--image-id", `sha256:${hash("2").slice(2)}`, "--leaf-crl", "/trusted/leaf.crl"]);
  assert.equal(parsed.expectedCodeHash, hash("2"));
  assert.equal(parsed.leafCRL, "/trusted/leaf.crl");
});

test("PING evidence is public-safe and keeps unresolved quorum blockers", () => {
  const evidence = buildFoundationPingPayload({
    instructionId: hash("1"), transactionHash: hash("2"), requestNonce: hash("3"), payloadHash: hash("4"),
    bindingHash: hash("5"), teeId: "0x1111111111111111111111111111111111111111",
    proxyId: "0x2222222222222222222222222222222222222222", resultHash: hash("6"), sourceCommit: "a".repeat(40), blockNumber: 400n,
  });
  assert.equal(evidence.publicIdentifiers.sender, PAYGUARD_FOUNDATION_SENDER);
  assert.deepEqual(evidence.blockers, ["THREE_MACHINE_CUSTODY_NOT_VERIFIED", "THRESHOLD_EVALUATION_NOT_VERIFIED"]);
  assert.doesNotMatch(JSON.stringify(evidence), /"(?:privateKey|private_key|signature|ciphertext|policyPlaintext|credential)"/i);
  assert.ok(Object.values(evidence.assertions).every((value) => value === true));
});
