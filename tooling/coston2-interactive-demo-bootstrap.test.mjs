import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { generatePrivateKey } from "viem/accounts";
import {
  actorDescriptor,
  buildInteractiveDemoConfig,
  buildInteractiveDemoEvidence,
  configureVercelEnvironment,
  ensureLocalActorKeys,
  parseInteractiveDemoBootstrapCLI,
} from "./coston2-interactive-demo-bootstrap.mjs";

test("interactive demo CLI is read-only by default and requires every destructive acknowledgement", () => {
  assert.deepEqual(parseInteractiveDemoBootstrapCLI([]), { mode: "plan", broadcast: false, confirmed: false, configureVercel: false });
  assert.throws(() => parseInteractiveDemoBootstrapCLI(["deploy", "--broadcast"]), /requires/);
  assert.deepEqual(parseInteractiveDemoBootstrapCLI(["deploy", "--broadcast", "--confirm-simulated-fcc", "--configure-vercel"]), {
    mode: "deploy", broadcast: true, confirmed: true, configureVercel: true,
  });
});

test("local actor provisioning creates three distinct ignored-style secrets without returning them in output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "payguard-demo-actors-"));
  const path = join(directory, ".env.local");
  await writeFile(path, "PAYGUARD_DEPLOYER_PRIVATE_KEY=placeholder\n", { mode: 0o600 });
  const environment = {};
  const keys = await ensureLocalActorKeys({ envPath: path, environment });
  assert.equal(keys.length, 3);
  assert.equal(new Set(keys).size, 3);
  const body = await readFile(path, "utf8");
  assert.equal((body.match(/PAYGUARD_DEMO_ACTOR_[123]_PRIVATE_KEY=/g) ?? []).length, 3);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test("public config and evidence preserve a separate namespace and false production assertions", () => {
  const actors = [1, 2, 3].map((actor) => actorDescriptor(generatePrivateKey(), actor));
  const contracts = {
    registry: "0x0000000000000000000000000000000000000011",
    vault: "0x0000000000000000000000000000000000000012",
    router: "0x0000000000000000000000000000000000000013",
  };
  const config = buildInteractiveDemoConfig({ contracts, asset: "0x0000000000000000000000000000000000000014", deploymentBlock: 10n, actors });
  const evidence = buildInteractiveDemoEvidence({
    sourceCommit: "a".repeat(40), deployer: "0x0000000000000000000000000000000000000015", config,
    transactions: { deployRegistry: { transactionHash: `0x${"1".repeat(64)}`, blockNumber: "10", status: "success" } },
    verifiedAt: "2026-08-10T00:00:00.000Z",
  });
  assert.equal(evidence.assertions.hardwareTeeVerified, false);
  assert.equal(evidence.assertions.independentOperatorsVerified, false);
  assert.equal(evidence.assertions.simulationOnly, true);
  assert.equal(evidence.assertions.noLiveFccResultClaimed, true);
  assert.equal(evidence.testnetOnly, true);
  assert.equal(JSON.stringify(evidence).includes("publicKey"), false);
});

test("Vercel configuration receives secret values in memory without logging or transforming them", async () => {
  const calls = [];
  await configureVercelEnvironment([["PAYGUARD_DEMO_ACTOR_1_PRIVATE_KEY", "opaque", true]], async (...args) => calls.push(args));
  assert.deepEqual(calls, [["PAYGUARD_DEMO_ACTOR_1_PRIVATE_KEY", "opaque", true]]);
});
