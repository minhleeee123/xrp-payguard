import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zeroAddress } from "viem";

import {
  PAYGUARD_EXTENSION_ID,
  PAYGUARD_EXTENSION_OWNER,
  PAYGUARD_FOUNDATION_SENDER,
  PAYGUARD_TEE_VERSION_BYTES32,
} from "./fcc-code-version.mjs";
import {
  buildCodeVersionEvidence,
  machinePreflightArgs,
  parseCodeVersionCLI,
  readCodeVersionSnapshot,
  runMachineAdmission,
} from "./fcc-code-version-deploy.mjs";
import { COSTON2_CHAIN_ID, FCC_TEE_MANAGER } from "./fcc-foundation-registration.mjs";

const codeHash = "0x65cc930c90ffeb8bc825998c347240239a66fa0a50928b077c49f1480932f511";
const platform = "0x4743505f414d445f534556000000000000000000000000000000000000000000";
const transactionHash = "0x7000000000000000000000000000000000000000000000000000000000000007";

function admission() {
  return {
    status: "verified",
    chainId: COSTON2_CHAIN_ID,
    extensionId: PAYGUARD_EXTENSION_ID.toString(),
    teeId: "0x1000000000000000000000000000000000000001",
    proxyId: "0x2000000000000000000000000000000000000002",
    machineId: "0x0000000000000000000000001000000000000000000000000000000000000001",
    keyFingerprint: "0x3000000000000000000000000000000000000000000000000000000000000003",
    governanceHash: "0x4000000000000000000000000000000000000000000000000000000000000004",
    codeHash,
    platform,
    teeTimestamp: 1_800_000_000,
    attestationPkiVerified: true,
    machineSignatureVerified: true,
    proxySignatureVerified: true,
    productionPlatformVerified: true,
    noRawAttestationOrSignatureOutput: true,
  };
}

function supportedSnapshot() {
  return {
    chainId: COSTON2_CHAIN_ID,
    blockNumber: 33796002n,
    manager: FCC_TEE_MANAGER,
    managerRuntimePresent: true,
    extensionOwner: PAYGUARD_EXTENSION_OWNER,
    foundationSender: PAYGUARD_FOUNDATION_SENDER,
    stateVerifier: zeroAddress,
    systemPlatforms: [platform],
    supportedCodeHashes: [codeHash],
    codeHashPlatformDisabled: false,
    codeHashPlatformSupported: true,
    registeredVersion: PAYGUARD_TEE_VERSION_BYTES32,
    registeredPlatforms: [platform],
  };
}

describe("code-version operational arguments", () => {
  it("requires explicit deployment capability and preserves values as exec arguments", () => {
    const options = parseCodeVersionCLI([
      "deploy", "--broadcast", "--url", "https://machine.example", "--image-id", `sha256:${codeHash.slice(2)}`,
      "--leaf-crl", "/trusted/leaf.crl", "--intermediate-crl", "/trusted/intermediate.crl",
    ]);
    assert.equal(options.expectedCodeHash, codeHash);
    assert.deepEqual(machinePreflightArgs(options), [
      "run", "./cmd/machine-preflight", "-url", "https://machine.example", "-image-id", `sha256:${codeHash.slice(2)}`,
      "-leaf-crl", "/trusted/leaf.crl", "-intermediate-crl", "/trusted/intermediate.crl",
    ]);
    assert.throws(() => parseCodeVersionCLI(["deploy", "--url", "https://machine.example", "--image-id", codeHash]));
    assert.throws(() => parseCodeVersionCLI(["plan", "--broadcast", "--url", "https://machine.example", "--image-id", codeHash]));
    assert.throws(() => parseCodeVersionCLI(["plan", "--url", "https://machine.example", "--url", "https://other.example", "--image-id", codeHash]));
  });

  it("executes the pinned Go verifier directly and rejects toolchain drift", async () => {
    const options = parseCodeVersionCLI(["plan", "--url", "https://machine.example", "--image-id", codeHash]);
    const value = admission();
    value.teeTimestamp = Math.floor(Date.now() / 1000);
    const calls = [];
    const executor = async (command, args) => {
      calls.push([command, args]);
      return args[0] === "version"
        ? { stdout: "go version go1.25.12 linux/amd64\n" }
        : { stdout: `${JSON.stringify(value)}\n` };
    };
    const verified = await runMachineAdmission(options, executor);
    assert.equal(verified.codeHash, codeHash);
    assert.deepEqual(calls[0], ["go", ["version"]]);
    assert.deepEqual(calls[1], ["go", machinePreflightArgs(options)]);
    await assert.rejects(() => runMachineAdmission(options, async () => ({ stdout: "go version go1.25.11 linux/amd64\n" })));
  });
});

describe("live allowance snapshot", () => {
  it("reads every owner, sender, platform, disable, support, and version field", async () => {
    const calls = [];
    const client = {
      getChainId: async () => COSTON2_CHAIN_ID,
      getBlockNumber: async () => 33796000n,
      getCode: async () => "0x1234",
      readContract: async ({ functionName }) => {
        calls.push(functionName);
        const values = {
          getExtensionOwner: PAYGUARD_EXTENSION_OWNER,
          getTeeExtensionInstructionsSender: PAYGUARD_FOUNDATION_SENDER,
          getTeeExtensionStateVerifier: zeroAddress,
          getSystemSupportedPlatforms: [platform],
          getSupportedCodeHashes: [codeHash],
          isCodeHashPlatformDisabled: false,
          isCodeHashPlatformSupported: true,
          getCodeHashInfo: [PAYGUARD_TEE_VERSION_BYTES32, [platform]],
        };
        return values[functionName];
      },
    };
    const snapshot = await readCodeVersionSnapshot(client, admission());
    assert.equal(snapshot.chainId, COSTON2_CHAIN_ID);
    assert.equal(snapshot.extensionOwner, PAYGUARD_EXTENSION_OWNER);
    assert.equal(snapshot.registeredVersion, PAYGUARD_TEE_VERSION_BYTES32);
    assert.deepEqual(snapshot.registeredPlatforms, [platform]);
    assert.deepEqual(new Set(calls), new Set([
      "getExtensionOwner",
      "getTeeExtensionInstructionsSender",
      "getTeeExtensionStateVerifier",
      "getSystemSupportedPlatforms",
      "getSupportedCodeHashes",
      "isCodeHashPlatformDisabled",
      "isCodeHashPlatformSupported",
      "getCodeHashInfo",
    ]));
  });
});

describe("public code-version evidence", () => {
  it("accepts only an exact owner transaction, event, and successful receipt", () => {
    const event = {
      address: FCC_TEE_MANAGER,
      args: { extensionId: PAYGUARD_EXTENSION_ID, version: PAYGUARD_TEE_VERSION_BYTES32, codeHash, platforms: [platform] },
      transactionHash,
      blockNumber: 33796000n,
    };
    const input = {
      sourceCommit: "a".repeat(40),
      officialSourceVerified: true,
      admission: admission(),
      snapshot: supportedSnapshot(),
      event,
      transaction: { hash: transactionHash, from: PAYGUARD_EXTENSION_OWNER, to: FCC_TEE_MANAGER },
      receipt: { transactionHash, status: "success" },
    };
    const evidence = buildCodeVersionEvidence(input);
    assert.equal(evidence.publicIdentifiers.verificationSourceCommit, input.sourceCommit);
    assert.equal(evidence.publicIdentifiers.transactionHash, transactionHash);
    assert.ok(Object.values(evidence.assertions).every((value) => typeof value === "boolean" && value));
    assert.equal(JSON.stringify(evidence).includes("signature"), false);

    assert.throws(() => buildCodeVersionEvidence({ ...input, receipt: { ...input.receipt, status: "reverted" } }));
    assert.throws(() => buildCodeVersionEvidence({
      ...input,
      transaction: { ...input.transaction, from: "0x5000000000000000000000000000000000000005" },
    }));
    assert.throws(() => buildCodeVersionEvidence({
      ...input,
      event: { ...event, args: { ...event.args, platforms: [] } },
    }));
    assert.throws(() => buildCodeVersionEvidence({ ...input, officialSourceVerified: false }));
    assert.throws(() => buildCodeVersionEvidence({
      ...input,
      snapshot: { ...input.snapshot, blockNumber: event.blockNumber },
    }));
    assert.throws(() => buildCodeVersionEvidence({
      ...input,
      event: { ...event, address: PAYGUARD_FOUNDATION_SENDER },
    }));
  });
});
