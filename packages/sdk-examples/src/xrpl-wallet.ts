import {
  buildXrplPaymentPrepareRequest,
  type XrplPaymentPrepareRequestV1,
} from "@xrp-payguard/integrations";
import type { Hex } from "@xrp-payguard/protocol";

export interface XrplWalletFdcPreviewInput {
  network: "testnet" | "mainnet";
  transactionId: Hex;
  proofOwner: string;
}

export interface XrplWalletFdcPreviewV1 {
  status: "PREPARED_NOT_SUBMITTED";
  request: XrplPaymentPrepareRequestV1;
  nextRequiredGate: "AUTHENTICATED_VERIFIER_PREPARE";
}

/**
 * Converts a public, already-submitted XRPL transaction ID into the exact
 * public FDC prepare body. The wallet keeps signing and submission outside
 * this helper; an XRPL seed is neither accepted nor needed here.
 */
export function prepareXrplWalletFdcPreview(
  input: XrplWalletFdcPreviewInput,
): XrplWalletFdcPreviewV1 {
  return {
    status: "PREPARED_NOT_SUBMITTED",
    request: buildXrplPaymentPrepareRequest(input),
    nextRequiredGate: "AUTHENTICATED_VERIFIER_PREPARE",
  };
}
