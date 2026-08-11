import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPublicWebEvidenceManifest } from "./public-web-evidence.mjs";
import {
  PUBLIC_WEB_ORIGIN,
  auditDeployedPublicEvidence,
  buildPublicWebDeploymentAuditEvidence,
  parsePublicWebDeploymentAuditCLI,
} from "./public-web-deployment-audit.mjs";

const assertions = {
  simulationOnly: true,
  hardwareTeeVerified: false,
  registeredMachinesVerified: false,
  stableHttpsOriginsVerified: false,
  authenticatedIndexerVerified: false,
  noLiveFccResultClaimed: true,
  noPayGuardReleaseClaimed: true,
  testnetOnly: true,
  noPrivateKeyRecorded: true,
};

function localEntries() {
  const coston2 = Array.from({ length: 18 }, (_, index) => ({
    path: `evidence/coston2/${index}.json`,
    data: { suite: `coston2-${index}`, status: "pass", chainId: 114, testnetOnly: true, noPrivateKeyRecorded: true },
  }));
  return [
    ...coston2,
    {
      path: "evidence/simulation/coston2-simulated-policy-lifecycle-2026-08-09.json",
      data: {
        suite: "onchain-sim",
        status: "coston2-simulated-pass",
        mode: "SIMULATED_TEE_ONCHAIN",
        network: { name: "flare-coston2", chainId: 114, publicChainConnected: true },
        assertions: { ...assertions, payGuardLocalMachineEntriesVerified: true, onChainTransactionsVerified: true },
      },
    },
    {
      path: "evidence/simulation/coston2-interactive-demo-deployment-2026-08-10.json",
      data: {
        suite: "interactive-onchain-sim",
        status: "simulation-only",
        mode: "SIMULATED_FCC_COSTON2_TESTNET_V1",
        testnetOnly: true,
        network: { name: "flare-coston2", chainId: 114, publicChainConnected: true },
        assertions: {
          ...assertions,
          separateDemoContractNamespaceVerified: true,
          threeDistinctActorDescriptorsVerified: true,
          runtimeAndWiringVerified: true,
          actorRegistrationReadbackVerified: true,
          onChainTransactionsVerified: true,
          registeredProductionMachinesVerified: false,
          independentOperatorsVerified: false,
          sealedPersistenceVerified: false,
          productionFccReleaseVerified: false,
        },
      },
    },
    {
      path: "evidence/simulation/fcc-local-three-machine-2026-08-09.json",
      data: {
        suite: "local-sim",
        status: "local-simulated-pass",
        mode: "SIMULATED_TEE",
        network: { publicChainConnected: false },
        assertions,
      },
    },
  ];
}

function response(value, { status = 200, contentType = "application/json; charset=utf-8", raw } = {}) {
  return new Response(raw ?? `${JSON.stringify(value, null, 2)}\n`, { status, headers: { "content-type": contentType } });
}

function fetcherFor(entries, mutate = () => undefined) {
  const manifest = buildPublicWebEvidenceManifest(entries);
  return async (url) => {
    const path = new URL(url).pathname;
    const changed = mutate(path, entries, manifest);
    if (changed) return changed;
    if (path === "/evidence/index.json") return response(manifest);
    const entry = entries.find((candidate) => `/${candidate.path}` === path);
    return entry ? response(entry.data) : response({}, { status: 404 });
  };
}

describe("public web deployment evidence audit", () => {
  it("accepts only the audit mode and one explicit write capability", () => {
    assert.deepEqual(parsePublicWebDeploymentAuditCLI([]), { mode: "audit", write: false });
    assert.deepEqual(parsePublicWebDeploymentAuditCLI(["audit", "--write"]), { mode: "audit", write: true });
    assert.throws(() => parsePublicWebDeploymentAuditCLI(["record"]), /mode/);
    assert.throws(() => parsePublicWebDeploymentAuditCLI(["audit", "--write", "--write"]), /duplicate/);
  });

  it("verifies every deployed JSON body byte-for-byte against reviewed sources", async () => {
    const entries = localEntries();
    const observation = await auditDeployedPublicEvidence({ localEntries: entries, fetcher: fetcherFor(entries) });
    assert.deepEqual(observation.counts, { total: 21, chain114: 20, simulation: 3 });
    assert.equal(observation.entries.every((entry) => entry.httpStatus === 200
      && entry.exactSourceBytesVerified && entry.publicFieldScanVerified), true);
    assert.equal(observation.entries.filter((entry) => entry.explicitSimulationBoundaryVerified).length, 3);
    const evidence = buildPublicWebDeploymentAuditEvidence(
      observation,
      "a".repeat(40),
      "2026-08-09T00:00:00.000Z",
    );
    assert.equal(evidence.status, "public-evidence-deployment-audit-pass");
    assert.equal(evidence.assertions.noPayGuardReleaseClaimed, true);
    assert.equal(evidence.corpus.entries.length, 21);
  });

  it("fails closed on index, byte, content-type, and private-field drift", async () => {
    const entries = localEntries();
    await assert.rejects(
      auditDeployedPublicEvidence({
        localEntries: entries,
        fetcher: fetcherFor(entries, (path, _entries, manifest) => path === "/evidence/index.json"
          ? response({ ...manifest, staticShellOnly: false }) : undefined),
      }),
      /index drifted/,
    );
    await assert.rejects(
      auditDeployedPublicEvidence({
        localEntries: entries,
        fetcher: fetcherFor(entries, (path) => path.endsWith("/0.json")
          ? response(entries[0].data, { raw: JSON.stringify(entries[0].data) }) : undefined),
      }),
      /bytes drifted/,
    );
    await assert.rejects(
      auditDeployedPublicEvidence({
        localEntries: entries,
        fetcher: fetcherFor(entries, (path, _entries, manifest) => path === "/evidence/index.json"
          ? response(manifest, { contentType: "text/plain" }) : undefined),
      }),
      /non-JSON/,
    );
    const unsafeEntries = localEntries();
    await assert.rejects(
      auditDeployedPublicEvidence({
        localEntries: unsafeEntries,
        fetcher: fetcherFor(unsafeEntries, (path) => path.endsWith("/0.json")
          ? response({ ...unsafeEntries[0].data, secret: "forbidden" }) : undefined),
      }),
      /forbidden|drifted/,
    );
  });

  it("rejects an unpinned origin or incomplete evidence observation", async () => {
    await assert.rejects(
      auditDeployedPublicEvidence({ origin: "https://example.com", localEntries: [], fetcher: async () => response({}) }),
      /not pinned/,
    );
    assert.throws(() => buildPublicWebDeploymentAuditEvidence({}, "a".repeat(40)), /incomplete/);
    assert.throws(() => buildPublicWebDeploymentAuditEvidence({ origin: PUBLIC_WEB_ORIGIN }, "short"), /incomplete/);
  });
});
