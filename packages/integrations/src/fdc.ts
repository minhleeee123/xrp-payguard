import type { Hex } from "@xrp-payguard/protocol";
import { getAddress, isAddress } from "viem";

export interface ExpectedXrplPayment {
  network: "testnet" | "mainnet";
  sourceId: Hex;
  txHash: Hex;
  source: string;
  destination: string;
  amountDrops: bigint;
  memoHash: Hex;
  minLedgerIndex: bigint;
}

export interface XrplPaymentProofV1 {
  attestationType: "XRPPayment";
  sourceId: Hex;
  responseCommitment: Hex;
  votingRound: bigint;
  finalized: boolean;
  network: "testnet" | "mainnet";
  txHash: Hex;
  source: string;
  destination: string;
  amountDrops: bigint;
  memoHash: Hex;
  ledgerIndex: bigint;
}

export type FdcFailure = "ATTESTATION_TYPE" | "NOT_FINALIZED" | "SOURCE_MISMATCH" | "PAYMENT_MISMATCH" | "REPLAY" | "PROOF_INVALID" | "VERIFIER_UNAVAILABLE";
export type FdcVerification = { ok: true; proofCommitment: Hex } | { ok: false; reason: FdcFailure };

export interface FdcProofVerifier {
  verify(proof: XrplPaymentProofV1): Promise<boolean>;
}

export function matchesExpectedXrplPayment(
  proof: XrplPaymentProofV1,
  expected: ExpectedXrplPayment,
): boolean {
  return proof.network === expected.network
    && proof.sourceId.toLowerCase() === expected.sourceId.toLowerCase()
    && proof.txHash.toLowerCase() === expected.txHash.toLowerCase()
    && proof.source === expected.source
    && getAddress(proof.destination) === getAddress(expected.destination)
    && proof.amountDrops === expected.amountDrops
    && proof.memoHash.toLowerCase() === expected.memoHash.toLowerCase()
    && proof.ledgerIndex >= expected.minLedgerIndex;
}

export async function verifyXrplPaymentProof(
  proof: XrplPaymentProofV1,
  expected: ExpectedXrplPayment,
  verifier: FdcProofVerifier | undefined,
  usedProofCommitments: ReadonlySet<string> = new Set(),
): Promise<FdcVerification> {
  if (proof.attestationType !== "XRPPayment") return { ok: false, reason: "ATTESTATION_TYPE" };
  if (!proof.finalized) return { ok: false, reason: "NOT_FINALIZED" };
  if (!verifier) return { ok: false, reason: "VERIFIER_UNAVAILABLE" };
  if (usedProofCommitments.has(proof.responseCommitment.toLowerCase())) return { ok: false, reason: "REPLAY" };
  if (!/^0x[0-9a-fA-F]{64}$/.test(proof.sourceId) || !/^0x[0-9a-fA-F]{64}$/.test(proof.responseCommitment)
    || proof.votingRound <= 0n || !/^0x[0-9a-fA-F]{64}$/.test(proof.txHash) || !/^0x[0-9a-fA-F]{64}$/.test(proof.memoHash)
    || !isAddress(proof.destination) || !isAddress(expected.destination)) return { ok: false, reason: "SOURCE_MISMATCH" };
  if (!matchesExpectedXrplPayment(proof, expected)) return { ok: false, reason: "PAYMENT_MISMATCH" };
  let verified = false;
  try {
    verified = await verifier.verify(proof);
  } catch {
    return { ok: false, reason: "VERIFIER_UNAVAILABLE" };
  }
  return verified ? { ok: true, proofCommitment: proof.responseCommitment } : { ok: false, reason: "PROOF_INVALID" };
}
