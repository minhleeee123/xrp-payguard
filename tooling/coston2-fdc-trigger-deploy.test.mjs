import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildFdcTriggerDeploymentEvidence,
  deployFdcTrigger,
  MAX_PROOF_AGE_SECONDS,
  validateFdcTriggerDeploymentState,
} from "./coston2-fdc-trigger-deploy.mjs";
import { COSTON2_RPC_URL, FLARE_CONTRACT_REGISTRY } from "./coston2-deploy.mjs";

const address = (digit) => `0x${digit.repeat(40)}`;
const hash = (digit) => `0x${digit.repeat(64)}`;

function completeState() {
  return {
    schemaVersion: 1,
    status: "verified",
    sourceCommit: "a".repeat(40),
    deployer: address("d"),
    network: { name: "flare-coston2", chainId: 114, rpcUrl: COSTON2_RPC_URL },
    dependencies: {
      flareContractRegistry: FLARE_CONTRACT_REGISTRY,
      fdcVerification: address("f"),
      router: address("c"),
    },
    artifact: { name: "PayGuardXrplFdcTrigger", creationCodeHash: hash("1") },
    configuration: { maxProofAgeSeconds: MAX_PROOF_AGE_SECONDS.toString() },
    deployment: {
      address: address("a"),
      nonce: "8",
      transactionHash: hash("2"),
      blockNumber: "100",
      receiptStatus: "success",
      runtimeCodeHash: hash("3"),
      runtimeBytes: 4_473,
      runtimeVerified: true,
    },
    observedBlock: "102",
    verifiedAt: "2026-08-09T00:00:00.000Z",
    assertions: {
      chainIdVerified: true,
      sourceCommitCleanAtBroadcast: true,
      coreRouterRuntimeVerified: true,
      runtimeFdcVerificationResolved: true,
      deploymentReceiptSuccessful: true,
      runtimeCodeVerified: true,
      constructorBindingsVerified: true,
      proofAgeBoundVerified: true,
    },
  };
}

describe("Coston2 XRPL FDC trigger deployment", () => {
  it("requires an explicit broadcast capability", async () => {
    await assert.rejects(() => deployFdcTrigger(), /explicit --broadcast/);
  });

  it("accepts only a complete public verified state", () => {
    const state = completeState();
    assert.equal(validateFdcTriggerDeploymentState(state, { requireComplete: true }), state);

    const secret = completeState();
    secret.privateKey = hash("9");
    assert.throws(() => validateFdcTriggerDeploymentState(secret), /forbidden field/);

    const wrongAge = completeState();
    wrongAge.configuration.maxProofAgeSeconds = "999";
    assert.throws(() => validateFdcTriggerDeploymentState(wrongAge), /proof age/);

    const incomplete = completeState();
    delete incomplete.assertions.runtimeCodeVerified;
    assert.throws(() => validateFdcTriggerDeploymentState(incomplete, { requireComplete: true }), /assertions/);
  });

  it("builds release-limited evidence without upgrading live claims", () => {
    const evidence = buildFdcTriggerDeploymentEvidence(completeState());
    assert.equal(evidence.suite, "payguard-coston2-xrpl-fdc-trigger-deployment");
    assert.equal(evidence.assertions.noFdcProofConsumed, true);
    assert.equal(evidence.assertions.noRequestCreated, true);
    assert.equal(evidence.assertions.noFccResultClaimed, true);
    assert.ok(evidence.blockers.includes("PRIVATE_FDC_DESCRIPTOR_EVALUATION_NOT_IMPLEMENTED"));
    assert.equal("signature" in evidence, false);
    assert.doesNotMatch(JSON.stringify(evidence), /"(?:privateKey|password|credential|seed)"\s*:/i);
  });
});
