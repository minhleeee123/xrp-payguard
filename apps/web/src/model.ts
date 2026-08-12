import { formatUnits, getAddress, hexToBytes, keccak256, parseUnits, stringToHex, toHex, type Hex } from "viem";
import {
  ACTION_FTESTXRP_TRANSFER,
  CHAIN_ID,
  NO_FDC_DESCRIPTOR_V1,
  POLICY_SCHEMA_V1,
  ZERO_BYTES32,
  policyCommitment,
  type PolicyV1,
} from "@xrp-payguard/protocol";

export type StudioTemplateId = "personal-recurring" | "delegated-allowance" | "treasury-vendor";

export interface StudioDraft {
  templateId: StudioTemplateId;
  policyName: string;
  owner: string;
  registry: string;
  vault: string;
  router: string;
  asset: string;
  target: string;
  payeeCanRequest: boolean;
  requester: string;
  maxPerAction: string;
  dailyCap: string;
  startAt: string;
  endAt: string;
  scheduleIntervalSeconds: string;
  scheduleGraceSeconds: string;
  maxOccurrences: string;
}

export interface StudioEntropy {
  privateSalt: Hex;
  submissionNonce: Hex;
}

export interface StudioTemplate {
  id: StudioTemplateId;
  name: string;
  summary: string;
  draft: StudioDraft;
}

export interface StudioIssue {
  field: keyof StudioDraft | "policy";
  message: string;
}

export interface PreviewItem {
  label: string;
  value: string;
}

export interface PublicPolicyEvidence {
  chainId: string;
  schema: Hex;
  owner: Hex;
  policyId: Hex;
  policyVersion: number;
  policyCommitment: Hex;
  registry: Hex;
  vault: Hex;
  router: Hex;
  custodyThreshold: 3;
  resultThreshold: 2;
}

export interface StudioCompilation {
  policy: PolicyV1;
  publicEvidence: PublicPolicyEvidence;
  publicAtActivation: readonly PreviewItem[];
  publicAtRequest: readonly PreviewItem[];
  privateInFcc: readonly PreviewItem[];
}

export class StudioValidationError extends Error {
  constructor(readonly issues: readonly StudioIssue[]) {
    super(issues[0]?.message ?? "Policy draft is invalid");
    this.name = "StudioValidationError";
  }
}

const LOCAL_DOMAIN = {
  registry: "0x0000000000000000000000000000000000000011",
  vault: "0x0000000000000000000000000000000000000012",
  router: "0x0000000000000000000000000000000000000013",
  asset: "0x0000000000000000000000000000000000000014",
} as const;

const COMMON_DRAFT = {
  owner: "0x00000000000000000000000000000000000000a1",
  target: "0x00000000000000000000000000000000000000c3",
  payeeCanRequest: true,
  requester: "",
  ...LOCAL_DOMAIN,
} as const;

export const STUDIO_TEMPLATES: readonly StudioTemplate[] = [
  {
    id: "personal-recurring",
    name: "Personal recurring",
    summary: "A fixed public transfer inside a private weekly schedule and cap.",
    draft: {
      templateId: "personal-recurring",
      policyName: "weekly-subscription",
      ...COMMON_DRAFT,
      maxPerAction: "0.075",
      dailyCap: "0.5",
      startAt: "1800000000",
      endAt: "1810000000",
      scheduleIntervalSeconds: "604800",
      scheduleGraceSeconds: "86400",
      maxOccurrences: "12",
    },
  },
  {
    id: "delegated-allowance",
    name: "Delegated allowance",
    summary: "Let one authorized requester claim bounded ad-hoc payments to an allowed target.",
    draft: {
      templateId: "delegated-allowance",
      policyName: "delegated-allowance",
      ...COMMON_DRAFT,
      maxPerAction: "0.025",
      dailyCap: "0.1",
      startAt: "1800000000",
      endAt: "1810000000",
      scheduleIntervalSeconds: "0",
      scheduleGraceSeconds: "0",
      maxOccurrences: "20",
    },
  },
  {
    id: "treasury-vendor",
    name: "Treasury vendor",
    summary: "A bounded recurring vendor payment with a private treasury cap.",
    draft: {
      templateId: "treasury-vendor",
      policyName: "vendor-weekly",
      ...COMMON_DRAFT,
      maxPerAction: "0.25",
      dailyCap: "1",
      startAt: "1800000000",
      endAt: "1820000000",
      scheduleIntervalSeconds: "604800",
      scheduleGraceSeconds: "172800",
      maxOccurrences: "24",
    },
  },
] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DECIMAL = /^(0|[1-9][0-9]*)$/;
export const DEFAULT_STUDIO_POLICY_DURATION_SECONDS = 7n * 24n * 60n * 60n;

export function studioTemplateDraft(templateId: StudioTemplateId): StudioDraft {
  const template = STUDIO_TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) throw new Error("Unknown policy template");
  return { ...template.draft };
}

export function defaultStudioPolicyWindow(startAt = BigInt(Math.floor(Date.now() / 1_000))): Pick<StudioDraft, "startAt" | "endAt"> {
  if (startAt <= 0n) throw new Error("Policy start time must be positive");
  return { startAt: startAt.toString(), endAt: (startAt + DEFAULT_STUDIO_POLICY_DURATION_SECONDS).toString() };
}

export function createStudioEntropy(fill?: (bytes: Uint8Array<ArrayBuffer>) => void): StudioEntropy {
  const source = fill ?? ((bytes: Uint8Array<ArrayBuffer>) => { crypto.getRandomValues(bytes); });
  const salt = new Uint8Array(32);
  const nonce = new Uint8Array(32);
  source(salt);
  source(nonce);
  if (salt.length !== 32 || nonce.length !== 32) throw new Error("Entropy source must return 32-byte values");
  const privateSalt = toHex(salt);
  const submissionNonce = toHex(nonce);
  if (privateSalt === ZERO_BYTES32 || submissionNonce === ZERO_BYTES32 || privateSalt === submissionNonce) {
    throw new Error("Entropy source returned unsafe policy material");
  }
  return { privateSalt, submissionNonce };
}

export function validateStudioDraft(draft: StudioDraft): readonly StudioIssue[] {
  const issues: StudioIssue[] = [];
  const policyName = draft.policyName.trim();
  if (policyName.length < 3 || policyName.length > 64) {
    issues.push({ field: "policyName", message: "Policy name must contain 3 to 64 characters." });
  }

  const addresses: readonly (keyof Pick<StudioDraft, "owner" | "registry" | "vault" | "router" | "asset" | "target">)[] = [
    "owner", "registry", "vault", "router", "asset", "target",
  ];
  for (const field of addresses) {
    try {
      if (normalizeStudioAddress(draft[field]).toLowerCase() === ZERO_ADDRESS) throw new Error("zero address");
    } catch {
      issues.push({ field, message: `${fieldLabel(field)} must be a non-zero EVM address.` });
    }
  }
  if (draft.requester.trim()) {
    try {
      if (normalizeStudioAddress(draft.requester).toLowerCase() === ZERO_ADDRESS) throw new Error("zero address");
    } catch {
      issues.push({ field: "requester", message: "Additional requester must be a non-zero EVM address." });
    }
  }

  const maxPerAction = tokenAmountField(draft, "maxPerAction", issues);
  const dailyCap = tokenAmountField(draft, "dailyCap", issues);
  const startAt = decimalField(draft, "startAt", issues);
  const endAt = decimalField(draft, "endAt", issues);
  const interval = decimalField(draft, "scheduleIntervalSeconds", issues);
  const grace = decimalField(draft, "scheduleGraceSeconds", issues);
  decimalField(draft, "maxOccurrences", issues, 32);

  if (maxPerAction !== null && maxPerAction === 0n) {
    issues.push({ field: "maxPerAction", message: "Maximum per payment must be greater than zero FTestXRP." });
  }
  if (dailyCap !== null && dailyCap === 0n) {
    issues.push({ field: "dailyCap", message: "Maximum per day must be greater than zero FTestXRP." });
  }
  if (maxPerAction !== null && dailyCap !== null && dailyCap < maxPerAction) {
    issues.push({ field: "dailyCap", message: "Maximum per day cannot be lower than the maximum per payment." });
  }
  if (startAt !== null && endAt !== null && (startAt === 0n || endAt <= startAt)) {
    issues.push({ field: "endAt", message: "End time must be later than a non-zero start time." });
  }
  if (interval !== null && grace !== null) {
    if ((interval === 0n) !== (grace === 0n)) {
      issues.push({ field: "scheduleGraceSeconds", message: "Interval and grace must both be zero for ad-hoc mode or both be positive." });
    } else if (interval !== 0n && grace >= interval) {
      issues.push({ field: "scheduleGraceSeconds", message: "Recurring grace must be shorter than the interval." });
    }
  }
  return issues;
}

export function compileStudioDraft(draft: StudioDraft, entropy: StudioEntropy): StudioCompilation {
  const issues = validateStudioDraft(draft);
  if (issues.length > 0) throw new StudioValidationError(issues);
  if (entropy.privateSalt.toLowerCase() === entropy.submissionNonce.toLowerCase()) {
    throw new Error("private salt and submission nonce must be distinct");
  }

  const owner = normalizeStudioAddress(draft.owner);
  const target = normalizeStudioAddress(draft.target);
  const requester = draft.requester.trim() ? normalizeStudioAddress(draft.requester) : null;
  const allowRequesters = [
    ...(draft.payeeCanRequest ? [target] : []),
    ...(requester ? [requester] : []),
  ].filter((candidate, index, values) => candidate.toLowerCase() !== owner.toLowerCase()
    && values.findIndex((value) => value.toLowerCase() === candidate.toLowerCase()) === index);
  const policyName = draft.policyName.trim();
  const policy: PolicyV1 = {
    schemaVersion: 1,
    chainId: CHAIN_ID,
    registry: normalizeStudioAddress(draft.registry),
    vault: normalizeStudioAddress(draft.vault),
    router: normalizeStudioAddress(draft.router),
    owner,
    policyId: keccak256(stringToHex(`PAYGUARD_POLICY_ID_V1:${policyName}`)),
    policyVersion: 1,
    asset: normalizeStudioAddress(draft.asset),
    referenceCurrency: toHex(new TextEncoder().encode("USD"), { size: 32 }),
    maxPerAction: parseUnits(draft.maxPerAction, 6),
    dailyCap: parseUnits(draft.dailyCap, 6),
    rollingCap: parseUnits(draft.dailyCap, 6),
    rollingWindowSeconds: 86_400n,
    startAt: BigInt(draft.startAt),
    endAt: BigInt(draft.endAt),
    scheduleIntervalSeconds: BigInt(draft.scheduleIntervalSeconds),
    scheduleGraceSeconds: BigInt(draft.scheduleGraceSeconds),
    cooldownSeconds: 0n,
    maxOccurrences: Number(BigInt(draft.maxOccurrences)),
    allowTargets: [target],
    denyTargets: [],
    allowRequesters,
    allowActionTypes: [ACTION_FTESTXRP_TRANSFER],
    requireFtso: false,
    ftsoFeedId: ZERO_BYTES32,
    maxPriceAgeSeconds: 0n,
    ...NO_FDC_DESCRIPTOR_V1,
    privateSalt: assertEntropy(entropy.privateSalt, "private salt"),
    submissionNonce: assertEntropy(entropy.submissionNonce, "submission nonce"),
  };

  const commitment = policyCommitment(policy);
  const publicEvidence: PublicPolicyEvidence = {
    chainId: CHAIN_ID.toString(),
    schema: POLICY_SCHEMA_V1,
    owner: policy.owner,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyCommitment: commitment,
    registry: policy.registry,
    vault: policy.vault,
    router: policy.router,
    custodyThreshold: 3,
    resultThreshold: 2,
  };

  return {
    policy,
    publicEvidence,
    publicAtActivation: [
      { label: "Network", value: `Coston2 · chain ${CHAIN_ID.toString()} · target` },
      { label: "Owner", value: policy.owner },
      { label: "Policy ID / version", value: `${policy.policyId} · v${policy.policyVersion}` },
      { label: "Contract domain", value: `${policy.registry} · ${policy.vault} · ${policy.router}` },
      { label: "Commitment", value: commitment },
      { label: "Custody / result threshold", value: "3 of 3 receipts · 2 matching results" },
    ],
    publicAtRequest: [
      { label: "Action", value: "FTestXRP-like public transfer" },
      { label: "Target, asset, and amount", value: "Public only when an action request is created" },
      { label: "Timing", value: "Slot, occurrence, expiry, and execution time are public" },
      { label: "State", value: "Spend, balance, FTSO/FDC, and decision commitments are public" },
    ],
    privateInFcc: [
      { label: "Allowed target rule", value: target },
      { label: "Asset rule", value: policy.asset },
      { label: "Per-action / daily cap", value: `${formatUnits(policy.maxPerAction, 6)} / ${formatUnits(policy.dailyCap, 6)} FTestXRP` },
      { label: "Policy window", value: `${policy.startAt}–${policy.endAt} UTC epoch seconds` },
      { label: "Recurring rule", value: policy.scheduleIntervalSeconds === 0n ? "Ad-hoc" : `Every ${policy.scheduleIntervalSeconds}s · ${policy.scheduleGraceSeconds}s grace` },
      { label: "Occurrence limit", value: policy.maxOccurrences === 0 ? "No policy-specific limit" : String(policy.maxOccurrences) },
      { label: "Requester rule", value: allowRequesters.length === 0 ? "Policy owner only" : `Policy owner + ${allowRequesters.length} authorized wallet${allowRequesters.length === 1 ? "" : "s"}` },
      { label: "Secret material", value: "Random salt and submission nonce (values never displayed)" },
    ],
  };
}

export function normalizeStudioAddress(value: string): Hex {
  return getAddress(value.trim()) as Hex;
}

function decimalField(draft: StudioDraft, field: "startAt" | "endAt" | "scheduleIntervalSeconds" | "scheduleGraceSeconds" | "maxOccurrences", issues: StudioIssue[], bits = 256): bigint | null {
  const value = draft[field];
  if (!DECIMAL.test(value)) {
    issues.push({ field, message: `${fieldLabel(field)} must be an unsigned decimal integer.` });
    return null;
  }
  const parsed = BigInt(value);
  if (parsed >= 1n << BigInt(bits)) {
    issues.push({ field, message: `${fieldLabel(field)} exceeds uint${bits}.` });
    return null;
  }
  return parsed;
}

function tokenAmountField(draft: StudioDraft, field: "maxPerAction" | "dailyCap", issues: StudioIssue[]): bigint | null {
  const value = draft[field];
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(value)) {
    issues.push({ field, message: `${fieldLabel(field)} must be a positive FTestXRP amount with at most 6 decimals.` });
    return null;
  }
  try {
    const parsed = parseUnits(value, 6);
    if (parsed >= 1n << 256n) throw new Error("overflow");
    return parsed;
  } catch {
    issues.push({ field, message: `${fieldLabel(field)} exceeds the supported FTestXRP range.` });
    return null;
  }
}

function fieldLabel(field: keyof StudioDraft): string {
  return ({
    templateId: "Template",
    policyName: "Policy name",
    owner: "Owner",
    registry: "Registry",
    vault: "Vault",
    router: "Router",
    asset: "Asset",
    target: "Allowed target",
    payeeCanRequest: "Payee requester access",
    requester: "Authorized requester",
    maxPerAction: "Maximum per payment",
    dailyCap: "Maximum per day",
    startAt: "Start time",
    endAt: "End time",
    scheduleIntervalSeconds: "Schedule interval",
    scheduleGraceSeconds: "Schedule grace",
    maxOccurrences: "Maximum occurrences",
  })[field];
}

function assertEntropy(value: Hex, label: string): Hex {
  if (hexToBytes(value).length !== 32 || value === ZERO_BYTES32) throw new Error(`${label} must be a non-zero bytes32 value`);
  return value;
}
