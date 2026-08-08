import { describe, expect, it } from "vitest";
import { padHex, stringToHex, zeroHash, type Hex } from "viem";
import { ACTION_FTESTXRP_TRANSFER, ZERO_BYTES32, actionRequestHash, type ActionRequestV1 } from "@xrp-payguard/protocol";
import {
  decodePublicPayeeReceipt,
  encodePublicPayeeReceipt,
  payeeReceiptHash,
  publicPayeeReadState,
  unavailablePayeeState,
} from "../src/payee.js";

const id = (value: string): Hex => padHex(stringToHex(value), { size: 32 });
const registry = "0x0000000000000000000000000000000000000012";
const vault = "0x0000000000000000000000000000000000000013";
const router = "0x0000000000000000000000000000000000000014";
const requester = "0x0000000000000000000000000000000000000015";
const target = "0x0000000000000000000000000000000000000016";
const asset = "0x0000000000000000000000000000000000000017";
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
  inputCommitment: request.inputCommitment, createdAt: "1000", graceDeadline: "1050", expiry: "1100", status: "EXECUTED" as const,
  requestHash: actionRequestHash(request), approvedDigest: id("evaluation-digest"), matchingCount: "2", decision: "ALLOW" as const,
  publicReasonClass: "OK" as const, approvedAmount: "75", approvedCheckpoint: id("spend-next"), approvedNonce: request.requestId,
  approvedAttempt: "0", approvedIssuedAt: "1040", approvedExpiry: "1100",
};
const receiptBody = {
  chainId: 114n, router: router as Hex, vault: vault as Hex, requestId: request.requestId, requestHash: actionRequestHash(request),
  payee: target as Hex, asset: asset as Hex, expectedAmount: 75n, expectedAt: 1_000n, expiry: 1_100n, status: "SETTLED" as const,
  settlementTransactionHash: id("settlement-tx"), settlementCheckpoint: id("spend-next"), settledAt: 1_050n,
};
const baseReceipt = {
  ...receiptBody,
  chainId: "114",
  expectedAmount: "75",
  expectedAt: "1000",
  expiry: "1100",
  settledAt: "1050",
  receiptHash: payeeReceiptHash(receiptBody),
  request: requestWire,
};

describe("public payee receipt", () => {
  it("binds expected public amount/timing to a settled request and round-trips", () => {
    const decoded = decodePublicPayeeReceipt(baseReceipt);
    expect(encodePublicPayeeReceipt(decoded)).toEqual(baseReceipt);
    expect(publicPayeeReadState(decoded)).toMatchObject({ status: "SETTLED", publicFacts: true });
  });

  it("rejects private fields, target/time drift, missing settlement, and receipt hash drift", () => {
    expect(() => decodePublicPayeeReceipt({ ...baseReceipt, policy: "private" })).toThrow(/unknown public payee receipt field/);
    expect(() => decodePublicPayeeReceipt({ ...baseReceipt, payee: registry })).toThrow(/request/);
    expect(() => decodePublicPayeeReceipt({ ...baseReceipt, expectedAt: "999" })).toThrow(/expected time/);
    expect(() => decodePublicPayeeReceipt({ ...baseReceipt, settlementTransactionHash: zeroHash })).toThrow(/settlement/);
    expect(() => decodePublicPayeeReceipt({ ...baseReceipt, receiptHash: id("forged") })).toThrow(/hash/);
  });

  it("keeps payee settlement unavailable without a verified public endpoint", () => {
    expect(unavailablePayeeState()).toEqual({ status: "UNAVAILABLE", reason: "RPC_UNCONFIGURED", publicFacts: false });
    expect(unavailablePayeeState("RECEIPT_UNFINALIZED").publicFacts).toBe(false);
  });
});
