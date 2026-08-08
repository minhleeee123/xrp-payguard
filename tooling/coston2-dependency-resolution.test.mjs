import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  buildDependencyEvidence,
  collectDependencyObservation,
  DEPENDENCY_NAMES,
  FLARE_CONTRACT_REGISTRY,
  parseDependencyCLI,
} from "./coston2-dependency-resolution.mjs";
import { FCC_TEE_MANAGER, resolveOfficialTeeManager } from "./fcc-foundation-registration.mjs";

const address = (digit) => `0x${digit.repeat(40)}`;
const code = (byteCount) => `0x${"aa".repeat(byteCount)}`;

describe("Coston2 dependency observation", () => {
  it("parses an explicit read-only mode and write flag", () => {
    assert.deepEqual(parseDependencyCLI(["observe"]), { mode: "observe", write: false });
    assert.deepEqual(parseDependencyCLI(["observe", "--write"]), { mode: "observe", write: true });
    assert.throws(() => parseDependencyCLI(["record"]), /mode/);
    assert.throws(() => parseDependencyCLI(["observe", "--write", "--write"]), /duplicate/);
  });

  it("collects every supported dependency and verifies the pinned FCC source", async () => {
    const source = await readFile(".local/fce-extension-scaffold/config/coston2/deployed-addresses.json");
    const sourceManager = resolveOfficialTeeManager(source);
    const calls = [];
    const client = {
      async getChainId() { return 114; },
      async getBlockNumber() { return 12345n; },
      async getBytecode({ address: value }) { return code(value === FLARE_CONTRACT_REGISTRY ? 11 : 7); },
      async readContract({ args }) { calls.push(args[0]); return address((calls.length + 1).toString(16)); },
    };
    const observation = await collectDependencyObservation({
      client,
      sourceFetcher: async () => ({ ok: true, status: 200, async arrayBuffer() { return source; } }),
    });
    assert.equal(observation.observedBlock, "12345");
    assert.equal(observation.registryRuntimeBytes, 11);
    assert.deepEqual(calls, DEPENDENCY_NAMES);
    assert.equal(observation.fccManager.address, FCC_TEE_MANAGER);
    assert.equal(observation.fccManager.sourceSha256, sourceManager.sha256);
  });

  it("builds public-only evidence and rejects wrong chain or incomplete runtime", () => {
    const observation = {
      chainId: 114,
      observedBlock: "12345",
      registry: FLARE_CONTRACT_REGISTRY,
      registryRuntimeBytes: 11,
      dependencies: Object.fromEntries(DEPENDENCY_NAMES.map((name, index) => [name, { address: address((index + 1).toString(16)), runtimeBytes: 7 }])),
      fccManager: {
        address: FCC_TEE_MANAGER,
        sourceRepository: "https://github.com/flare-foundation/fce-extension-scaffold",
        sourceCommit: "ffb6c4ca7c160c49be59e00fe537e24d2477b000",
        sourceSha256: "c158350ea5a9bbba8c6485a680252b8f401bc2e25ea10830101eb6d0b40b022e",
      },
    };
    const evidence = buildDependencyEvidence(observation, "2026-08-08T21:00:00.000Z");
    assert.equal(evidence.network.chainId, 114);
    assert.equal(evidence.assertions.noPayGuardReleaseClaimed, true);
    assert.deepEqual(Object.values(evidence.assertions).filter((value) => typeof value !== "boolean"), []);
    const wrongChain = { ...observation, chainId: 115 };
    assert.throws(() => buildDependencyEvidence(wrongChain), /Coston2/);
    const incomplete = { ...observation, registryRuntimeBytes: 0 };
    assert.throws(() => buildDependencyEvidence(incomplete), /runtime size/);
    const wrongSource = { ...observation, fccManager: { ...observation.fccManager, sourceCommit: "a".repeat(40) } };
    assert.throws(() => buildDependencyEvidence(wrongSource), /source pin/);
  });
});
