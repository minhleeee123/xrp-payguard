import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  address,
  decimal,
  exact,
  hex32,
  liveHeader,
  parsePlanVerifyCLI,
  readJson,
  record,
} from "./candidate-public.mjs";

function transaction(value, label) {
  const item = record(value, label);
  hex32(item.transactionHash, `${label}.transactionHash`);
  decimal(item.blockNumber, `${label}.blockNumber`, { positive: true });
  exact(item.status, "success", `${label}.status`);
  return item;
}

export function validateRedemptionEvidence(value) {
  const evidence = liveHeader(value, "payguard-coston2-v2-canonical-redemption");
  const binding = record(evidence.binding, "binding");
  address(binding.registry, "binding.registry");
  address(binding.vault, "binding.vault");
  address(binding.asset, "binding.asset");
  hex32(binding.policyId, "binding.policyId");
  hex32(binding.requestHash, "binding.requestHash");

  const settlement = record(evidence.vaultSettlement, "vaultSettlement");
  transaction(settlement.transaction, "vaultSettlement.transaction");
  const settled = decimal(settlement.amountUBA, "vaultSettlement.amountUBA", { positive: true });
  exact(settlement.accountingConserved, true, "vaultSettlement.accountingConserved");

  const request = record(evidence.fassetsRedemptionRequest, "fassetsRedemptionRequest");
  transaction(request.transaction, "fassetsRedemptionRequest.transaction");
  if (typeof request.requestId !== "string" || !/^[1-9][0-9]*$/.test(request.requestId)) throw new Error("fassetsRedemptionRequest.requestId must be a positive quoted decimal");
  const requested = decimal(request.amountUBA, "fassetsRedemptionRequest.amountUBA", { positive: true });
  if (requested !== settled) throw new Error("redemption amount must equal the canonical vault settlement amount");

  const outcome = record(evidence.outcome, "outcome");
  if (outcome.type === "xrpl-payout") {
    hex32(outcome.xrplTransactionHash, "outcome.xrplTransactionHash");
    decimal(outcome.ledgerIndex, "outcome.ledgerIndex", { positive: true });
    exact(outcome.validated, true, "outcome.validated");
    exact(outcome.transactionResult, "tesSUCCESS", "outcome.transactionResult");
    decimal(outcome.deliveredAmountDrops, "outcome.deliveredAmountDrops", { positive: true });
  } else if (outcome.type === "redemption-default") {
    transaction(outcome.defaultTransaction, "outcome.defaultTransaction");
    exact(outcome.compensationObserved, true, "outcome.compensationObserved");
  } else {
    throw new Error("outcome.type must be xrpl-payout or redemption-default");
  }

  const assertions = record(evidence.assertions, "assertions");
  for (const key of ["sameRelease", "samePolicyAndRequest", "officialFAssetsContracts", "noDoubleSpend", "assetConservation", "publicCheckpointsRevalidated", "noPrivateMaterial"]) {
    exact(assertions[key], true, `assertions.${key}`);
  }
  return { status: "verified", outcome: outcome.type, amountUBA: settled.toString() };
}

export function redemptionPlan() {
  return {
    status: "planned",
    verified: false,
    network: "flare-coston2-and-xrpl-testnet",
    legs: ["PayGuard vault settlement", "official FAssets redemption request", "XRPL payout or on-chain default", "conservation reconciliation"],
    command: "pnpm candidate:redemption:verify -- <public-evidence.json>",
    rule: "A transfer to a payee is not redemption; all canonical legs must bind the same verified release, policy, request, and amount",
  };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const cli = parsePlanVerifyCLI(process.argv.slice(2));
    console.log(JSON.stringify(cli.mode === "plan" ? redemptionPlan() : validateRedemptionEvidence(await readJson(resolve(cli.path)))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
