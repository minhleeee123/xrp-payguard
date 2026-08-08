import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zeroAddress } from "viem";
import {
  PAYGUARD_EXTENSION_OWNER,
  PAYGUARD_FOUNDATION_SENDER,
  PAYGUARD_TEE_VERSION_BYTES32,
  evaluateCodeVersionPlan,
  normalizeExpectedImageID,
  validateMachineAdmission,
} from "./fcc-code-version.mjs";
import { COSTON2_CHAIN_ID, FCC_TEE_MANAGER } from "./fcc-foundation-registration.mjs";

const nowSeconds = 1_800_000_000;
const codeHash = "0x65cc930c90ffeb8bc825998c347240239a66fa0a50928b077c49f1480932f511";
const platform = "0x4743505f414d445f534556000000000000000000000000000000000000000000";
const teeId = "0x1000000000000000000000000000000000000001";

function admission() {
  return {
    status: "verified",
    chainId: COSTON2_CHAIN_ID,
    extensionId: "66037",
    teeId,
    proxyId: "0x2000000000000000000000000000000000000002",
    machineId: `0x${"0".repeat(24)}${teeId.slice(2)}`,
    keyFingerprint: "0x3000000000000000000000000000000000000000000000000000000000000003",
    codeHash,
    platform,
    governanceHash: "0x4000000000000000000000000000000000000000000000000000000000000004",
    teeTimestamp: nowSeconds,
    attestationPkiVerified: true,
    machineSignatureVerified: true,
    proxySignatureVerified: true,
    productionPlatformVerified: true,
    noRawAttestationOrSignatureOutput: true,
  };
}

function plan(overrides = {}) {
  return {
    admission: admission(),
    expectedCodeHash: codeHash,
    nowSeconds,
    chainId: COSTON2_CHAIN_ID,
    manager: FCC_TEE_MANAGER,
    managerRuntimePresent: true,
    extensionOwner: PAYGUARD_EXTENSION_OWNER,
    foundationSender: PAYGUARD_FOUNDATION_SENDER,
    stateVerifier: zeroAddress,
    systemPlatforms: [platform],
    supportedCodeHashes: [],
    codeHashPlatformDisabled: false,
    codeHashPlatformSupported: false,
    ...overrides,
  };
}

describe("production machine admission handoff", () => {
  it("normalizes only exact nonzero image IDs", () => {
    assert.equal(normalizeExpectedImageID(`sha256:${codeHash.slice(2)}`), codeHash);
    assert.equal(normalizeExpectedImageID(codeHash), codeHash);
    for (const value of [undefined, "", "sha256:01", `0x${"0".repeat(64)}`, `sha256:${"z".repeat(64)}`]) {
      assert.throws(() => normalizeExpectedImageID(value));
    }
  });

  it("accepts only the exact fresh public-safe result", () => {
    const value = validateMachineAdmission(admission(), { expectedCodeHash: codeHash, nowSeconds });
    assert.equal(value.codeHash, codeHash);
    assert.equal(value.teeId, teeId);
  });

  it("rejects field drift, stale results, simulation, and identity mismatch", () => {
    const mutations = [
      (value) => { value.extra = true; },
      (value) => { value.teeTimestamp -= 121; },
      (value) => { value.productionPlatformVerified = false; },
      (value) => { value.platform = "0x544553545f504c4154464f524d00000000000000000000000000000000000000"; },
      (value) => { value.proxyId = value.teeId; },
      (value) => { value.machineId = `0x${"1".repeat(64)}`; },
      (value) => { value.codeHash = `0x${"5".repeat(64)}`; },
    ];
    for (const mutate of mutations) {
      const value = admission();
      mutate(value);
      assert.throws(() => validateMachineAdmission(value, { expectedCodeHash: codeHash, nowSeconds }));
    }
  });
});

describe("code-version allowance plan", () => {
  it("plans one exact version/platform addition when the hash is new", () => {
    const result = evaluateCodeVersionPlan(plan());
    assert.equal(result.status, "ready");
    assert.equal(result.action, "add-version");
    assert.equal(result.versionBytes32, PAYGUARD_TEE_VERSION_BYTES32.toLowerCase());
    assert.ok(Object.values(result.assertions).every(Boolean));
  });

  it("is idempotent only for an exact supported readback", () => {
    const result = evaluateCodeVersionPlan(plan({
      supportedCodeHashes: [codeHash],
      codeHashPlatformSupported: true,
      registeredVersion: PAYGUARD_TEE_VERSION_BYTES32,
      registeredPlatforms: [platform],
    }));
    assert.equal(result.status, "ready");
    assert.equal(result.action, "already-supported");
  });

  it("fails closed on every on-chain ownership, sender, platform, disable, or version conflict", () => {
    const failures = [
      { chainId: 1 },
      { managerRuntimePresent: false },
      { extensionOwner: "0x5000000000000000000000000000000000000005" },
      { foundationSender: "0x5000000000000000000000000000000000000005" },
      { stateVerifier: "0x5000000000000000000000000000000000000005" },
      { systemPlatforms: [] },
      { codeHashPlatformDisabled: true },
      { codeHashPlatformSupported: undefined },
      { supportedCodeHashes: [codeHash], codeHashPlatformSupported: false },
      {
        supportedCodeHashes: [],
        codeHashPlatformSupported: true,
        registeredVersion: PAYGUARD_TEE_VERSION_BYTES32,
        registeredPlatforms: [platform],
      },
      {
        supportedCodeHashes: [codeHash],
        codeHashPlatformSupported: true,
        registeredVersion: `0x${"6".repeat(64)}`,
        registeredPlatforms: [platform],
      },
    ];
    for (const overrides of failures) {
      const result = evaluateCodeVersionPlan(plan(overrides));
      assert.equal(result.status, "failed");
      assert.equal(result.action, "none");
    }
  });
});
