import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateReleaseManifest } from "./check-release.mjs";

const bytes32 = (byte) => `0x${byte.repeat(64)}`;
const address = (byte) => `0x${byte.repeat(40)}`;

const validManifest = () => ({
  status: "verified",
  verified: true,
  network: { name: "flare-coston2", chainId: 114 },
  sourceCommit: "a".repeat(40),
  contracts: ["1", "2", "3"].map((byte, index) => ({
    name: ["PayGuardPolicyRegistry", "PayGuardVault", "PayGuardActionRouter"][index],
    address: address(byte),
    runtimeCodeHash: bytes32(byte),
    deploymentBlock: String(100 + index),
    deploymentTransactionHash: bytes32(String(Number(byte) + 3)),
  })),
  fcc: {
    extensionId: bytes32("4"),
    codeVersion: bytes32("5"),
    custodyThreshold: 3,
    resultThreshold: 2,
    machines: ["6", "7", "8"].map((byte, index) => ({
      machineId: bytes32(byte),
      keyFingerprint: bytes32(["9", "a", "b"][index]),
      signer: address(["c", "d", "e"][index]),
      origin: `https://fcc-${index + 1}.example/`,
    })),
  },
  bindings: { digest: bytes32("9") },
  evidence: { publicOnly: true, assertions: { source: true, runtime: true } },
});

describe("Coston2 release manifest gate", () => {
  it("accepts the complete public-safe verified shape", () => {
    assert.deepEqual(validateReleaseManifest(validManifest()), {
      status: "ok",
      sourceCommit: "a".repeat(40),
      network: { name: "flare-coston2", chainId: 114 },
      contractCount: 3,
      machineCount: 3,
    });
  });

  it("rejects wrong network, incomplete contracts, weak quorum, and duplicate machines", () => {
    const wrongNetwork = validManifest();
    wrongNetwork.network.chainId = 115;
    assert.throws(() => validateReleaseManifest(wrongNetwork), /Coston2/);

    const missingRuntime = validManifest();
    delete missingRuntime.contracts[0].runtimeCodeHash;
    assert.throws(() => validateReleaseManifest(missingRuntime), /runtimeCodeHash/);

    const weakQuorum = validManifest();
    weakQuorum.fcc.resultThreshold = 1;
    assert.throws(() => validateReleaseManifest(weakQuorum), /thresholds/);

    const duplicate = validManifest();
    duplicate.fcc.machines[2].machineId = duplicate.fcc.machines[0].machineId;
    assert.throws(() => validateReleaseManifest(duplicate), /distinct/);
  });

  it("rejects credential-bearing origins and private evidence fields", () => {
    const credentialOrigin = validManifest();
    credentialOrigin.fcc.machines[0].origin = ["https://", "user", ":", "pass", "@fcc.example/"].join("");
    assert.throws(() => validateReleaseManifest(credentialOrigin), /credential-free/);

    const privateEvidence = validManifest();
    privateEvidence.evidence.policyPlaintext = "must-not-exist";
    assert.throws(() => validateReleaseManifest(privateEvidence), /forbidden field/);
  });
});
