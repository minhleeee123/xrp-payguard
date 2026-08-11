import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildV2DeploymentEvidence, CODE_HASH, EXTENSION_ID, MACHINE_SIGNERS, TEE_MANAGER, validateV2DeploymentEvidence } from "./coston2-v2-deploy.mjs";

const hash = (digit) => `0x${digit.repeat(64)}`;
const address = (digit) => `0x${digit.repeat(40)}`;

function state() {
  const contract = (name, digit) => ({ name, address: address(digit), transactionHash: hash(digit), blockNumber: "33900000", runtimeCodeHash: hash(digit) });
  return {
    sourceCommit: "a".repeat(40),
    verifiedAt: "2026-08-11T00:00:00.000Z",
    observedBlock: "33900001",
    dependencies: { fTestXrp: address("f") },
    contracts: {
      registry: contract("PayGuardPolicyRegistryV2", "a"),
      vault: contract("PayGuardVault", "b"),
      router: contract("PayGuardActionRouter", "c"),
    },
    wiring: {
      vaultRouter: { transactionHash: hash("d"), blockNumber: "33900000", verified: true },
      supportedFTestXrp: { transactionHash: hash("e"), blockNumber: "33900000", verified: true },
    },
    machines: MACHINE_SIGNERS.map((signer, index) => ({ signer, machineId: `0x${"0".repeat(24)}${signer.slice(2).toLowerCase()}`, origin: `https://fcc-${index + 1}.example`, status: 2, simulated: true })),
  };
}

describe("Coston2 V2 simulated deployment evidence", () => {
  it("preserves live candidate and non-hardware boundaries", () => {
    const evidence = buildV2DeploymentEvidence(state());
    assert.equal(validateV2DeploymentEvidence(evidence), evidence);
    assert.equal(evidence.teeManager, TEE_MANAGER);
    assert.equal(evidence.extensionId, String(EXTENSION_ID));
    assert.equal(evidence.codeHash, CODE_HASH);
    assert.equal(evidence.verifiedRelease, false);
    assert.equal(evidence.hardwareTeeVerified, false);
  });

  it("rejects release promotion, missing machines, and secret fields", () => {
    const promoted = buildV2DeploymentEvidence(state());
    promoted.verifiedRelease = true;
    assert.throws(() => validateV2DeploymentEvidence(promoted), /boundaries/);

    const missing = buildV2DeploymentEvidence(state());
    missing.machines.pop();
    assert.throws(() => validateV2DeploymentEvidence(missing), /three live/);

    const secret = buildV2DeploymentEvidence(state());
    secret.privateKey = hash("1");
    assert.throws(() => validateV2DeploymentEvidence(secret), /forbidden field/);
  });
});
