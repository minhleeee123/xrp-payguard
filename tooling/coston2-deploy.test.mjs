import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import {
  buildDeploymentEvidence,
  COSTON2_RPC_URL,
  FLARE_CONTRACT_REGISTRY,
  validateDeploymentState,
  verifyRuntimeBytecode,
} from "./coston2-deploy.mjs";

const address = (digit) => `0x${digit.repeat(40)}`;
const hash = (digit) => `0x${digit.repeat(64)}`;

function completeState() {
  const contract = (name, digit, nonce) => ({
    name,
    address: address(digit),
    nonce: String(nonce),
    creationCodeHash: hash(digit),
    transactionHash: hash(digit === "a" ? "1" : digit),
    blockNumber: String(100 + nonce),
    receiptStatus: "success",
    runtimeCodeHash: hash(digit === "a" ? "2" : digit),
    runtimeBytes: 1000,
    runtimeVerified: true,
  });
  return {
    schemaVersion: 1,
    status: "verified",
    sourceCommit: "a".repeat(40),
    deployer: address("d"),
    network: { name: "flare-coston2", chainId: 114, rpcUrl: COSTON2_RPC_URL },
    dependencies: {
      flareContractRegistry: FLARE_CONTRACT_REGISTRY,
      assetManagerFxrp: address("e"),
      fTestXrp: address("f"),
      symbol: "FTestXRP",
      decimals: 6,
    },
    contracts: {
      registry: contract("PayGuardPolicyRegistry", "a", 1),
      vault: contract("PayGuardVault", "b", 2),
      router: contract("PayGuardActionRouter", "c", 3),
    },
    wiring: {
      vaultRouter: { nonce: "4", functionName: "setRouter", transactionHash: hash("4"), blockNumber: "104", receiptStatus: "success", verified: true },
      supportedFTestXrp: { nonce: "5", functionName: "setSupportedAsset", transactionHash: hash("5"), blockNumber: "105", receiptStatus: "success", verified: true },
    },
    verifiedAt: "2026-08-09T00:00:00.000Z",
    observedBlock: "106",
    assertions: {
      chainIdVerified: true,
      officialAssetResolutionVerified: true,
      sourceCommitCleanAtBroadcast: true,
      deploymentReceiptsSuccessful: true,
      runtimeCodeVerified: true,
      constructorBindingsVerified: true,
      vaultRouterVerified: true,
      supportedAssetVerified: true,
    },
  };
}

describe("Coston2 deployment state", () => {
  it("accepts the complete public-only verified state", () => {
    const state = completeState();
    assert.equal(validateDeploymentState(state, { requireComplete: true }), state);
  });

  it("rejects secret-bearing and wrong-network state", () => {
    const withSecret = completeState();
    withSecret.privateKey = hash("1");
    assert.throws(() => validateDeploymentState(withSecret), /forbidden field/);

    const wrongNetwork = completeState();
    wrongNetwork.network.chainId = 14;
    assert.throws(() => validateDeploymentState(wrongNetwork), /pinned Coston2/);
  });

  it("rejects incomplete receipts, runtime, and wiring", () => {
    const state = completeState();
    delete state.contracts.router.transactionHash;
    assert.throws(() => validateDeploymentState(state, { requireComplete: true }), /deployment is incomplete/);

    const wiring = completeState();
    wiring.wiring.vaultRouter.verified = false;
    assert.throws(() => validateDeploymentState(wiring, { requireComplete: true }), /wiring is incomplete/);
  });
});

describe("Foundry runtime matching", () => {
  it("allows changes only inside declared immutable ranges", () => {
    const result = verifyRuntimeBytecode("0x60aabb5b", "0x6000005b", { "1": [{ start: 1, length: 2 }] });
    assert.equal(result.runtimeBytes, 4);
    assert.match(result.runtimeCodeHash, /^0x[0-9a-f]{64}$/);
  });

  it("rejects mutation outside immutables and malformed ranges", () => {
    assert.throws(() => verifyRuntimeBytecode("0x61aabb5b", "0x6000005b", { "1": [{ start: 1, length: 2 }] }), /outside immutable/);
    assert.throws(() => verifyRuntimeBytecode("0x60aabb5b", "0x6000005b", { "1": [{ start: 3, length: 2 }] }), /malformed artifact immutable range/);
    assert.throws(() => verifyRuntimeBytecode("0x60aabb", "0x6000005b", {}), /length mismatch/);
  });

  it("accepts every current Foundry runtime artifact", async () => {
    for (const path of [
      "packages/contracts/out/PayGuardPolicyRegistry.sol/PayGuardPolicyRegistry.json",
      "packages/contracts/out/PayGuardVault.sol/PayGuardVault.json",
      "packages/contracts/out/PayGuardActionRouter.sol/PayGuardActionRouter.json",
    ]) {
      const artifact = JSON.parse(await readFile(resolve(import.meta.dirname, "..", path), "utf8"));
      const runtime = artifact.deployedBytecode.object;
      const result = verifyRuntimeBytecode(runtime, runtime, artifact.deployedBytecode.immutableReferences);
      assert.ok(result.runtimeBytes > 0);
    }
  });
});

describe("deployment evidence", () => {
  it("contains only public release-limited identifiers and boolean assertions", () => {
    const evidence = buildDeploymentEvidence(completeState());
    assert.equal(evidence.suite, "payguard-coston2-contract-deployment");
    assert.equal(evidence.network.chainId, 114);
    assert.equal(evidence.assertions.noPrivateKeyRecorded, true);
    assert.equal(evidence.assertions.noFccReleaseClaimed, true);
    assert.deepEqual(Object.values(evidence.assertions).filter((value) => typeof value !== "boolean"), []);
    assert.equal("signature" in evidence, false);
  });
});
