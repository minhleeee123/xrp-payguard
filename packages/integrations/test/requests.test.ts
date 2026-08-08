import { describe, expect, it } from "vitest";
import { padHex, stringToHex, zeroHash, type Hex } from "viem";
import {
  ACTION_FTESTXRP_TRANSFER,
  actionRequestHash,
  ZERO_BYTES32,
  type ActionRequestV1,
} from "@xrp-payguard/protocol";
import {
  decodePublicRequestSnapshot,
  encodePublicRequestSnapshot,
  publicRequestReadiness,
  publicRequestReadState,
  unavailableRequestState,
} from "../src/requests.js";

const id = (value: string): Hex => padHex(stringToHex(value), { size: 32 });
const registry = "0x0000000000000000000000000000000000000012";
const vault = "0x0000000000000000000000000000000000000013";
const router = "0x0000000000000000000000000000000000000014";
const requester = "0x0000000000000000000000000000000000000015";
const target = "0x0000000000000000000000000000000000000016";
const asset = "0x0000000000000000000000000000000000000017";

const request: ActionRequestV1 = {
  chainId: 114n,
  registry: registry as Hex,
  vault: vault as Hex,
  router: router as Hex,
  policyId: id("policy"),
  policyVersion: 1,
  policyCommitment: id("commitment"),
  requestId: id("request"),
  requestNonce: 1n,
  attempt: 0,
  requester: requester as Hex,
  target: target as Hex,
  asset: asset as Hex,
  actionType: ACTION_FTESTXRP_TRANSFER,
  amount: 75n,
  scheduleSlot: 1_000n,
  occurrence: 1,
  spendCheckpoint: id("spend-genesis"),
  balanceCheckpoint: id("balance-genesis"),
  inputCommitment: ZERO_BYTES32,
  createdAt: 1_000n,
  graceDeadline: 1_050n,
  expiry: 1_100n,
};

const baseWire = {
  chainId: "114",
  registry,
  vault,
  router,
  policyId: request.policyId,
  policyVersion: "1",
  policyCommitment: request.policyCommitment,
  requestId: request.requestId,
  requestNonce: "1",
  attempt: "0",
  requester,
  target,
  asset,
  actionType: request.actionType,
  amount: "75",
  scheduleSlot: "1000",
  occurrence: "1",
  spendCheckpoint: request.spendCheckpoint,
  balanceCheckpoint: request.balanceCheckpoint,
  inputCommitment: request.inputCommitment,
  createdAt: "1000",
  graceDeadline: "1050",
  expiry: "1100",
  status: "PENDING" as const,
  requestHash: actionRequestHash(request),
  approvedDigest: zeroHash,
  matchingCount: "0",
  decision: "PENDING" as const,
  publicReasonClass: null,
  approvedAmount: "0",
  approvedCheckpoint: zeroHash,
  approvedNonce: zeroHash,
  approvedAttempt: "0",
  approvedIssuedAt: "0",
  approvedExpiry: "0",
};

const allowedWire = {
  ...baseWire,
  status: "ALLOWED" as const,
  approvedDigest: id("evaluation-digest"),
  matchingCount: "2",
  decision: "ALLOW" as const,
  publicReasonClass: "OK" as const,
  approvedAmount: "75",
  approvedCheckpoint: id("spend-next"),
  approvedNonce: request.requestId,
  approvedIssuedAt: "1040",
  approvedExpiry: "1100",
};

const deniedWire = {
  ...baseWire,
  status: "DENIED" as const,
  approvedDigest: id("deny-digest"),
  matchingCount: "2",
  decision: "DENY" as const,
  publicReasonClass: "CAP_EXCEEDED" as const,
  approvedCheckpoint: request.spendCheckpoint,
  approvedNonce: request.requestId,
  approvedIssuedAt: "1040",
  approvedExpiry: "1100",
};

describe("public request snapshot", () => {
  it("round-trips public request fields and derives schedule readiness", () => {
    const decoded = decodePublicRequestSnapshot(baseWire);
    expect(encodePublicRequestSnapshot(decoded)).toEqual(baseWire);
    expect(publicRequestReadiness(decoded, 900n)).toBe("WAITING_FOR_SLOT");
    expect(publicRequestReadState(decoded, 1_050n)).toMatchObject({ status: "PENDING", readiness: "WAITING_FOR_THRESHOLD", publicFacts: true });
    expect(publicRequestReadiness(decoded, 1_101n)).toBe("EXPIRED");
  });

  it("only marks a chain-derived threshold ALLOW as executable", () => {
    const decoded = decodePublicRequestSnapshot(allowedWire);
    expect(publicRequestReadState(decoded, 1_050n)).toMatchObject({ status: "ALLOWED", readiness: "READY_TO_EXECUTE" });
    expect(publicRequestReadState({ ...decoded, status: "EXECUTED" }, 1_050n)).toMatchObject({ status: "EXECUTED", readiness: "EXECUTED" });
  });

  it("keeps deny reason and checkpoint public without exposing policy material", () => {
    const decoded = decodePublicRequestSnapshot(deniedWire);
    expect(decoded.publicReasonClass).toBe("CAP_EXCEEDED");
    expect(decoded.approvedAmount).toBe(0n);
    expect(decoded.approvedCheckpoint).toBe(request.spendCheckpoint.toLowerCase());
  });

  it("rejects hash drift, private fields, numeric JSON, unsupported actions, and invalid threshold fields", () => {
    expect(() => decodePublicRequestSnapshot({ ...baseWire, policy: "private" })).toThrow(/unknown public request field/);
    expect(() => decodePublicRequestSnapshot({ ...baseWire, amount: 75 })).toThrow(/quoted/);
    expect(() => decodePublicRequestSnapshot({ ...baseWire, requestHash: id("forged") })).toThrow(/hash/);
    expect(() => decodePublicRequestSnapshot({ ...baseWire, actionType: id("other-action") })).toThrow(/unsupported/);
    expect(() => decodePublicRequestSnapshot({ ...baseWire, matchingCount: "2" })).toThrow(/pending/);
    expect(() => decodePublicRequestSnapshot({ ...allowedWire, matchingCount: "1" })).toThrow(/threshold/);
    expect(() => decodePublicRequestSnapshot({ ...deniedWire, publicReasonClass: "OK" })).toThrow(/deny/);
  });

  it("represents unavailable providers without fabricating request state", () => {
    expect(unavailableRequestState()).toEqual({ status: "UNAVAILABLE", reason: "RPC_UNCONFIGURED", publicFacts: false });
    expect(unavailableRequestState("SNAPSHOT_INVALID").publicFacts).toBe(false);
  });
});
