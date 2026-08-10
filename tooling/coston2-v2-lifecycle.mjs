import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  address,
  array,
  exact,
  hex32,
  liveHeader,
  parsePlanVerifyCLI,
  readJson,
  record,
} from "./candidate-public.mjs";

export const LIFECYCLE_STAGES = ["funding", "custody", "allow", "deny", "stop", "resume", "revoke", "redemption"];

function successfulTransaction(value, label) {
  const transaction = record(value, label);
  hex32(transaction.transactionHash, `${label}.transactionHash`);
  if (typeof transaction.blockNumber !== "string" || !/^[1-9][0-9]*$/.test(transaction.blockNumber)) {
    throw new Error(`${label}.blockNumber must be a positive quoted decimal`);
  }
  exact(transaction.status, "success", `${label}.status`);
  return transaction;
}

export function validateLifecycleEvidence(value) {
  const evidence = liveHeader(value, "payguard-coston2-v2-canonical-lifecycle");
  const binding = record(evidence.binding, "binding");
  const registry = address(binding.registry, "binding.registry");
  address(binding.vault, "binding.vault");
  address(binding.router, "binding.router");
  address(binding.account, "binding.account");
  const policyId = hex32(binding.policyId, "binding.policyId");
  hex32(binding.policyHash, "binding.policyHash");

  const stages = record(evidence.stages, "stages");
  for (const stage of LIFECYCLE_STAGES) if (!(stage in stages)) throw new Error(`stages.${stage} is required`);
  successfulTransaction(stages.funding, "stages.funding");

  const custody = record(stages.custody, "stages.custody");
  exact(custody.status, "all-three-receipted", "stages.custody.status");
  const machines = array(custody.machineIds, "stages.custody.machineIds", 3).map((item, index) => hex32(item, `stages.custody.machineIds[${index}]`));
  const receipts = array(custody.receiptHashes, "stages.custody.receiptHashes", 3).map((item, index) => hex32(item, `stages.custody.receiptHashes[${index}]`));
  if (new Set(machines).size !== 3 || new Set(receipts).size !== 3) throw new Error("custody machines and receipts must be distinct");
  successfulTransaction(custody.freezeTransaction, "stages.custody.freezeTransaction");

  const allow = record(stages.allow, "stages.allow");
  exact(allow.decision, "ALLOW", "stages.allow.decision");
  exact(allow.executed, true, "stages.allow.executed");
  hex32(allow.requestHash, "stages.allow.requestHash");
  hex32(allow.resultCommitment, "stages.allow.resultCommitment");
  exact(allow.matchingResults, 2, "stages.allow.matchingResults");
  successfulTransaction(allow.transaction, "stages.allow.transaction");

  const deny = record(stages.deny, "stages.deny");
  exact(deny.decision, "DENY", "stages.deny.decision");
  exact(deny.executed, false, "stages.deny.executed");
  hex32(deny.requestHash, "stages.deny.requestHash");
  hex32(deny.resultCommitment, "stages.deny.resultCommitment");
  exact(deny.matchingResults, 2, "stages.deny.matchingResults");
  successfulTransaction(deny.transaction, "stages.deny.transaction");

  for (const [stage, state] of [["stop", "stopped"], ["resume", "active"], ["revoke", "revoked"]]) {
    const item = record(stages[stage], `stages.${stage}`);
    exact(item.actor, "policy-owner", `stages.${stage}.actor`);
    exact(item.resultingState, state, `stages.${stage}.resultingState`);
    successfulTransaction(item.transaction, `stages.${stage}.transaction`);
  }
  const redemption = record(stages.redemption, "stages.redemption");
  exact(redemption.separateEvidenceVerified, true, "stages.redemption.separateEvidenceVerified");
  hex32(redemption.evidenceDigest, "stages.redemption.evidenceDigest");

  const assertions = record(evidence.assertions, "assertions");
  for (const key of ["sameRelease", "samePolicy", "allThreeCustodyBeforeFreeze", "twoMatchingResults", "denyDidNotExecute", "ownerOnlyLifecycle", "onchainReplayAuthority", "noPrivateMaterial"]) {
    exact(assertions[key], true, `assertions.${key}`);
  }
  return { status: "verified", registry, policyId, stages: LIFECYCLE_STAGES.length };
}

export function lifecyclePlan() {
  return {
    status: "planned",
    verified: false,
    network: "flare-coston2",
    stages: LIFECYCLE_STAGES,
    input: "an operator-supplied public-only JSON file outside tracked evidence until verification passes",
    command: "pnpm candidate:lifecycle:verify -- <public-evidence.json>",
    rule: "No stage may be replaced by simulated FCC, mock approval, placeholder address, or an assertion without public checkpoints",
  };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const cli = parsePlanVerifyCLI(process.argv.slice(2));
    console.log(JSON.stringify(cli.mode === "plan" ? lifecyclePlan() : validateLifecycleEvidence(await readJson(resolve(cli.path)))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
