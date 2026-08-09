import {
  encodeHashInstructionMemo,
  type HashInstructionEncoding,
  type SmartAccountCall,
} from "@xrp-payguard/integrations";

export interface FlareSmartAccountPreviewInput {
  calls: readonly SmartAccountCall[];
  sender: string;
  nonce: bigint;
  walletId: number;
  executorFeeUBA: bigint;
}

export interface FlareSmartAccountPreviewV1 {
  status: "ENCODED_NOT_SIGNED";
  instruction: HashInstructionEncoding;
  nextRequiredGate: "WALLET_REVIEW_AND_SIGNATURE";
}

/**
 * Encodes the public Smart Account 0xFE memo after the caller has resolved the
 * PersonalAccount and nonce at runtime. It never signs, broadcasts, or decides
 * whether a private PayGuard policy allows the calls.
 */
export function prepareFlareSmartAccountPreview(
  input: FlareSmartAccountPreviewInput,
): FlareSmartAccountPreviewV1 {
  return {
    status: "ENCODED_NOT_SIGNED",
    instruction: encodeHashInstructionMemo(input),
    nextRequiredGate: "WALLET_REVIEW_AND_SIGNATURE",
  };
}
