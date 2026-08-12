import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { getAddress, zeroAddress } from "viem";

import { deployFoundationRegistration } from "./fcc-foundation-deploy.mjs";
import {
  buildFoundationRegistrationEvidence,
  COSTON2_RPC_URL,
  evaluateFoundationRegistration,
  FCC_DEPLOYMENTS_PATH,
  FCC_DEPLOYMENTS_URL,
  FCC_LEGACY_SCAFFOLD_COMMIT,
  FCC_SCAFFOLD_COMMIT,
  FCC_SCAFFOLD_REPOSITORY,
  FCC_TEE_MANAGER,
  resolveOfficialTeeManager,
  validateFoundationRegistrationState,
} from "./fcc-foundation-registration.mjs";

const address = (digit) => getAddress(`0x${digit.repeat(40)}`);
const hash = (digit) => `0x${digit.repeat(64)}`;

function verificationInput() {
  return {
    chainId: 114,
    officialSourceVerified: true,
    managerRuntimePresent: true,
    deployerMatchesConfiguredAddress: true,
    deployerHadRegistrationPermission: true,
    senderDeploymentStatus: "success",
    senderAddress: address("a"),
    senderReceiptAddress: address("a"),
    senderRuntimeVerified: true,
    constructorManagerBindingsVerified: true,
    registrationStatus: "success",
    extensionId: 66_001n,
    nextPublicExtensionId: 66_002n,
    extensionOwner: address("d"),
    deployer: address("d"),
    registeredSender: address("a"),
    registeredStateVerifier: zeroAddress,
    senderChainId: 114n,
    senderVersion: 1,
    senderOwner: address("d"),
    senderRegistry: FCC_TEE_MANAGER,
    senderMachineRegistry: FCC_TEE_MANAGER,
    senderExtensionId: 66_001n,
    manager: FCC_TEE_MANAGER,
    machineOwnerAllowed: true,
    walletProjectOwnerAllowed: true,
    evmKeyTypeSupported: true,
  };
}

function completeState() {
  const verification = evaluateFoundationRegistration(verificationInput());
  return {
    schemaVersion: 1,
    status: "verified",
    sourceCommit: "c".repeat(40),
    deployer: address("d"),
    network: { name: "flare-coston2", chainId: 114, rpcUrl: COSTON2_RPC_URL, observedBlock: "100" },
    officialSource: {
      repository: FCC_SCAFFOLD_REPOSITORY,
      commit: FCC_SCAFFOLD_COMMIT,
      path: FCC_DEPLOYMENTS_PATH,
      url: FCC_DEPLOYMENTS_URL,
      sha256: "c158350ea5a9bbba8c6485a680252b8f401bc2e25ea10830101eb6d0b40b022e",
      manager: FCC_TEE_MANAGER,
    },
    artifact: { contractName: "PayGuardFoundationSender", creationCodeHash: hash("1") },
    sender: {
      address: address("a"),
      nonce: "7",
      transactionHash: hash("2"),
      blockNumber: "101",
      receiptStatus: "success",
      runtimeCodeHash: hash("3"),
      runtimeBytes: 2048,
      runtimeVerified: true,
    },
    registration: {
      extensionId: "66001",
      transactionHash: hash("4"),
      blockNumber: "102",
      receiptStatus: "success",
    },
    configuration: {
      binding: { source: "transaction", transactionHash: hash("5"), blockNumber: "103", receiptStatus: "success" },
      machineOwner: { source: "already-configured", observedBlock: "104", receiptStatus: "not-required" },
      walletProjectOwner: { source: "transaction", transactionHash: hash("6"), blockNumber: "105", receiptStatus: "success" },
      evmKeyType: { source: "transaction", transactionHash: hash("7"), blockNumber: "106", receiptStatus: "success" },
    },
    assertions: verification.assertions,
    observedBlock: "107",
    verifiedAt: "2026-08-09T00:00:00.000Z",
  };
}

describe("official FCC deployment resolver", () => {
  it("accepts one manager from an exact digest-pinned source", () => {
    const source = JSON.stringify([
      { name: "Other", address: address("1") },
      { name: "FlareTeeManager", address: address("b") },
    ]);
    const expectedSha256 = createHash("sha256").update(source).digest("hex");
    assert.deepEqual(resolveOfficialTeeManager(source, { expectedSha256 }), {
      address: address("b"),
      sha256: expectedSha256,
    });
  });

  it("rejects digest drift, missing, duplicate, and zero managers", () => {
    const source = JSON.stringify([{ name: "FlareTeeManager", address: address("b") }]);
    assert.throws(() => resolveOfficialTeeManager(source), /digest mismatch/);
    for (const entries of [
      [],
      [
        { name: "FlareTeeManager", address: address("b") },
        { name: "FlareTeeManager", address: address("c") },
      ],
    ]) {
      const bytes = JSON.stringify(entries);
      const expectedSha256 = createHash("sha256").update(bytes).digest("hex");
      assert.throws(
        () => resolveOfficialTeeManager(bytes, { expectedSha256 }),
        /exactly one FlareTeeManager/,
      );
    }
    const zero = JSON.stringify([{ name: "FlareTeeManager", address: zeroAddress }]);
    const expectedSha256 = createHash("sha256").update(zero).digest("hex");
    assert.throws(() => resolveOfficialTeeManager(zero, { expectedSha256 }), /non-zero address/);
  });
});

describe("foundation registration verifier", () => {
  it("refuses deployment without the explicit broadcast capability", async () => {
    await assert.rejects(() => deployFoundationRegistration(), /explicit --broadcast/);
  });

  it("requires every live binding and configuration assertion", () => {
    const valid = verificationInput();
    assert.equal(evaluateFoundationRegistration(valid).status, "verified");
    for (const key of Object.keys(valid)) {
      const changed = { ...valid };
      if (typeof changed[key] === "boolean") changed[key] = false;
      else if (typeof changed[key] === "bigint") changed[key] = 0n;
      else if (key.includes("Status")) changed[key] = "reverted";
      else if (typeof changed[key] === "string" && changed[key].startsWith("0x")) changed[key] = address("f");
      else continue;
      assert.equal(evaluateFoundationRegistration(changed).status, "failed", key);
    }
  });

  it("accepts only a complete public state with the exact assertion set", () => {
    const state = completeState();
    assert.equal(validateFoundationRegistrationState(state, { requireComplete: true }).state, state);

    const secret = completeState();
    secret.privateKey = hash("8");
    assert.throws(() => validateFoundationRegistrationState(secret), /forbidden field/);

    const missingAssertion = completeState();
    delete missingAssertion.assertions.senderRuntimeVerified;
    assert.throws(
      () => validateFoundationRegistrationState(missingAssertion, { requireComplete: true }),
      /exact foundation assertions/,
    );

    const reserved = completeState();
    reserved.registration.extensionId = "65535";
    assert.throws(() => validateFoundationRegistrationState(reserved), /reserved/);
  });

  it("preserves validation of the exact historical foundation evidence pin", () => {
    const state = completeState();
    state.officialSource.commit = FCC_LEGACY_SCAFFOLD_COMMIT;
    state.officialSource.url = `https://raw.githubusercontent.com/flare-foundation/fce-extension-scaffold/${FCC_LEGACY_SCAFFOLD_COMMIT}/${FCC_DEPLOYMENTS_PATH}`;
    assert.equal(validateFoundationRegistrationState(state, { requireComplete: true }).state, state);

    state.officialSource.commit = "a".repeat(40);
    state.officialSource.url = state.officialSource.url.replace(FCC_LEGACY_SCAFFOLD_COMMIT, state.officialSource.commit);
    assert.throws(() => validateFoundationRegistrationState(state), /source pin mismatch/);
  });

  it("builds public-safe evidence without upgrading the live-result claim", () => {
    const evidence = buildFoundationRegistrationEvidence(completeState());
    assert.equal(evidence.suite, "payguard-coston2-fcc-foundation-registration");
    assert.equal(evidence.assertions.noMachineClaimed, true);
    assert.equal(evidence.assertions.noFccResultClaimed, true);
    assert.equal(evidence.assertions.noPrivateKeyRecorded, true);
    assert.equal(evidence.publicIdentifiers.machineOwnerTransaction, null);
    assert.ok(evidence.blockers.includes("LIVE_FCC_FOUNDATION_RESULT_NOT_VERIFIED"));
    assert.equal("signature" in evidence, false);
    assert.doesNotMatch(JSON.stringify(evidence), /"(?:privateKey|password|credential)"\s*:/i);
  });
});
