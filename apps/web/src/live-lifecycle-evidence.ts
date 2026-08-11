import { getAddress, type Address, type Hex } from "viem";

export const LIVE_V2_LIFECYCLE_EVIDENCE_PATH = "/evidence/coston2/fcc-hosted-relay-lifecycle.json";
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

export interface LiveV2EvidenceMachine {
  teeId: Address;
  proxyId: Address;
  url: string;
  status: 2;
}

export interface LiveV2EvidenceStep {
  label: string;
  transactionHash: Hex;
}

export interface LiveV2LifecycleEvidence {
  observedBlock: bigint;
  policyCommitment: Hex;
  relayOrigin: string;
  machines: [LiveV2EvidenceMachine, LiveV2EvidenceMachine, LiveV2EvidenceMachine];
  allowRequestId: Hex;
  allowInstructionId: Hex;
  denyRequestId: Hex;
  denyInstructionId: Hex;
  denyReason: "CAP_EXCEEDED";
  steps: LiveV2EvidenceStep[];
  before: Accounting;
  afterAllow: Accounting;
  afterDeny: Accounting;
  blockers: string[];
  liveCandidate: true;
}

interface Accounting {
  deposited: bigint;
  available: bigint;
  reserved: bigint;
  spent: bigint;
  withdrawn: bigint;
  refunded: bigint;
}

const REQUIRED_TRUE_ASSERTIONS = [
  "hostedRelayHealthVerified",
  "hostedAuthenticatedPrivateIngressVerified",
  "threeRegisteredMachineReceiptsVerified",
  "requestIdOnlyEvaluationVerified",
  "relayCanonicalChainReconstructionVerified",
  "twoMatchingAllowSubmittedByRelay",
  "allowExecutionVerified",
  "twoMatchingDenySubmittedByRelay",
  "denyMovedNoFundsVerified",
  "stopResumeRevokeVerified",
  "vaultConservationVerified",
  "simulatedTee",
  "v2LiveCandidateVerified",
  "noPrivateKeyRecorded",
  "noCredentialRecorded",
  "noPolicyRecorded",
  "noCiphertextRecorded",
  "noSignatureRecorded",
  "testnetOnly",
] as const;

const REQUIRED_FALSE_ASSERTIONS = [
  "clientDecisionAccepted",
  "hardwareAttestationVerified",
  "v2ReleaseVerified",
  "verifiedPayGuardRelease",
] as const;

export function decodeLiveV2LifecycleEvidence(value: unknown): LiveV2LifecycleEvidence {
  const root = object(value, "live V2 evidence");
  if (root.schemaVersion !== 1 || root.suite !== "payguard-coston2-hosted-live-fcc-relay-lifecycle"
    || root.status !== "verified-hosted-live-simulated-fcc-lifecycle"
    || root.registryVersion !== "V2" || root.deploymentProfile !== "COSTON2_SIMULATED_V2") {
    throw new Error("unsupported live V2 evidence");
  }

  const network = object(root.network, "network");
  if (network.name !== "flare-coston2" || network.chainId !== 114) throw new Error("live V2 network mismatch");
  const observedBlock = uint(network.observedBlock, "observedBlock");
  const identifiers = object(root.publicIdentifiers, "publicIdentifiers");
  const relayOrigin = httpsOrigin(identifiers.relayOrigin, "relayOrigin");
  const policyCommitment = bytes32(identifiers.policyCommitment, "policyCommitment");

  if (!Array.isArray(identifiers.machines) || identifiers.machines.length !== 3) throw new Error("live V2 machine set invalid");
  const machines = identifiers.machines.map((entry, index) => {
    const machine = object(entry, `machines[${index}]`);
    if (machine.status !== 2) throw new Error("live V2 machine status invalid");
    return {
      teeId: address(machine.teeId, "teeId"),
      proxyId: address(machine.proxyId, "proxyId"),
      url: httpsOrigin(machine.url, "machine url"),
      status: 2 as const,
    };
  }) as [LiveV2EvidenceMachine, LiveV2EvidenceMachine, LiveV2EvidenceMachine];
  if (new Set(machines.map((machine) => machine.teeId.toLowerCase())).size !== 3
    || new Set(machines.map((machine) => machine.proxyId.toLowerCase())).size !== 3
    || new Set(machines.map((machine) => machine.url)).size !== 3) throw new Error("live V2 machines are not distinct");

  const allow = object(identifiers.allow, "allow");
  const deny = object(identifiers.deny, "deny");
  const lifecycle = object(identifiers.policyLifecycleTransactions, "policyLifecycleTransactions");
  const allowSubmit = transactionList(allow.submit, 2, "ALLOW result");
  const denySubmit = transactionList(deny.submit, 2, "DENY result");
  if (deny.reason !== "CAP_EXCEEDED") throw new Error("live V2 denial reason invalid");
  const steps: LiveV2EvidenceStep[] = [
    step("Three-machine custody frozen", identifiers.custodyFreezeTransaction),
    step("ALLOW request created", allow.create),
    step("ALLOW instruction dispatched", allow.dispatch),
    ...allowSubmit,
    step("Threshold-authorized transfer executed", allow.execute),
    step("DENY request created", deny.create),
    step("DENY instruction dispatched", deny.dispatch),
    ...denySubmit,
    step("Policy stopped", lifecycle.stop),
    step("Policy resumed", lifecycle.resume),
    step("Policy revoked", lifecycle.revoke),
  ];

  const accounting = object(identifiers.accounting, "accounting");
  const before = accountingState(accounting.before, "before");
  const afterAllow = accountingState(accounting.afterAllow, "afterAllow");
  const afterDeny = accountingState(accounting.afterDeny, "afterDeny");
  if (afterAllow.deposited !== before.deposited || afterAllow.available >= before.available
    || afterAllow.spent <= before.spent || !sameAccounting(afterAllow, afterDeny)) {
    throw new Error("live V2 accounting transition invalid");
  }

  const assertions = object(root.assertions, "assertions");
  for (const key of REQUIRED_TRUE_ASSERTIONS) if (assertions[key] !== true) throw new Error(`live V2 assertion ${key} missing`);
  for (const key of REQUIRED_FALSE_ASSERTIONS) if (assertions[key] !== false) throw new Error(`live V2 limitation ${key} drift`);
  if (!Array.isArray(root.blockers) || root.blockers.length < 2 || root.blockers.some((item) => typeof item !== "string")) {
    throw new Error("live V2 blockers missing");
  }

  return {
    observedBlock,
    policyCommitment,
    relayOrigin,
    machines,
    allowRequestId: bytes32(allow.requestId, "allow requestId"),
    allowInstructionId: bytes32(allow.instructionId, "allow instructionId"),
    denyRequestId: bytes32(deny.requestId, "deny requestId"),
    denyInstructionId: bytes32(deny.instructionId, "deny instructionId"),
    denyReason: "CAP_EXCEEDED",
    steps,
    before,
    afterAllow,
    afterDeny,
    blockers: [...root.blockers],
    liveCandidate: true,
  };
}

export async function fetchLiveV2LifecycleEvidence(fetcher: typeof fetch = fetch): Promise<LiveV2LifecycleEvidence> {
  const response = await fetcher(LIVE_V2_LIFECYCLE_EVIDENCE_PATH, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`live V2 evidence returned HTTP ${response.status}`);
  return decodeLiveV2LifecycleEvidence(await response.json());
}

function transactionList(value: unknown, expected: number, label: string): LiveV2EvidenceStep[] {
  if (!Array.isArray(value) || value.length !== expected) throw new Error(`${label} threshold invalid`);
  return value.map((hash, index) => step(`${label} ${index + 1} submitted`, hash));
}

function step(label: string, value: unknown): LiveV2EvidenceStep {
  return { label, transactionHash: bytes32(value, `${label} transaction`) };
}

function accountingState(value: unknown, label: string): Accounting {
  const state = object(value, label);
  const result = {
    deposited: uint(state.deposited, `${label}.deposited`),
    available: uint(state.available, `${label}.available`),
    reserved: uint(state.reserved, `${label}.reserved`),
    spent: uint(state.spent, `${label}.spent`),
    withdrawn: uint(state.withdrawn, `${label}.withdrawn`),
    refunded: uint(state.refunded, `${label}.refunded`),
  };
  if (result.deposited !== result.available + result.reserved + result.spent + result.withdrawn + result.refunded) {
    throw new Error(`${label} conservation mismatch`);
  }
  return result;
}

function sameAccounting(left: Accounting, right: Accounting): boolean {
  return Object.keys(left).every((key) => left[key as keyof Accounting] === right[key as keyof Accounting]);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function uint(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new Error(`${label} must be a quoted uint`);
  return BigInt(value);
}

function bytes32(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !HEX32.test(value) || /^0x0{64}$/i.test(value)) throw new Error(`${label} must be non-zero bytes32`);
  return value.toLowerCase() as Hex;
}

function address(value: unknown, label: string): Address {
  if (typeof value !== "string") throw new Error(`${label} must be an address`);
  try { return getAddress(value); } catch { throw new Error(`${label} must be an address`); }
}

function httpsOrigin(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be HTTPS`);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
    return url.origin;
  } catch {
    throw new Error(`${label} must be HTTPS`);
  }
}
