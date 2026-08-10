import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  stringToHex,
  type Hex,
} from "viem";
import {
  POLICY_SCHEMA_V1,
  policyCommitment,
  type EvaluationResultV1,
  type PolicyBindingV1,
  type PolicyReceiptV1,
  type PolicyV1,
  type TeePublicKeyV1,
} from "@xrp-payguard/protocol";

export const INTERACTIVE_DEMO_MODE = "SIMULATED_FCC_COSTON2_TESTNET_V1" as const;
export const INTERACTIVE_DEMO_LABEL = "SIMULATED FCC · COSTON2 TESTNET · NOT PRODUCTION TEE";
export const INTERACTIVE_DEMO_EXTENSION_ID = keccak256(stringToHex("PAYGUARD_INTERACTIVE_DEMO_EXTENSION_V1"));
export const INTERACTIVE_DEMO_CODE_VERSION = keccak256(stringToHex("PAYGUARD_INTERACTIVE_DEMO_CODE_V1"));
export const INTERACTIVE_DEMO_BALANCE_DOMAIN = keccak256(stringToHex("PAYGUARD_INTERACTIVE_DEMO_BALANCE_V1"));

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const HEX = /^0x(?:[0-9a-fA-F]{2})+$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const MAX_UINT64 = (1n << 64n) - 1n;

export interface DemoActorDescriptor {
  actor: 1 | 2 | 3;
  machineId: Hex;
  keyFingerprint: Hex;
  signer: Hex;
  publicKey: TeePublicKeyV1;
  endpoint: string;
}

export interface DemoDomainConfig {
  mode: typeof INTERACTIVE_DEMO_MODE;
  chainId: 114;
  registry: Hex;
  vault: Hex;
  router: Hex;
  asset: Hex;
  deploymentBlock: bigint;
  extensionId: Hex;
  codeVersion: Hex;
  actors: readonly [DemoActorDescriptor, DemoActorDescriptor, DemoActorDescriptor];
  assertions: {
    hardwareTeeVerified: false;
    registeredProductionMachinesVerified: false;
    independentOperatorsVerified: false;
    sealedPersistenceVerified: false;
    productionFccReleaseVerified: false;
  };
}

export interface DemoAccounting {
  deposited: bigint;
  available: bigint;
  reserved: bigint;
  spent: bigint;
  withdrawn: bigint;
  refunded: bigint;
}

export interface DemoIngressAuthorization {
  issuedAt: bigint;
  expiry: bigint;
  signature: Hex;
}

export interface DemoCustodyEnvelope {
  mode: typeof INTERACTIVE_DEMO_MODE;
  actor: 1 | 2 | 3;
  binding: PolicyBindingV1;
  receipt: PolicyReceiptV1;
  digest: Hex;
  signer: Hex;
  signature: Hex;
  assertions: DemoDomainConfig["assertions"];
}

export interface DemoEvaluationEnvelope {
  mode: typeof INTERACTIVE_DEMO_MODE;
  actor: 1 | 2 | 3;
  result: EvaluationResultV1;
  digest: Hex;
  signer: Hex;
  signature: Hex;
  assertions: DemoDomainConfig["assertions"];
}

export interface DemoActorRequest {
  operation: "CUSTODY" | "EVALUATE";
  ciphertext: Hex;
  authorization: DemoIngressAuthorization;
  requestId?: Hex;
}

export function demoPolicyNonceV1(submissionNonce: Hex): bigint {
  const nonce = bytes32(submissionNonce, "submissionNonce");
  return BigInt(`0x${nonce.slice(2, 18)}`) || 1n;
}

export function demoPolicyBindingV1(policy: PolicyV1, config: DemoDomainConfig): PolicyBindingV1 {
  validateDemoConfig(config);
  if (policy.chainId !== 114n
    || getAddress(policy.registry) !== getAddress(config.registry)
    || getAddress(policy.vault) !== getAddress(config.vault)
    || getAddress(policy.router) !== getAddress(config.router)
    || getAddress(policy.asset) !== getAddress(config.asset)) {
    throw new Error("policy is outside the interactive demo domain");
  }
  return {
    chainId: 114n,
    registry: getAddress(config.registry),
    vault: getAddress(config.vault),
    router: getAddress(config.router),
    owner: getAddress(policy.owner),
    policyId: bytes32(policy.policyId, "policyId"),
    policyVersion: policy.policyVersion,
    policyCommitment: policyCommitment(policy),
    schema: POLICY_SCHEMA_V1,
    extensionId: config.extensionId,
    codeVersion: config.codeVersion,
    machineIds: config.actors.map((actor) => actor.machineId) as [Hex, Hex, Hex],
    keyFingerprints: config.actors.map((actor) => actor.keyFingerprint) as [Hex, Hex, Hex],
    custodyThreshold: 3,
    resultThreshold: 2,
    policyNonce: demoPolicyNonceV1(policy.submissionNonce),
  };
}

export function demoBalanceCheckpointV1(owner: Hex, asset: Hex, accounting: DemoAccounting): Hex {
  return keccak256(encodeAbiParameters(
    [
      { type: "bytes32" }, { type: "address" }, { type: "address" },
      { type: "uint256" }, { type: "uint256" }, { type: "uint256" },
      { type: "uint256" }, { type: "uint256" }, { type: "uint256" },
    ],
    [
      INTERACTIVE_DEMO_BALANCE_DOMAIN, getAddress(owner), getAddress(asset),
      accounting.deposited, accounting.available, accounting.reserved,
      accounting.spent, accounting.withdrawn, accounting.refunded,
    ],
  ));
}

export function stringifyDemoWire(value: unknown): string {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString(10) : item);
}

export function parseDemoConfig(value: unknown): DemoDomainConfig {
  const record = object(value, "demo config");
  const actors = array(record.actors, "actors");
  if (actors.length !== 3) throw new Error("demo config requires exactly three actors");
  const parsed = {
    mode: literal(record.mode, INTERACTIVE_DEMO_MODE, "mode"),
    chainId: number(record.chainId, "chainId"),
    registry: address(record.registry, "registry"),
    vault: address(record.vault, "vault"),
    router: address(record.router, "router"),
    asset: address(record.asset, "asset"),
    deploymentBlock: decimal(record.deploymentBlock, "deploymentBlock"),
    extensionId: bytes32(record.extensionId, "extensionId"),
    codeVersion: bytes32(record.codeVersion, "codeVersion"),
    actors: actors.map(parseActor) as [DemoActorDescriptor, DemoActorDescriptor, DemoActorDescriptor],
    assertions: parseAssertions(record.assertions),
  };
  if (parsed.chainId !== 114) throw new Error("interactive demo chain must be Coston2");
  validateDemoConfig(parsed as DemoDomainConfig);
  return parsed as DemoDomainConfig;
}

export function parseDemoActorRequest(value: unknown): DemoActorRequest {
  const record = object(value, "actor request");
  exactKeys(record, ["operation", "ciphertext", "authorization", "requestId"], "actor request");
  const operation = record.operation;
  if (operation !== "CUSTODY" && operation !== "EVALUATE") throw new Error("unknown demo operation");
  const authorization = object(record.authorization, "authorization");
  exactKeys(authorization, ["issuedAt", "expiry", "signature"], "authorization");
  const requestId = record.requestId === undefined ? undefined : bytes32(record.requestId, "requestId");
  if (operation === "EVALUATE" && !requestId) throw new Error("evaluation requestId is required");
  if (operation === "CUSTODY" && requestId) throw new Error("custody request cannot include requestId");
  return {
    operation,
    ciphertext: hex(record.ciphertext, "ciphertext", 65 + 16 + 1 + 32, 64 * 1024),
    authorization: {
      issuedAt: decimal(authorization.issuedAt, "authorization.issuedAt", MAX_UINT64),
      expiry: decimal(authorization.expiry, "authorization.expiry", MAX_UINT64),
      signature: hex(authorization.signature, "authorization.signature", 65, 65),
    },
    ...(requestId ? { requestId } : {}),
  };
}

export function parseDemoCustodyEnvelope(value: unknown): DemoCustodyEnvelope {
  const record = object(value, "custody envelope");
  return {
    mode: literal(record.mode, INTERACTIVE_DEMO_MODE, "mode"),
    actor: actorNumber(record.actor),
    binding: parseBinding(record.binding),
    receipt: parseReceipt(record.receipt),
    digest: bytes32(record.digest, "digest"),
    signer: address(record.signer, "signer"),
    signature: hex(record.signature, "signature", 65, 65),
    assertions: parseAssertions(record.assertions),
  };
}

export function parseDemoEvaluationEnvelope(value: unknown): DemoEvaluationEnvelope {
  const record = object(value, "evaluation envelope");
  return {
    mode: literal(record.mode, INTERACTIVE_DEMO_MODE, "mode"),
    actor: actorNumber(record.actor),
    result: parseEvaluationResult(record.result),
    digest: bytes32(record.digest, "digest"),
    signer: address(record.signer, "signer"),
    signature: hex(record.signature, "signature", 65, 65),
    assertions: parseAssertions(record.assertions),
  };
}

export function validateDemoConfig(config: DemoDomainConfig): void {
  if (config.mode !== INTERACTIVE_DEMO_MODE || config.chainId !== 114 || config.deploymentBlock <= 0n
    || config.extensionId !== INTERACTIVE_DEMO_EXTENSION_ID || config.codeVersion !== INTERACTIVE_DEMO_CODE_VERSION) {
    throw new Error("interactive demo config domain is invalid");
  }
  const ids = new Set<string>();
  const fingerprints = new Set<string>();
  const signers = new Set<string>();
  const endpoints = new Set<string>();
  config.actors.forEach((actor, index) => {
    if (actor.actor !== index + 1) throw new Error("demo actors must be ordered 1, 2, 3");
    bytes32(actor.machineId, "machineId");
    bytes32(actor.keyFingerprint, "keyFingerprint");
    const signer = address(actor.signer, "signer").toLowerCase();
    bytes32(actor.publicKey.x, "publicKey.x");
    bytes32(actor.publicKey.y, "publicKey.y");
    const endpoint = new URL(actor.endpoint);
    if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["127.0.0.1", "localhost"].includes(endpoint.hostname))) {
      throw new Error("demo actor endpoint must use HTTPS");
    }
    for (const [set, item] of [[ids, actor.machineId.toLowerCase()], [fingerprints, actor.keyFingerprint.toLowerCase()], [signers, signer], [endpoints, endpoint.toString()]] as const) {
      if (set.has(item)) throw new Error("demo actor identities and endpoints must be distinct");
      set.add(item);
    }
  });
  parseAssertions(config.assertions);
}

function parseActor(value: unknown, index: number): DemoActorDescriptor {
  const record = object(value, `actors[${index}]`);
  const publicKey = object(record.publicKey, `actors[${index}].publicKey`);
  return {
    actor: actorNumber(record.actor),
    machineId: bytes32(record.machineId, "machineId"),
    keyFingerprint: bytes32(record.keyFingerprint, "keyFingerprint"),
    signer: address(record.signer, "signer"),
    publicKey: { x: bytes32(publicKey.x, "publicKey.x"), y: bytes32(publicKey.y, "publicKey.y") },
    endpoint: string(record.endpoint, "endpoint"),
  };
}

function parseAssertions(value: unknown): DemoDomainConfig["assertions"] {
  const record = object(value, "assertions");
  for (const key of ["hardwareTeeVerified", "registeredProductionMachinesVerified", "independentOperatorsVerified", "sealedPersistenceVerified", "productionFccReleaseVerified"] as const) {
    if (record[key] !== false) throw new Error(`${key} must remain false`);
  }
  return {
    hardwareTeeVerified: false,
    registeredProductionMachinesVerified: false,
    independentOperatorsVerified: false,
    sealedPersistenceVerified: false,
    productionFccReleaseVerified: false,
  };
}

function parseBinding(value: unknown): PolicyBindingV1 {
  const record = object(value, "binding");
  const machineIds = array(record.machineIds, "machineIds");
  const keyFingerprints = array(record.keyFingerprints, "keyFingerprints");
  if (machineIds.length !== 3 || keyFingerprints.length !== 3) throw new Error("binding requires three machines");
  return {
    chainId: decimal(record.chainId, "chainId"), registry: address(record.registry, "registry"),
    vault: address(record.vault, "vault"), router: address(record.router, "router"), owner: address(record.owner, "owner"),
    policyId: bytes32(record.policyId, "policyId"), policyVersion: number(record.policyVersion, "policyVersion"),
    policyCommitment: bytes32(record.policyCommitment, "policyCommitment"), schema: bytes32(record.schema, "schema"),
    extensionId: bytes32(record.extensionId, "extensionId"), codeVersion: bytes32(record.codeVersion, "codeVersion"),
    machineIds: machineIds.map((item) => bytes32(item, "machineId")) as [Hex, Hex, Hex],
    keyFingerprints: keyFingerprints.map((item) => bytes32(item, "keyFingerprint")) as [Hex, Hex, Hex],
    custodyThreshold: number(record.custodyThreshold, "custodyThreshold"), resultThreshold: number(record.resultThreshold, "resultThreshold"),
    policyNonce: decimal(record.policyNonce, "policyNonce", MAX_UINT64),
  };
}

function parseReceipt(value: unknown): PolicyReceiptV1 {
  const record = object(value, "receipt");
  return {
    binding: parseBinding(record.binding), machineId: bytes32(record.machineId, "machineId"),
    keyFingerprint: bytes32(record.keyFingerprint, "keyFingerprint"), submissionNonce: bytes32(record.submissionNonce, "submissionNonce"),
    receiptNonce: decimal(record.receiptNonce, "receiptNonce", MAX_UINT64), issuedAt: decimal(record.issuedAt, "issuedAt", MAX_UINT64),
    expiry: decimal(record.expiry, "expiry", MAX_UINT64),
  };
}

function parseEvaluationResult(value: unknown): EvaluationResultV1 {
  const record = object(value, "evaluation result");
  const request = object(record.request, "request");
  const decision = record.decision;
  if (decision !== "ALLOW" && decision !== "DENY") throw new Error("evaluation decision is invalid");
  const reason = string(record.publicReasonClass, "publicReasonClass") as EvaluationResultV1["publicReasonClass"];
  const reasons: readonly string[] = ["OK", "POLICY_DENIED", "MALFORMED", "WRONG_DOMAIN", "STALE_INPUT", "DEPENDENCY_UNAVAILABLE", "EXPIRED", "STOPPED", "INSUFFICIENT_BALANCE", "CAP_EXCEEDED", "OCCURRENCE_EXCEEDED", "TARGET_DENIED", "REQUESTER_DENIED", "ACTION_DENIED", "FTSO_INVALID", "COOLDOWN", "FDC_INVALID"];
  if (!reasons.includes(reason)) throw new Error("public reason class is invalid");
  return {
    request: {
      chainId: decimal(request.chainId, "request.chainId"), registry: address(request.registry, "request.registry"), vault: address(request.vault, "request.vault"), router: address(request.router, "request.router"),
      policyId: bytes32(request.policyId, "request.policyId"), policyVersion: number(request.policyVersion, "request.policyVersion"), policyCommitment: bytes32(request.policyCommitment, "request.policyCommitment"),
      requestId: bytes32(request.requestId, "request.requestId"), requestNonce: decimal(request.requestNonce, "request.requestNonce"), attempt: number(request.attempt, "request.attempt"), requester: address(request.requester, "request.requester"),
      target: address(request.target, "request.target"), asset: address(request.asset, "request.asset"), actionType: bytes32(request.actionType, "request.actionType"), amount: decimal(request.amount, "request.amount"),
      scheduleSlot: decimal(request.scheduleSlot, "request.scheduleSlot", MAX_UINT64), occurrence: number(request.occurrence, "request.occurrence"), spendCheckpoint: bytes32(request.spendCheckpoint, "request.spendCheckpoint"),
      balanceCheckpoint: bytes32(request.balanceCheckpoint, "request.balanceCheckpoint"), inputCommitment: bytes32(request.inputCommitment, "request.inputCommitment"), createdAt: decimal(request.createdAt, "request.createdAt", MAX_UINT64),
      graceDeadline: decimal(request.graceDeadline, "request.graceDeadline", MAX_UINT64), expiry: decimal(request.expiry, "request.expiry", MAX_UINT64),
    },
    decision, publicReasonClass: reason, reservedAmount: decimal(record.reservedAmount, "reservedAmount"), resultingCheckpoint: bytes32(record.resultingCheckpoint, "resultingCheckpoint"),
    resultNonce: bytes32(record.resultNonce, "resultNonce"), attempt: number(record.attempt, "attempt"), issuedAt: decimal(record.issuedAt, "issuedAt", MAX_UINT64),
    expiry: decimal(record.expiry, "expiry", MAX_UINT64), machineId: bytes32(record.machineId, "machineId"), keyFingerprint: bytes32(record.keyFingerprint, "keyFingerprint"),
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function exactKeys(record: Record<string, unknown>, allowed: readonly string[], label: string): void {
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw new Error(`${label} contains an unknown field`);
}
function array(value: unknown, label: string): unknown[] { if (!Array.isArray(value)) throw new Error(`${label} must be an array`); return value; }
function string(value: unknown, label: string): string { if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a string`); return value; }
function number(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be an unsigned integer`); return value as number; }
function decimal(value: unknown, label: string, maximum?: bigint): bigint {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new Error(`${label} must be a canonical decimal string`);
  const parsed = BigInt(value); if (maximum !== undefined && parsed > maximum) throw new Error(`${label} exceeds its range`); return parsed;
}
function literal<T extends string>(value: unknown, expected: T, label: string): T { if (value !== expected) throw new Error(`${label} is invalid`); return expected; }
function actorNumber(value: unknown): 1 | 2 | 3 { if (value !== 1 && value !== 2 && value !== 3) throw new Error("actor must be 1, 2, or 3"); return value; }
function address(value: unknown, label: string): Hex { if (typeof value !== "string" || !isAddress(value)) throw new Error(`${label} must be an address`); return getAddress(value); }
function bytes32(value: unknown, label: string): Hex { if (typeof value !== "string" || !HEX32.test(value)) throw new Error(`${label} must be bytes32`); return value.toLowerCase() as Hex; }
function hex(value: unknown, label: string, minimumBytes: number, maximumBytes: number): Hex {
  if (typeof value !== "string" || !HEX.test(value)) throw new Error(`${label} must be canonical hex`);
  const size = (value.length - 2) / 2; if (size < minimumBytes || size > maximumBytes) throw new Error(`${label} has an invalid size`); return value.toLowerCase() as Hex;
}
