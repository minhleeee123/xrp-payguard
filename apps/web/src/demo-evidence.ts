import { getAddress, type Address, type Hex } from "viem";
import { PAYGUARD_COSTON2_V1 } from "./coston2.js";

const DEMO_PATH = "/evidence/simulation/coston2-simulated-policy-lifecycle-2026-08-09.json";
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

export interface DemoMachine {
  machineId: Hex;
  keyFingerprint: Hex;
  signer: Address;
}

export interface DemoStep {
  label: string;
  transactionHash: Hex;
  blockNumber: bigint;
}

export interface SimulatedLifecycleEvidence {
  observedBlock: bigint;
  owner: Address;
  machines: [DemoMachine, DemoMachine, DemoMachine];
  allowRequestId: Hex;
  denyRequestId: Hex;
  amount: bigint;
  steps: DemoStep[];
  deposited: bigint;
  availableAfter: bigint;
  spentAfter: bigint;
  blockers: string[];
  simulationOnly: true;
}

const TOP_FIELDS = new Set(["schemaVersion", "suite", "status", "recordedAt", "sourceCommit", "mode", "network", "publicIdentifiers", "lifecycle", "accounting", "assertions", "blockers", "notes"]);
const IDENTIFIER_FIELDS = new Set(["owner", "asset", "contracts", "deploymentSourceCommit", "policyId", "policyCommitment", "extensionId", "codeVersion", "machines"]);
const LIFECYCLE_FIELDS = new Set(["machineRegistrations", "policyRegistration", "recurringAllow", "capDenial", "emergencyStop", "resume", "revoke"]);
const REQUIRED_TRUE_ASSERTIONS = [
  "simulationOnly", "payGuardLocalMachineEntriesVerified", "onChainTransactionsVerified", "threeSimulatedCustodyReceiptsVerified",
  "twoMatchingAllowEvaluationsVerified", "capDenialVerified", "emergencyStopVerified", "resumeVerified", "revokeVerified",
  "conservationVerified", "sourceCommitCleanAtBroadcast", "testnetOnly", "noPrivateKeyRecorded", "noCredentialRecorded",
  "noPolicyPlaintextOrCiphertextRecorded", "noLiveFccResultClaimed", "noPayGuardReleaseClaimed",
] as const;
const REQUIRED_FALSE_ASSERTIONS = ["hardwareTeeVerified", "registeredMachinesVerified", "stableHttpsOriginsVerified", "authenticatedIndexerVerified"] as const;

export function decodeSimulatedLifecycleEvidence(value: unknown): SimulatedLifecycleEvidence {
  const root = object(value, "simulation evidence");
  exactFields(root, TOP_FIELDS, "simulation evidence");
  if (root.schemaVersion !== 1 || root.suite !== "payguard-coston2-simulated-tee-policy-lifecycle"
    || root.status !== "coston2-simulated-pass" || root.mode !== "SIMULATED_TEE_ONCHAIN") throw new Error("unsupported simulation evidence");
  const network = object(root.network, "network");
  if (network.name !== "flare-coston2" || network.chainId !== 114 || network.publicChainConnected !== true) throw new Error("simulation network mismatch");
  const observedBlock = uint(network.observedBlock, "observedBlock");

  const identifiers = object(root.publicIdentifiers, "publicIdentifiers");
  exactFields(identifiers, IDENTIFIER_FIELDS, "publicIdentifiers");
  const owner = address(identifiers.owner, "owner");
  if (address(identifiers.asset, "asset") !== PAYGUARD_COSTON2_V1.asset) throw new Error("simulation asset mismatch");
  const contracts = object(identifiers.contracts, "contracts");
  if (address(contracts.registry, "registry") !== PAYGUARD_COSTON2_V1.registry
    || address(contracts.vault, "vault") !== PAYGUARD_COSTON2_V1.vault
    || address(contracts.router, "router") !== PAYGUARD_COSTON2_V1.router) throw new Error("simulation contract mismatch");
  if (!Array.isArray(identifiers.machines) || identifiers.machines.length !== 3) throw new Error("simulation machine set invalid");
  const machines = identifiers.machines.map((entry, index) => {
    const machine = object(entry, `machines[${index}]`);
    exactFields(machine, new Set(["machineId", "keyFingerprint", "signer"]), `machines[${index}]`);
    return { machineId: bytes32(machine.machineId, "machineId"), keyFingerprint: bytes32(machine.keyFingerprint, "keyFingerprint"), signer: address(machine.signer, "signer") };
  }) as [DemoMachine, DemoMachine, DemoMachine];
  if (new Set(machines.map((machine) => machine.machineId)).size !== 3
    || new Set(machines.map((machine) => machine.keyFingerprint)).size !== 3
    || new Set(machines.map((machine) => machine.signer)).size !== 3) throw new Error("simulation machines are not distinct");

  const lifecycle = object(root.lifecycle, "lifecycle");
  exactFields(lifecycle, LIFECYCLE_FIELDS, "lifecycle");
  if (!Array.isArray(lifecycle.machineRegistrations) || lifecycle.machineRegistrations.length !== 3) throw new Error("machine registrations invalid");
  const machineSteps = lifecycle.machineRegistrations.map((entry, index) => transaction(entry, `Machine ${index + 1} registered`, "MachineRegistered"));
  const policy = transaction(lifecycle.policyRegistration, "Policy registered", "PolicyRegistered");
  const allow = object(lifecycle.recurringAllow, "recurringAllow");
  const deny = object(lifecycle.capDenial, "capDenial");
  const allowRequestId = bytes32(allow.requestId, "allow requestId");
  const denyRequestId = bytes32(deny.requestId, "deny requestId");
  const amount = uint(allow.amountUBA, "allow amount");
  if (amount === 0n || uint(deny.amountUBA, "deny amount") !== amount || allow.publicReasonClass !== "OK" || deny.publicReasonClass !== "CAP_EXCEEDED") {
    throw new Error("simulation decisions invalid");
  }
  const allowRequest = transaction(allow.request, "Recurring request created", "RequestCreated");
  const allowEvaluations = evaluations(allow.evaluations, "allow");
  const execution = transaction(allow.execution, "Allowed request executed", "RequestExecuted");
  const denyRequest = transaction(deny.request, "Cap request created", "RequestCreated");
  const denyEvaluations = evaluations(deny.evaluations, "deny");
  const stopped = transaction(lifecycle.emergencyStop, "Policy stopped", "PolicyStopped", "stoppedRequestRejected");
  const resumed = transaction(lifecycle.resume, "Policy resumed", "PolicyResumed");
  const revoked = transaction(lifecycle.revoke, "Policy revoked", "PolicyRevoked", "revokedRequestRejected");

  const accounting = object(root.accounting, "accounting");
  const before = accountingState(accounting.before, "before");
  const afterAllow = accountingState(accounting.afterAllow, "afterAllow");
  const afterDeny = accountingState(accounting.afterDeny, "afterDeny");
  if (uint(accounting.executedAmountUBA, "executedAmountUBA") !== amount
    || afterAllow.deposited !== before.deposited || afterAllow.spent !== before.spent + amount
    || JSON.stringify(afterAllow, bigintJson) !== JSON.stringify(afterDeny, bigintJson)) throw new Error("simulation accounting transition invalid");

  const assertions = object(root.assertions, "assertions");
  for (const key of REQUIRED_TRUE_ASSERTIONS) if (assertions[key] !== true) throw new Error(`simulation assertion ${key} missing`);
  for (const key of REQUIRED_FALSE_ASSERTIONS) if (assertions[key] !== false) throw new Error(`simulation limitation ${key} drift`);
  if (!Array.isArray(root.blockers) || root.blockers.length < 5 || root.blockers.some((item) => typeof item !== "string")) throw new Error("simulation blockers missing");
  if (!Array.isArray(root.notes) || root.notes.some((item) => typeof item !== "string")) throw new Error("simulation notes invalid");

  return {
    observedBlock,
    owner,
    machines,
    allowRequestId,
    denyRequestId,
    amount,
    steps: [...machineSteps, policy, allowRequest, ...allowEvaluations, execution, denyRequest, ...denyEvaluations, stopped, resumed, revoked],
    deposited: afterDeny.deposited,
    availableAfter: afterDeny.available,
    spentAfter: afterDeny.spent,
    blockers: [...root.blockers],
    simulationOnly: true,
  };
}

export async function fetchSimulatedLifecycleEvidence(fetcher: typeof fetch = fetch): Promise<SimulatedLifecycleEvidence> {
  const response = await fetcher(DEMO_PATH, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`simulation evidence returned HTTP ${response.status}`);
  return decodeSimulatedLifecycleEvidence(await response.json());
}

function evaluations(value: unknown, label: string): DemoStep[] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`${label} evaluation threshold invalid`);
  return value.map((entry, index) => transaction(entry, `${label === "allow" ? "ALLOW" : "DENY"} result ${index + 1} accepted`, "EvaluationAccepted"));
}

function transaction(value: unknown, label: string, eventName: string, assertion?: string): DemoStep {
  const entry = object(value, label);
  if (entry.receiptStatus !== "success" || entry.eventName !== eventName || entry.eventVerified !== true || (assertion && entry[assertion] !== true)) {
    throw new Error(`${label} receipt invalid`);
  }
  return { label, transactionHash: bytes32(entry.transactionHash, `${label} transactionHash`), blockNumber: uint(entry.blockNumber, `${label} blockNumber`) };
}

function accountingState(value: unknown, label: string) {
  const state = object(value, label);
  const deposited = uint(state.deposited, `${label}.deposited`);
  const available = uint(state.available, `${label}.available`);
  const reserved = uint(state.reserved, `${label}.reserved`);
  const spent = uint(state.spent, `${label}.spent`);
  const withdrawn = uint(state.withdrawn, `${label}.withdrawn`);
  const refunded = uint(state.refunded, `${label}.refunded`);
  if (deposited !== available + reserved + spent + withdrawn + refunded) throw new Error(`${label} conservation mismatch`);
  return { deposited, available, reserved, spent, withdrawn, refunded };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactFields(value: Record<string, unknown>, fields: Set<string>, label: string): void {
  if (Object.keys(value).some((key) => !fields.has(key)) || [...fields].some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error(`${label} fields invalid`);
  }
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

function bigintJson(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export { DEMO_PATH as SIMULATED_LIFECYCLE_EVIDENCE_PATH };
