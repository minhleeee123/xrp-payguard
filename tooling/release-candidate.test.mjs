import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateCandidatePlan, CANDIDATE_PLAN_PATH } from "./release-candidate.mjs";
import { validateLifecycleEvidence } from "./coston2-v2-lifecycle.mjs";
import { REQUIRED_OUTAGE_DRILLS, validateOutageDrillEvidence } from "./coston2-v2-outage-drills.mjs";
import { validateRedemptionEvidence } from "./coston2-v2-redemption.mjs";
import { USER_TASKS, validateUserValidationReport } from "./user-validation.mjs";
import { readJson } from "./candidate-public.mjs";

const hash = (digit) => `0x${digit.repeat(64)}`;
const address = (digit) => `0x${digit.repeat(40)}`;
const transaction = (digit) => ({ transactionHash: hash(digit), blockNumber: "100", status: "success" });
const header = (kind) => ({
  schemaVersion: 1,
  kind,
  status: "verified",
  verified: true,
  live: true,
  network: { name: "flare-coston2", chainId: 114 },
  release: { sourceCommit: "a".repeat(40), manifestDigest: hash("b") },
  observedAt: "2026-08-10T00:00:00.000Z",
  publicOnly: true,
});

function lifecycle() {
  return {
    ...header("payguard-coston2-v2-canonical-lifecycle"),
    binding: { registry: address("1"), vault: address("2"), router: address("3"), account: address("4"), policyId: hash("1"), policyHash: hash("2") },
    stages: {
      funding: transaction("1"),
      custody: { status: "all-three-receipted", machineIds: [hash("3"), hash("4"), hash("5")], receiptHashes: [hash("6"), hash("7"), hash("8")], freezeTransaction: transaction("2") },
      allow: { decision: "ALLOW", executed: true, requestHash: hash("9"), resultCommitment: hash("a"), matchingResults: 2, transaction: transaction("3") },
      deny: { decision: "DENY", executed: false, requestHash: hash("b"), resultCommitment: hash("c"), matchingResults: 2, transaction: transaction("4") },
      stop: { actor: "policy-owner", resultingState: "stopped", transaction: transaction("5") },
      resume: { actor: "policy-owner", resultingState: "active", transaction: transaction("6") },
      revoke: { actor: "policy-owner", resultingState: "revoked", transaction: transaction("7") },
      redemption: { separateEvidenceVerified: true, evidenceDigest: hash("d") },
    },
    assertions: { sameRelease: true, samePolicy: true, allThreeCustodyBeforeFreeze: true, twoMatchingResults: true, denyDidNotExecute: true, ownerOnlyLifecycle: true, onchainReplayAuthority: true, noPrivateMaterial: true },
  };
}

function outages() {
  return {
    ...header("payguard-coston2-v2-outage-drills"),
    drills: REQUIRED_OUTAGE_DRILLS.map((id, index) => ({ id, liveFaultInjected: true, failClosed: true, mockSuccessObserved: false, observedOutcome: index % 2 ? "no-execution" : "unavailable", startedAt: "2026-08-10T00:00:00.000Z", recoveredAt: "2026-08-10T00:01:00.000Z", recoveryVerified: true, publicCheckpoint: `public checkpoint ${index}` })),
    assertions: { sameRelease: true, noMockFallback: true, noUnsupportedIdentityRestore: true, canonicalStatePreserved: true, noPrivateMaterial: true },
  };
}

function redemption() {
  return {
    ...header("payguard-coston2-v2-canonical-redemption"),
    binding: { registry: address("1"), vault: address("2"), asset: address("3"), policyId: hash("1"), requestHash: hash("2") },
    vaultSettlement: { transaction: transaction("1"), amountUBA: "1000000", accountingConserved: true },
    fassetsRedemptionRequest: { transaction: transaction("2"), requestId: "42", amountUBA: "1000000" },
    outcome: { type: "xrpl-payout", xrplTransactionHash: hash("3"), ledgerIndex: "900", validated: true, transactionResult: "tesSUCCESS", deliveredAmountDrops: "995000" },
    assertions: { sameRelease: true, samePolicyAndRequest: true, officialFAssetsContracts: true, noDoubleSpend: true, assetConservation: true, publicCheckpointsRevalidated: true, noPrivateMaterial: true },
  };
}

function userReport() {
  return {
    schemaVersion: 1,
    kind: "payguard-user-validation-aggregate",
    status: "verified",
    verified: true,
    consentConfirmed: true,
    anonymizedAggregateOnly: true,
    publicOnly: true,
    completedAt: "2026-08-10T00:00:00.000Z",
    cohorts: { policyOwners: 5, payeesOrExecutors: 3, total: 8 },
    tasks: USER_TASKS.map((id) => ({ id, attempted: 8, completed: 7, completionRate: 0.875 })),
    metrics: { privateBoundaryComprehension: 0.875, failClosedComprehension: 0.75, redemptionComprehension: 0.625, medianTaskMinutes: 4.5 },
    prioritizedFindings: [{ severity: "medium", summary: "Aggregate participants needed clearer redemption status language", disposition: "planned copy revision" }],
  };
}

describe("V2 release-candidate preparation", () => {
  it("keeps the tracked candidate explicitly planned and fully blocked", async () => {
    assert.deepEqual(validateCandidatePlan(await readJson(CANDIDATE_PLAN_PATH)), { status: "planned", verified: false, blockers: 6, preparedArtifacts: 21 });
  });

  it("accepts a complete live lifecycle and rejects simulated or owner-lifecycle drift", () => {
    assert.equal(validateLifecycleEvidence(lifecycle()).stages, 8);
    assert.throws(() => validateLifecycleEvidence({ ...lifecycle(), live: false }), /live/);
    const drift = lifecycle();
    drift.stages.stop.actor = "admin";
    assert.throws(() => validateLifecycleEvidence(drift), /policy-owner/);
  });

  it("requires every outage drill to fail closed and recover", () => {
    assert.equal(validateOutageDrillEvidence(outages()).drills, REQUIRED_OUTAGE_DRILLS.length);
    const mockFallback = outages();
    mockFallback.drills[0].mockSuccessObserved = true;
    assert.throws(() => validateOutageDrillEvidence(mockFallback), /mockSuccessObserved/);
    const missing = outages();
    missing.drills.pop();
    assert.throws(() => validateOutageDrillEvidence(missing), /length 11/);
  });

  it("binds redemption settlement and request amounts and accepts the canonical default path", () => {
    assert.equal(validateRedemptionEvidence(redemption()).outcome, "xrpl-payout");
    const mismatch = redemption();
    mismatch.fassetsRedemptionRequest.amountUBA = "999999";
    assert.throws(() => validateRedemptionEvidence(mismatch), /amount must equal/);
    const defaulted = redemption();
    defaulted.outcome = { type: "redemption-default", defaultTransaction: transaction("4"), compensationObserved: true };
    assert.equal(validateRedemptionEvidence(defaulted).outcome, "redemption-default");
  });

  it("accepts only consented anonymized aggregate user evidence at the cohort floor", () => {
    assert.equal(validateUserValidationReport(userReport()).participants, 8);
    const tooSmall = userReport();
    tooSmall.cohorts.policyOwners = 4;
    tooSmall.cohorts.total = 7;
    assert.throws(() => validateUserValidationReport(tooSmall), /at least 5/);
    const raw = userReport();
    raw.rawNotes = ["must stay private"];
    assert.throws(() => validateUserValidationReport(raw), /raw participant/);
  });

  it("rejects private-material fields across future public evidence", () => {
    const privateLifecycle = lifecycle();
    privateLifecycle.policyCiphertext = "0x1234";
    assert.throws(() => validateLifecycleEvidence(privateLifecycle), /forbidden field/);
  });
});
