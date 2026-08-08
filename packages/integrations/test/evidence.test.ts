import { describe, expect, it } from "vitest";
import { padHex, stringToHex, zeroHash, type Hex } from "viem";
import {
  ACTION_FTESTXRP_TRANSFER,
  POLICY_SCHEMA_V1,
  ZERO_BYTES32,
  actionRequestHash,
  evaluationDigest,
  type ActionRequestV1,
} from "@xrp-payguard/protocol";
import {
  decodePublicAuditEvidence,
  encodePublicAuditEvidence,
  publicAuditReadState,
  unavailableAuditState,
  type PublicAuditEvidenceWireV1,
} from "../src/evidence.js";

const id = (value: string): Hex => padHex(stringToHex(value), { size: 32 });
const registry = "0x0000000000000000000000000000000000000012";
const vault = "0x0000000000000000000000000000000000000013";
const router = "0x0000000000000000000000000000000000000014";
const requester = "0x0000000000000000000000000000000000000015";
const target = "0x0000000000000000000000000000000000000016";
const asset = "0x0000000000000000000000000000000000000017";
const machineA = id("machine-a");
const machineB = id("machine-b");
const machineC = id("machine-c");
const keyA = id("key-a");
const keyB = id("key-b");
const keyC = id("key-c");

const request: ActionRequestV1 = {
  chainId: 114n, registry: registry as Hex, vault: vault as Hex, router: router as Hex, policyId: id("policy"), policyVersion: 1,
  policyCommitment: id("commitment"), requestId: id("request"), requestNonce: 1n, attempt: 0, requester: requester as Hex,
  target: target as Hex, asset: asset as Hex, actionType: ACTION_FTESTXRP_TRANSFER, amount: 75n, scheduleSlot: 1_000n,
  occurrence: 1, spendCheckpoint: id("spend-genesis"), balanceCheckpoint: id("balance-genesis"), inputCommitment: ZERO_BYTES32,
  createdAt: 1_000n, graceDeadline: 1_050n, expiry: 1_100n,
};

const requestWire = {
  chainId: "114", registry, vault, router, policyId: request.policyId, policyVersion: "1", policyCommitment: request.policyCommitment,
  requestId: request.requestId, requestNonce: "1", attempt: "0", requester, target, asset, actionType: request.actionType, amount: "75",
  scheduleSlot: "1000", occurrence: "1", spendCheckpoint: request.spendCheckpoint, balanceCheckpoint: request.balanceCheckpoint,
  inputCommitment: request.inputCommitment, createdAt: "1000", graceDeadline: "1050", expiry: "1100", status: "ALLOWED" as const,
  requestHash: actionRequestHash(request), approvedDigest: id("evaluation-digest"), matchingCount: "2", decision: "ALLOW" as const,
  publicReasonClass: "OK" as const, approvedAmount: "75", approvedCheckpoint: id("spend-next"), approvedNonce: request.requestId,
  approvedAttempt: "0", approvedIssuedAt: "1040", approvedExpiry: "1100",
};

const resultDigest = evaluationDigest({
  request,
  decision: "ALLOW",
  publicReasonClass: "OK",
  reservedAmount: 75n,
  resultingCheckpoint: id("spend-next"),
  resultNonce: request.requestId,
  attempt: 0,
  issuedAt: 1_040n,
  expiry: 1_100n,
  machineId: machineA,
  keyFingerprint: keyA,
});

const baseEvidence: PublicAuditEvidenceWireV1 = {
  schemaVersion: "1",
  evidenceBlock: "1234",
  evidenceTransactionHash: id("evidence-tx"),
  policy: {
    chainId: "114", registry, vault, router, policyId: request.policyId, policyVersion: "1", policyCommitment: request.policyCommitment,
    schema: POLICY_SCHEMA_V1, extensionId: id("extension"), codeVersion: id("code-version"), machineIds: [machineA, machineB, machineC],
    keyFingerprints: [keyA, keyB, keyC], custodyThreshold: "3", resultThreshold: "2", custodyReceiptBitmap: "7",
  },
  request: requestWire,
  decision: "ALLOW",
  publicReasonClass: "OK",
  resultDigest,
  resultNonce: request.requestId,
  resultAttempt: "0",
  resultIssuedAt: "1040",
  resultExpiry: "1100",
  resultingCheckpoint: id("spend-next"),
  resultSignerMachineIds: [machineA, machineB],
  inputKind: "NONE",
  inputFinalized: false,
  executionStatus: "NOT_EXECUTED",
  executionTransactionHash: zeroHash,
  conservation: { deposited: "1000", available: "700", reserved: "100", spent: "150", withdrawn: "25", refunded: "25", conservationAssertion: true },
};

describe("public Auditor evidence", () => {
  it("round-trips the public binding, result digest, and conservation assertion", () => {
    const decoded = decodePublicAuditEvidence(baseEvidence);
    expect(encodePublicAuditEvidence(decoded)).toEqual(baseEvidence);
    expect(publicAuditReadState(decoded)).toMatchObject({ status: "VERIFIED", publicFacts: true });
  });

  it("rejects signatures/private fields, digest drift, conservation drift, and bad signer sets", () => {
    expect(() => decodePublicAuditEvidence({ ...baseEvidence, signature: "private" })).toThrow(/unknown public evidence field/);
    expect(() => decodePublicAuditEvidence({ ...baseEvidence, policy: { ...baseEvidence.policy, ciphertext: "private" } })).toThrow(/unknown public policy evidence field/);
    expect(() => decodePublicAuditEvidence({ ...baseEvidence, resultDigest: id("forged") })).toThrow(/digest/);
    expect(() => decodePublicAuditEvidence({ ...baseEvidence, conservation: { ...baseEvidence.conservation, spent: "151" } })).toThrow(/conservation/);
    expect(() => decodePublicAuditEvidence({ ...baseEvidence, resultSignerMachineIds: [machineA, machineA] })).toThrow(/signer/);
    expect(() => decodePublicAuditEvidence({ ...baseEvidence, inputKind: "FDC", inputFinalized: true })).toThrow(/input/);
    expect(() => decodePublicAuditEvidence({ ...baseEvidence, executionStatus: "NOT_EXECUTED", executionTransactionHash: id("unexpected") })).toThrow(/execution/);
  });

  it("keeps the evidence unavailable when there is no verified public endpoint", () => {
    expect(unavailableAuditState()).toEqual({ status: "UNAVAILABLE", reason: "RPC_UNCONFIGURED", publicFacts: false });
    expect(unavailableAuditState("EVIDENCE_UNFINALIZED").publicFacts).toBe(false);
  });
});
