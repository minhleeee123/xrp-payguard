import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keccak256, stringToHex } from "viem";
import {
  buildSimulatedLifecycleEvidence,
  compileProtocolRuntime,
  parseSimulatedLifecycleCLI,
} from "./coston2-simulated-lifecycle.mjs";
import { assertPublicSafe, assertSimulationEvidence } from "./public-web-evidence.mjs";

const hash = (label) => keccak256(stringToHex(label));
const address = (digit) => `0x${digit.repeat(40)}`;
const transaction = (label, block) => ({
  transactionHash: hash(label),
  blockNumber: String(block),
  receiptStatus: "success",
  eventName: label,
  eventVerified: true,
});

function observation() {
  return {
    chainId: 114,
    mode: "SIMULATED_TEE_ONCHAIN",
    recordedAt: "2026-08-09T00:00:00.000Z",
    sourceCommit: "a".repeat(40),
    observedBlock: "123",
    transactionCount: 14,
    publicIdentifiers: {
      owner: address("1"),
      asset: address("2"),
      contracts: { registry: address("3"), vault: address("4"), router: address("5") },
      policyId: hash("policy"),
      policyCommitment: hash("commitment"),
      machines: [0, 1, 2].map((index) => ({
        machineId: hash(`machine-${index}`),
        keyFingerprint: hash(`fingerprint-${index}`),
        signer: address(String(index + 6)),
      })),
    },
    lifecycle: {
      machineRegistrations: [transaction("MachineRegistered", 1)],
      policyRegistration: transaction("PolicyRegistered", 2),
      recurringAllow: { requestId: hash("allow"), execution: transaction("RequestExecuted", 3) },
      capDenial: { requestId: hash("deny"), publicReasonClass: "CAP_EXCEEDED" },
      emergencyStop: { ...transaction("PolicyStopped", 4), stoppedRequestRejected: true },
      resume: transaction("PolicyResumed", 5),
      revoke: { ...transaction("PolicyRevoked", 6), revokedRequestRejected: true },
    },
    accounting: {
      before: { deposited: "100", available: "100", reserved: "0", spent: "0", withdrawn: "0", refunded: "0" },
      afterAllow: { deposited: "100", available: "90", reserved: "0", spent: "10", withdrawn: "0", refunded: "0" },
      afterDeny: { deposited: "100", available: "90", reserved: "0", spent: "10", withdrawn: "0", refunded: "0" },
      executedAmountUBA: "10",
    },
  };
}

describe("Coston2 simulated TEE lifecycle CLI", () => {
  it("keeps plan read-only and requires two explicit broadcast capabilities", () => {
    assert.deepEqual(parseSimulatedLifecycleCLI([]), { mode: "plan", broadcast: false, confirmed: false });
    assert.deepEqual(parseSimulatedLifecycleCLI(["run", "--broadcast", "--confirm-simulated-tee-onchain"]), {
      mode: "run",
      broadcast: true,
      confirmed: true,
    });
    assert.throws(() => parseSimulatedLifecycleCLI(["run", "--broadcast"]), /requires/);
    assert.throws(() => parseSimulatedLifecycleCLI(["plan", "--broadcast"]), /read-only/);
    assert.throws(() => parseSimulatedLifecycleCLI(["run", "--private-key=unsafe"]), /credentials/);
  });

  it("compiles the canonical TypeScript protocol runtime instead of copying its evaluator", async () => {
    const compiled = await compileProtocolRuntime();
    try {
      assert.equal(typeof compiled.runtime.evaluatePolicy, "function");
      assert.equal(typeof compiled.runtime.policyReceiptAttestationDigest, "function");
      assert.equal(compiled.runtime.publicReasonCode("CAP_EXCEEDED"), 9);
    } finally {
      await compiled.cleanup();
    }
  });

  it("emits only explicit public-safe on-chain simulation evidence", () => {
    const evidence = buildSimulatedLifecycleEvidence(observation());
    assert.equal(evidence.status, "coston2-simulated-pass");
    assert.equal(evidence.mode, "SIMULATED_TEE_ONCHAIN");
    assert.equal(evidence.assertions.hardwareTeeVerified, false);
    assert.equal(evidence.assertions.registeredMachinesVerified, false);
    assert.equal(evidence.assertions.onChainTransactionsVerified, true);
    assert.equal(JSON.stringify(evidence).includes("privateSalt"), false);
    assert.equal(JSON.stringify(evidence).includes("signature"), false);
    assert.doesNotThrow(() => assertPublicSafe(evidence));
    assert.doesNotThrow(() => assertSimulationEvidence(evidence));
    assert.throws(() => buildSimulatedLifecycleEvidence({ ...observation(), mode: "PRODUCTION" }), /invalid/);
  });
});
