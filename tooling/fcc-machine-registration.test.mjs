import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMachineEvidence,
  evaluateMachineRegistration,
  officialRegisterTeeArgs,
  parseMachineRegistrationCLI,
  PRODUCTION_MACHINE_STATUS,
  readMachineSnapshot,
  resolveMachineEvents,
  verifyOfficialScaffold,
} from "./fcc-machine-registration.mjs";
import { PAYGUARD_EXTENSION_ID, PAYGUARD_EXTENSION_OWNER } from "./fcc-code-version.mjs";

const admission = {
  teeId: "0x1111111111111111111111111111111111111111",
  proxyId: "0x2222222222222222222222222222222222222222",
  codeHash: `0x${"33".repeat(32)}`,
  platform: `0x${"44".repeat(32)}`,
  governanceHash: `0x${"55".repeat(32)}`,
  keyFingerprint: `0x${"66".repeat(32)}`,
};

function validSnapshot() {
  return {
    chainId: 114,
    blockNumber: 40000000n,
    managerRuntimePresent: true,
    machine: { teeId: admission.teeId, teeProxyId: admission.proxyId, url: "https://machine.example" },
    attestation: {
      teeId: admission.teeId,
      initialTeeId: admission.teeId,
      url: "https://machine.example",
      codeHash: admission.codeHash,
      platform: admission.platform,
    },
    status: PRODUCTION_MACHINE_STATUS,
    owner: PAYGUARD_EXTENSION_OWNER,
    extensionId: PAYGUARD_EXTENSION_ID,
    lastStatusChange: 123456n,
  };
}

test("machine CLI requires explicit broadcast and strict distinct HTTPS origins", () => {
  assert.throws(() => parseMachineRegistrationCLI(["register", "--url", "https://machine.example", "--image-id", admission.codeHash, "--ftdc-url", "https://ftdc.example"]), /explicit --broadcast/);
  assert.throws(() => parseMachineRegistrationCLI(["plan", "--url", "https://machine.example/path", "--image-id", admission.codeHash, "--ftdc-url", "https://ftdc.example"]), /public HTTPS origin/);
  assert.throws(() => parseMachineRegistrationCLI(["plan", "--url", "https://same.example", "--image-id", admission.codeHash, "--ftdc-url", "https://same.example"]), /must be distinct/);
  const parsed = parseMachineRegistrationCLI(["register", "--url", "https://machine.example/", "--image-id", admission.codeHash, "--ftdc-url", "https://ftdc.example/", "--broadcast"]);
  assert.equal(parsed.url, "https://machine.example");
  assert.equal(parsed.ftdcUrl, "https://ftdc.example");
  assert.equal(parsed.broadcast, true);
});

test("official register command is exact, production-only, and resumable", () => {
  const args = officialRegisterTeeArgs({ url: "https://machine.example", ftdcUrl: "https://ftdc.example" }, "/safe/state.json", true);
  assert.deepEqual(args.slice(0, 2), ["run", "./cmd/register-tee"]);
  assert.equal(args[args.indexOf("-command") + 1], "rRap");
  assert.equal(args[args.indexOf("-p") + 1], "https://machine.example");
  assert.equal(args[args.indexOf("-h") + 1], "https://machine.example");
  assert.equal(args[args.indexOf("-ep") + 1], "https://ftdc.example");
  assert.equal(args.at(-1), "--resume");
});

test("machine evaluation binds every production readback", () => {
  const pass = evaluateMachineRegistration({ admission, snapshot: validSnapshot(), url: "https://machine.example", codeVersionAction: "already-supported" });
  assert.equal(pass.status, "verified");
  assert.ok(Object.values(pass.assertions).every(Boolean));

  for (const mutate of [
    (value) => { value.status = 1; },
    (value) => { value.machine.url = "https://other.example"; },
    (value) => { value.attestation.codeHash = `0x${"77".repeat(32)}`; },
    (value) => { value.attestation.initialTeeId = admission.proxyId; },
    (value) => { value.extensionId += 1n; },
  ]) {
    const snapshot = validSnapshot();
    mutate(snapshot);
    assert.equal(evaluateMachineRegistration({ admission, snapshot, url: "https://machine.example", codeVersionAction: "already-supported" }).status, "failed");
  }
});

test("machine snapshot reads and normalizes the exact manager surface", async () => {
  const calls = [];
  const client = {
    getChainId: async () => 114,
    getBlockNumber: async () => 40000000n,
    getCode: async () => "0x1234",
    readContract: async ({ functionName }) => {
      calls.push(functionName);
      return {
        getTeeMachine: [admission.teeId, admission.proxyId, "https://machine.example"],
        getTeeMachineWithAttestationData: [admission.teeId, admission.teeId, "https://machine.example", admission.codeHash, admission.platform],
        getTeeMachineStatus: 2,
        getTeeMachineOwner: PAYGUARD_EXTENSION_OWNER,
        getExtensionId: PAYGUARD_EXTENSION_ID,
        getLastStatusChangeTs: 123456n,
      }[functionName];
    },
  };
  const snapshot = await readMachineSnapshot(client, admission);
  assert.deepEqual(snapshot, validSnapshot());
  assert.deepEqual(new Set(calls), new Set([
    "getTeeMachine", "getTeeMachineWithAttestationData", "getTeeMachineStatus",
    "getTeeMachineOwner", "getExtensionId", "getLastStatusChangeTs",
  ]));
});

test("machine events require one exact registration followed by production", async () => {
  const registered = {
    args: {
      teeProxyId: admission.proxyId, owner: PAYGUARD_EXTENSION_OWNER, extensionId: PAYGUARD_EXTENSION_ID,
      url: "https://machine.example", codeHash: admission.codeHash, platform: admission.platform,
      governanceHash: admission.governanceHash,
    },
    transactionHash: `0x${"88".repeat(32)}`,
    blockNumber: 39999998n,
  };
  const production = { transactionHash: `0x${"99".repeat(32)}`, blockNumber: 39999999n };
  const client = { getContractEvents: async ({ eventName }) => eventName === "TeeMachineRegistered" ? [registered] : [production] };
  assert.deepEqual(await resolveMachineEvents(client, admission, "https://machine.example"), { registered, production });
  await assert.rejects(() => resolveMachineEvents(client, admission, "https://wrong.example"), /not both found/);
  await assert.rejects(() => resolveMachineEvents({ getContractEvents: async ({ eventName }) => eventName === "TeeMachineRegistered" ? [registered] : [{ ...production, blockNumber: 39999997n }] }, admission, "https://machine.example"), /predates/);
});

test("machine evidence is public-only and preserves live blockers", () => {
  const snapshot = validSnapshot();
  const evaluation = evaluateMachineRegistration({ admission, snapshot, url: snapshot.machine.url, codeVersionAction: "already-supported" });
  const evidence = buildMachineEvidence({
    sourceCommit: "a".repeat(40), admission, snapshot, evaluation,
    events: {
      registered: { transactionHash: `0x${"88".repeat(32)}`, blockNumber: 39999998n },
      production: { transactionHash: `0x${"99".repeat(32)}`, blockNumber: 39999999n },
    },
  });
  const encoded = JSON.stringify(evidence);
  assert.equal(evidence.status, "production-machine-verified");
  assert.deepEqual(evidence.blockers, ["TWO_ADDITIONAL_PRODUCTION_MACHINES_REQUIRED", "LIVE_FCC_RESULT_NOT_VERIFIED"]);
  assert.doesNotMatch(encoded, /private.?key|signature\"|attestation.?token|ciphertext|policyPlaintext/i);
});

test("scaffold verification fails closed on a source digest mismatch", async () => {
  const executor = async (_file, args) => {
    if (args[0] === "rev-parse") return { stdout: "ffb6c4ca7c160c49be59e00fe537e24d2477b000\n" };
    if (args[0] === "status") return { stdout: "" };
    return { stdout: "https://github.com/flare-foundation/fce-extension-scaffold.git\n" };
  };
  await assert.rejects(() => verifyOfficialScaffold(executor, async () => Buffer.from("changed")), /digest mismatch/);
});
