import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { validateReleaseArtifacts, validateReleaseManifest } from "./check-release.mjs";

const bytes32 = (byte) => `0x${byte.repeat(64)}`;
const address = (byte) => `0x${byte.repeat(40)}`;
const machineId = (signer) => `0x${"0".repeat(24)}${signer.slice(2)}`;
const fingerprint = (prefix, signer) => `0x${prefix.repeat(24)}${signer.slice(2)}`;

const validManifest = () => ({
  status: "verified",
  verified: true,
  network: { name: "flare-coston2", chainId: 114 },
  sourceCommit: "a".repeat(40),
  contracts: ["1", "2", "3"].map((byte, index) => ({
    name: ["PayGuardPolicyRegistryV2", "PayGuardVault", "PayGuardActionRouter"][index],
    address: address(byte),
    runtimeCodeHash: bytes32(byte),
    deploymentBlock: String(100 + index),
    deploymentTransactionHash: bytes32(String(Number(byte) + 3)),
  })),
  fcc: {
    teeManager: address("f"),
    teeManagerSourceSha256: bytes32("f"),
    extensionId: bytes32("4"),
    codeVersion: bytes32("5"),
    codeHash: bytes32("5"),
    registryContract: "PayGuardPolicyRegistryV2",
    machineAuthorization: "official-manager-live-recheck",
    simulated: false,
    registeredMachinesVerified: true,
    custodyThreshold: 3,
    resultThreshold: 2,
    machines: ["c", "d", "e"].map((byte, index) => {
      const signer = address(byte);
      return {
        machineId: machineId(signer),
        keyFingerprint: fingerprint(["9", "a", "b"][index], signer),
        signer,
        origin: `https://fcc-${index + 1}.example/`,
      };
    }),
  },
  bindings: { digest: bytes32("9") },
  evidence: {
    publicOnly: true,
    assertions: {
      source: true,
      runtime: true,
      officialTeeManagerVerified: true,
      machineStatusRecheckedAtResult: true,
      ownerOnlyPolicyLifecycleVerified: true,
      boundedGovernanceVerified: true,
      canonicalLifecycleVerified: true,
      outageDrillsVerified: true,
      canonicalRedemptionVerified: true,
      userValidationVerified: true,
    },
    artifacts: Object.fromEntries(["lifecycle", "outageDrills", "redemption", "userValidation"].map((name, index) => [name, {
      path: `evidence/coston2/${name}.json`,
      sha256: bytes32(String(index + 6)),
    }])),
  },
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
    duplicate.fcc.machines[2].keyFingerprint = duplicate.fcc.machines[0].keyFingerprint;
    duplicate.fcc.machines[2].signer = duplicate.fcc.machines[0].signer;
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

  it("rejects V1, foreign-manager, and simulated FCC release claims", () => {
    const v1 = validManifest();
    v1.contracts[0].name = "PayGuardPolicyRegistry";
    assert.throws(() => validateReleaseManifest(v1), /PayGuardPolicyRegistryV2/);

    const missingManagerSource = validManifest();
    delete missingManagerSource.fcc.teeManagerSourceSha256;
    assert.throws(() => validateReleaseManifest(missingManagerSource), /teeManagerSourceSha256/);

    const simulated = validManifest();
    simulated.fcc.simulated = true;
    assert.throws(() => validateReleaseManifest(simulated), /non-simulated/);

    const noResultRecheck = validManifest();
    noResultRecheck.evidence.assertions.machineStatusRecheckedAtResult = false;
    assert.throws(() => validateReleaseManifest(noResultRecheck), /machineStatusRecheckedAtResult/);

    const noOutageDrills = validManifest();
    noOutageDrills.evidence.assertions.outageDrillsVerified = false;
    assert.throws(() => validateReleaseManifest(noOutageDrills), /outageDrillsVerified/);

    const missingLifecycleArtifact = validManifest();
    delete missingLifecycleArtifact.evidence.artifacts.lifecycle;
    assert.throws(() => validateReleaseManifest(missingLifecycleArtifact), /lifecycle/);

    const foreignSignerBinding = validManifest();
    foreignSignerBinding.fcc.machines[0].machineId = bytes32("1");
    assert.throws(() => validateReleaseManifest(foreignSignerBinding), /bind the exact TEE signer/);
  });

  it("digest-binds and dispatches every referenced live artifact", async () => {
    const manifest = validManifest();
    const calls = [];
    const payloads = {};
    const validators = {};
    for (const name of ["lifecycle", "outageDrills", "redemption", "userValidation"]) {
      const bytes = Buffer.from(JSON.stringify({ kind: name }));
      payloads[manifest.evidence.artifacts[name].path] = bytes;
      manifest.evidence.artifacts[name].sha256 = `0x${createHash("sha256").update(bytes).digest("hex")}`;
      validators[name] = (value) => calls.push(value.kind);
    }
    assert.deepEqual(await validateReleaseArtifacts(manifest, {
      validators,
      readArtifact: async (path) => payloads[path],
    }), { status: "ok", liveArtifactCount: 4 });
    assert.deepEqual(calls, ["lifecycle", "outageDrills", "redemption", "userValidation"]);

    manifest.evidence.artifacts.lifecycle.sha256 = bytes32("f");
    await assert.rejects(() => validateReleaseArtifacts(manifest, { validators, readArtifact: async (path) => payloads[path] }), /digest mismatch/);
  });
});
