import { getAddress, keccak256, padHex, stringToHex, type Hex } from "viem";
import { ACTION_FTESTXRP_TRANSFER, CHAIN_ID, ZERO_BYTES32, policyCommitment, type PolicyV1 } from "@xrp-payguard/protocol";

export interface StudioInput {
  policyId: string;
  owner: Hex;
  target: Hex;
  maxPerAction: bigint;
  dailyCap: bigint;
  startAt: bigint;
  endAt: bigint;
}

export interface PublicPreview {
  commitment: Hex;
  chain: string;
  visible: readonly string[];
  privateBoundary: readonly string[];
}

const id = (value: string): Hex => padHex(stringToHex(value), { size: 32 });

export function buildInMemoryPolicy(input: StudioInput): PolicyV1 {
  const policyId = id(input.policyId.trim() || "payguard-policy");
  return {
    schemaVersion: 1,
    chainId: CHAIN_ID,
    registry: input.owner,
    vault: input.owner,
    router: input.owner,
    owner: input.owner,
    policyId,
    policyVersion: 1,
    asset: input.owner,
    referenceCurrency: id("USD"),
    maxPerAction: input.maxPerAction,
    dailyCap: input.dailyCap,
    rollingCap: input.dailyCap,
    rollingWindowSeconds: 86_400n,
    startAt: input.startAt,
    endAt: input.endAt,
    cooldownSeconds: 0n,
    maxOccurrences: 0,
    allowTargets: [input.target],
    denyTargets: [],
    allowRequesters: [input.owner],
    allowActionTypes: [ACTION_FTESTXRP_TRANSFER],
    requireFtso: false,
    ftsoFeedId: ZERO_BYTES32,
    maxPriceAgeSeconds: 0n,
    // This value exists only in this function's memory and is never rendered,
    // persisted, transmitted, or included in public evidence.
    privateSalt: keccak256(stringToHex(`in-memory:${input.policyId}`)),
    submissionNonce: keccak256(stringToHex(`submission:${input.policyId}`)),
  };
}

export function buildPublicPreview(input: StudioInput): PublicPreview {
  const policy = buildInMemoryPolicy(input);
  return {
    commitment: policyCommitment(policy),
    chain: "Coston2 · chain 114 · planned",
    visible: ["policy commitment", "owner address", "policy version", "public action target", "asset and amount at request time"],
    privateBoundary: ["target groups and deny precedence", "caps and schedule relationships", "delegated requester rules", "private salt and submission nonce"],
  };
}

export function normalizeStudioAddress(value: string): Hex {
  return getAddress(value) as Hex;
}
