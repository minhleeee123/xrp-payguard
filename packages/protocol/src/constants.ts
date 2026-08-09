import { keccak256, padHex, stringToHex } from "viem";

export const CHAIN_ID = 114n;
export const POLICY_SCHEMA_V1 = keccak256(stringToHex("POLICY_SCHEMA_V1"));
export const POLICY_RECEIPT_V1 = keccak256(stringToHex("POLICY_RECEIPT_V1"));
export const ACTION_REQUEST_V1 = keccak256(stringToHex("ACTION_REQUEST_V1"));
export const SPEND_CHECKPOINT_V1 = keccak256(stringToHex("SPEND_CHECKPOINT_V1"));
export const EVALUATION_RESULT_V1 = keccak256(stringToHex("EVALUATION_RESULT_V1"));
export const FDC_TRIGGER_SNAPSHOT_V1 = keccak256(stringToHex("FDC_TRIGGER_SNAPSHOT_V1"));
export const POLICY_INPUT_V1 = keccak256(stringToHex("POLICY_INPUT_V1"));
export const FDC_XRP_PAYMENT_V1 = padHex(stringToHex("XRPPayment"), { size: 32, dir: "right" });
export const ACTION_FTESTXRP_TRANSFER = keccak256(stringToHex("FTESTXRP_TRANSFER_V1"));
export const FCC_POLICY_RECEIPT_PREFIX = padHex(stringToHex("PAYGUARD_POLICY_RECEIPT_V1"), { size: 32, dir: "right" });
export const FCC_EVALUATION_PREFIX = padHex(stringToHex("PAYGUARD_EVALUATION_V1"), { size: 32, dir: "right" });
export const FCC_POLICY_INGRESS_PREFIX = padHex(stringToHex("PAYGUARD_POLICY_INGRESS_V1"), { size: 32, dir: "right" });

export const ZERO_BYTES32 = `0x${"00".repeat(32)}` as const;
export const NO_FDC_DESCRIPTOR_V1 = Object.freeze({
  requireFdc: false,
  fdcAttestationType: ZERO_BYTES32,
  fdcSourceId: ZERO_BYTES32,
  fdcSourceAddressHash: ZERO_BYTES32,
  fdcReceivingAddressHash: ZERO_BYTES32,
  fdcMemoMode: 0,
  fdcRequireDestinationTag: false,
  fdcDestinationTag: 0,
  fdcMinReceivedAmount: 0n,
  fdcMaxReceivedAmount: 0n,
  maxFdcAgeSeconds: 0n,
  fdcConsumer: "0x0000000000000000000000000000000000000000" as const,
});

export const REASON_CODE: Record<import("./types.js").PublicReasonClass, number> = {
  OK: 0,
  POLICY_DENIED: 1,
  MALFORMED: 2,
  WRONG_DOMAIN: 3,
  STALE_INPUT: 4,
  DEPENDENCY_UNAVAILABLE: 5,
  EXPIRED: 6,
  STOPPED: 7,
  INSUFFICIENT_BALANCE: 8,
  CAP_EXCEEDED: 9,
  OCCURRENCE_EXCEEDED: 10,
  TARGET_DENIED: 11,
  REQUESTER_DENIED: 12,
  ACTION_DENIED: 13,
  FTSO_INVALID: 14,
  COOLDOWN: 15,
  FDC_INVALID: 16,
};
