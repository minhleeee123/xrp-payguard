import { randomBytes } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ACTION_FTESTXRP_TRANSFER,
  CHAIN_ID,
  ZERO_BYTES32,
  actionRequestHash,
  evaluationAttestationDigest,
  evaluationDigest,
  genesisSpendCheckpoint,
  publicReasonCode,
  type ActionRequestV1,
  type EvaluationResultV1,
  type Hex,
  type PublicReasonClass,
  type SpendHistoryEntryV1,
  type SpendStateV1,
} from "../packages/protocol/src/index.js";
import {
  PayGuardActionRouterAbi,
  PayGuardFccDispatcherAbi,
  PayGuardPolicyRegistryAbi,
  PayGuardVaultAbi,
} from "../packages/bindings/src/index.js";
import {
  concatHex,
  createWalletClient,
  decodeEventLog,
  encodeAbiParameters,
  getAddress,
  hexToBytes,
  http,
  isAddress,
  isHex,
  keccak256,
  numberToHex,
  recoverMessageAddress,
  stringToHex,
  type Address,
  type Hash,
} from "viem";

import {
  executeLiveCustody,
  parseLiveCustodyCLI,
  type LiveMachine,
} from "./fcc-live-custody.js";

const root = resolve(import.meta.dirname, "..");
const evidencePath = resolve(root, "evidence/coston2/fcc-live-threshold-lifecycle.json");
const dispatcher = getAddress("0x18Ea713cEf10ECf5cAC23c08dD25Ac17D2f07e3d");
const ftestXrp = getAddress("0x0b6A3645c240605887a5532109323A3E12273dc7");
const opType = stringToHex("PAYGUARD", { size: 32 });
const opCommand = stringToHex("EVALUATE_V1", { size: 32 });
const teeResultPrefix = stringToHex("TEE_ACTION_RESULT", { size: 32 });
const proxyResultPrefix = stringToHex("PROXY_ACTION_RESULT", { size: 32 });
const reasonNames: readonly PublicReasonClass[] = [
  "OK", "POLICY_DENIED", "MALFORMED", "WRONG_DOMAIN", "STALE_INPUT",
  "DEPENDENCY_UNAVAILABLE", "EXPIRED", "STOPPED", "INSUFFICIENT_BALANCE",
  "CAP_EXCEEDED", "OCCURRENCE_EXCEEDED", "TARGET_DENIED", "REQUESTER_DENIED",
  "ACTION_DENIED", "FTSO_INVALID", "COOLDOWN", "FDC_INVALID",
];

interface LifecycleCLI {
  plan: boolean;
  broadcast: boolean;
  writeLivePrivatePolicy: boolean;
}

interface EvaluationEnvelope {
  result: EvaluationResultV1;
  digest: Hex;
  signer: Address;
  signature: Hex;
  actionResultHash: Hex;
}

interface Accounting {
  deposited: bigint;
  available: bigint;
  reserved: bigint;
  spent: bigint;
  withdrawn: bigint;
  refunded: bigint;
}

interface TransactionSet {
  create: Hash;
  dispatch: Hash;
  submit: [Hash, Hash];
  execute?: Hash;
}

function randomHex32(): Hex {
  return `0x${randomBytes(32).toString("hex")}`;
}

function exactKeys(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== [...keys].sort().join(",")) throw new Error(`${label} fields are invalid`);
  return record;
}

function hex32(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} must be bytes32`);
  return value.toLowerCase() as Hex;
}

function signature(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(value)) throw new Error(`${label} must be a 65-byte signature`);
  const s = BigInt(`0x${value.slice(66, 130)}`);
  const v = Number.parseInt(value.slice(130, 132), 16);
  const halfOrder = BigInt("0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0");
  if (s === 0n || s > halfOrder || ![0, 1].includes(v)) throw new Error(`${label} is non-canonical`);
  return value as Hex;
}

function decimal(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${label} must be a canonical decimal string`);
  return BigInt(value);
}

function wireRequest(request: ActionRequestV1) {
  return {
    chainId: request.chainId.toString(), registry: request.registry, vault: request.vault,
    router: request.router, policyId: request.policyId, policyVersion: request.policyVersion,
    policyCommitment: request.policyCommitment, requestId: request.requestId,
    requestNonce: request.requestNonce.toString(), attempt: request.attempt,
    requester: request.requester, target: request.target, asset: request.asset,
    actionType: request.actionType, amount: request.amount.toString(),
    scheduleSlot: request.scheduleSlot.toString(), occurrence: request.occurrence,
    spendCheckpoint: request.spendCheckpoint, balanceCheckpoint: request.balanceCheckpoint,
    inputCommitment: request.inputCommitment, createdAt: request.createdAt.toString(),
    graceDeadline: request.graceDeadline.toString(), expiry: request.expiry.toString(),
  };
}

function wireState(state: SpendStateV1) {
  return {
    availableBalance: state.availableBalance.toString(),
    history: state.history.map((entry) => ({ request: wireRequest(entry.request), accountedAt: entry.accountedAt.toString() })),
    occurrenceCount: state.occurrenceCount,
    lastAccountingAt: state.lastAccountingAt.toString(),
    spendCheckpoint: state.spendCheckpoint,
    balanceCheckpoint: state.balanceCheckpoint,
    now: state.now.toString(),
  };
}

function actionResultHash(result: Record<string, unknown>): Hex {
  return keccak256(concatHex([
    keccak256(result.data as Hex), result.id as Hex,
    keccak256(stringToHex(result.submissionTag as string)),
    numberToHex(result.status as number, { size: 1 }),
  ]));
}

function actionSigningDigest(resultHash: Hex, prefix: Hex): Hex {
  return keccak256(encodeAbiParameters([
    { type: "tuple", components: [
      { name: "prefix", type: "bytes32" }, { name: "chainId", type: "uint256" }, { name: "dataHash", type: "bytes32" },
    ] },
  ], [{ prefix, chainId: CHAIN_ID, dataHash: resultHash }]));
}

async function parseEvaluationResponse(
  value: unknown,
  expectedInstruction: Hex,
  expectedRequest: ActionRequestV1,
  machine: LiveMachine,
): Promise<EvaluationEnvelope> {
  const outer = exactKeys(value, ["result", "signature", "proxySignature"], "action response");
  const result = exactKeys(outer.result, [
    "id", "submissionTag", "status", "log", "opType", "opCommand",
    "additionalResultStatus", "version", "data",
  ], "action result");
  if (hex32(result.id, "instruction ID") !== expectedInstruction.toLowerCase()
    || result.submissionTag !== "threshold" || result.status !== 1 || result.log !== "ok"
    || String(result.opType).toLowerCase() !== opType.toLowerCase()
    || String(result.opCommand).toLowerCase() !== opCommand.toLowerCase()
    || result.additionalResultStatus !== "0x" || result.version !== "0.1.0-payguard") {
    throw new Error("evaluation action-result domain mismatch");
  }
  const data = result.data;
  if (typeof data !== "string" || !isHex(data) || data === "0x" || data.length > 1_048_578) throw new Error("evaluation data is invalid or oversized");
  let decoded: unknown;
  try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(hexToBytes(data))); }
  catch (error) { throw new Error("evaluation envelope is not strict UTF-8 JSON", { cause: error }); }
  const envelope = exactKeys(decoded, ["result", "digest", "signer", "signature"], "evaluation envelope");
  const rawEvaluation = exactKeys(envelope.result, [
    "request", "decision", "publicReasonClass", "reservedAmount", "resultingCheckpoint",
    "resultNonce", "attempt", "issuedAt", "expiry", "machineId", "keyFingerprint",
  ], "evaluation result");
  const rawRequest = exactKeys(rawEvaluation.request, Object.keys(wireRequest(expectedRequest)), "evaluation request");
  const normalizedExpected = JSON.stringify(wireRequest(expectedRequest)).toLowerCase();
  if (JSON.stringify(rawRequest).toLowerCase() !== normalizedExpected) throw new Error("evaluation request does not match the dispatched request");
  if ((rawEvaluation.decision !== "ALLOW" && rawEvaluation.decision !== "DENY")
    || !reasonNames.includes(rawEvaluation.publicReasonClass as PublicReasonClass)) throw new Error("evaluation decision is invalid");
  const evaluation: EvaluationResultV1 = {
    request: expectedRequest,
    decision: rawEvaluation.decision,
    publicReasonClass: rawEvaluation.publicReasonClass as PublicReasonClass,
    reservedAmount: decimal(rawEvaluation.reservedAmount, "reservedAmount"),
    resultingCheckpoint: hex32(rawEvaluation.resultingCheckpoint, "resultingCheckpoint"),
    resultNonce: hex32(rawEvaluation.resultNonce, "resultNonce"),
    attempt: Number(rawEvaluation.attempt),
    issuedAt: decimal(rawEvaluation.issuedAt, "issuedAt"),
    expiry: decimal(rawEvaluation.expiry, "expiry"),
    machineId: hex32(rawEvaluation.machineId, "machineId"),
    keyFingerprint: hex32(rawEvaluation.keyFingerprint, "keyFingerprint"),
  };
  if (!Number.isSafeInteger(evaluation.attempt) || evaluation.attempt < 0
    || evaluation.machineId !== machine.machineId.toLowerCase()
    || evaluation.keyFingerprint !== machine.keyFingerprint.toLowerCase()) throw new Error("evaluation machine binding mismatch");
  const digest = hex32(envelope.digest, "evaluation digest");
  if (digest !== evaluationDigest(evaluation).toLowerCase()) throw new Error("evaluation digest mismatch");
  const innerSignature = signature(envelope.signature, "evaluation signature");
  if (!isAddress(String(envelope.signer))) throw new Error("evaluation signer is invalid");
  const signer = getAddress(String(envelope.signer));
  const innerRecovered = await recoverMessageAddress({ message: { raw: evaluationAttestationDigest(evaluation) }, signature: innerSignature });
  if (signer !== machine.signer || innerRecovered !== machine.signer) throw new Error("evaluation signer mismatch");
  const resultHash = actionResultHash(result);
  const [teeSigner, proxySigner] = await Promise.all([
    recoverMessageAddress({ message: { raw: actionSigningDigest(resultHash, teeResultPrefix) }, signature: signature(outer.signature, "TEE result signature") }),
    recoverMessageAddress({ message: { raw: actionSigningDigest(resultHash, proxyResultPrefix) }, signature: signature(outer.proxySignature, "proxy result signature") }),
  ]);
  if (teeSigner !== machine.teeId || proxySigner !== machine.proxyId) throw new Error("action-result signer mismatch");
  return { result: evaluation, digest, signer, signature: innerSignature, actionResultHash: resultHash };
}

async function pollEvaluation(origin: string, instructionId: Hex, request: ActionRequestV1, machine: LiveMachine) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`${origin}/action/result/${instructionId}`, {
      headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 202 || response.status === 404) {
      if (attempt === 29) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
      continue;
    }
    if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") throw new Error(`evaluation result endpoint failed closed with HTTP ${response.status}`);
    const body = await response.text();
    if (body.length === 0 || body.length > 512 * 1024) throw new Error("evaluation response is empty or oversized");
    return parseEvaluationResponse(JSON.parse(body), instructionId, request, machine);
  }
  throw new Error("evaluation result was not ready within the bounded polling window");
}

export function parseLifecycleCLI(argv: readonly string[]): LifecycleCLI {
  const [mode, ...flags] = argv;
  if (mode === "plan" && flags.length === 0) return { plan: true, broadcast: false, writeLivePrivatePolicy: false };
  if (mode !== "run" || flags.length !== 2 || !flags.includes("--broadcast") || !flags.includes("--write-live-private-policy")) {
    throw new Error("run requires exactly --broadcast and --write-live-private-policy");
  }
  return { plan: false, broadcast: true, writeLivePrivatePolicy: true };
}

function accountingOf(value: unknown): Accounting {
  const record = value as Accounting;
  for (const key of ["deposited", "available", "reserved", "spent", "withdrawn", "refunded"] as const) {
    if (typeof record?.[key] !== "bigint") throw new Error("vault accounting readback is invalid");
  }
  return record;
}

function balanceCheckpoint(accounting: Accounting, sequence: bigint): Hex {
  return keccak256(encodeAbiParameters([
    { type: "bytes32" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" },
  ], [keccak256(stringToHex("PAYGUARD_BALANCE_CHECKPOINT_V1")), accounting.deposited, accounting.available,
    accounting.reserved, accounting.spent, accounting.withdrawn, accounting.refunded, sequence]));
}

function buildRequest(
  binding: { policyId: Hex; policyVersion: number; policyCommitment: Hex },
  owner: Address,
  registry: Address,
  vault: Address,
  router: Address,
  occurrence: number,
  spendCheckpoint: Hex,
  checkpoint: Hex,
  timestamp: bigint,
): ActionRequestV1 {
  return {
    chainId: CHAIN_ID, registry, vault, router, policyId: binding.policyId,
    policyVersion: binding.policyVersion, policyCommitment: binding.policyCommitment,
    requestId: randomHex32(), requestNonce: BigInt(randomHex32()), attempt: 0,
    requester: owner, target: owner, asset: ftestXrp, actionType: ACTION_FTESTXRP_TRANSFER,
    amount: 100_000n, scheduleSlot: 0n, occurrence, spendCheckpoint,
    balanceCheckpoint: checkpoint, inputCommitment: ZERO_BYTES32, createdAt: timestamp,
    graceDeadline: timestamp, expiry: timestamp + 1_800n,
  };
}

function sameAccounting(left: Accounting, right: Accounting): boolean {
  return left.deposited === right.deposited && left.available === right.available
    && left.reserved === right.reserved && left.spent === right.spent
    && left.withdrawn === right.withdrawn && left.refunded === right.refunded;
}

export function buildSanitizedLifecycleEvidence(input: {
  sourceCommit: string;
  observedBlock: bigint;
  policyCommitment: Hex;
  custodyFreeze: Hash;
  machines: readonly LiveMachine[];
  allow: { instructionId: Hex; digest: Hex; transactions: TransactionSet; status: number; accountingBefore: Accounting; accountingAfter: Accounting };
  deny: { instructionId: Hex; digest: Hex; reason: PublicReasonClass; transactions: TransactionSet; status: number; accountingAfter: Accounting };
  policyTransactions: { stop: Hash; resume: Hash; revoke: Hash };
  recordedAt?: string;
}) {
  if (!/^[0-9a-f]{40}$/.test(input.sourceCommit) || input.machines.length !== 3) throw new Error("lifecycle evidence provenance is invalid");
  if (input.allow.status !== 4 || input.deny.status !== 3 || input.deny.reason !== "CAP_EXCEEDED") throw new Error("lifecycle terminal states are invalid");
  if (input.allow.accountingAfter.available !== input.allow.accountingBefore.available - 100_000n
    || input.allow.accountingAfter.spent !== input.allow.accountingBefore.spent + 100_000n
    || !sameAccounting(input.allow.accountingAfter, input.deny.accountingAfter)) throw new Error("lifecycle conservation evidence is invalid");
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-live-simulated-threshold-lifecycle",
    status: "verified-live-simulated-threshold-lifecycle",
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    network: { name: "flare-coston2", chainId: 114, observedBlock: input.observedBlock.toString() },
    publicIdentifiers: {
      verificationSourceCommit: input.sourceCommit,
      dispatcher,
      policyCommitment: input.policyCommitment,
      custodyFreezeTransaction: input.custodyFreeze,
      machines: input.machines.map((machine) => ({ teeId: machine.teeId, proxyId: machine.proxyId, url: machine.origin, status: machine.status })),
      allow: { instructionId: input.allow.instructionId, evaluationDigest: input.allow.digest, transactions: input.allow.transactions, routerStatus: input.allow.status },
      deny: { instructionId: input.deny.instructionId, evaluationDigest: input.deny.digest, publicReasonClass: input.deny.reason, transactions: input.deny.transactions, routerStatus: input.deny.status },
      policyLifecycleTransactions: input.policyTransactions,
      accounting: {
        before: input.allow.accountingBefore,
        afterAllow: input.allow.accountingAfter,
        afterDeny: input.deny.accountingAfter,
      },
    },
    assertions: {
      liveThreeMachineDispatchVerified: true,
      allThreeOuterSignaturesVerified: true,
      allThreeInnerSignaturesVerified: true,
      twoMatchingAllowVerified: true,
      allowExecutionVerified: true,
      vaultConservationVerified: true,
      twoMatchingDenyVerified: true,
      denyMovedNoFundsVerified: true,
      stopResumeRevokeVerified: true,
      hardwareAttestationVerified: false,
      simulatedTee: true,
      v2ReleaseVerified: false,
      noPolicyRecorded: true,
      noCiphertextRecorded: true,
      noSignatureRecorded: true,
      testnetOnly: true,
    },
    blockers: ["HARDWARE_ATTESTATION_NOT_VERIFIED", "V2_RELEASE_NOT_VERIFIED", "OUTAGE_AND_REPLACEMENT_DRILLS_NOT_VERIFIED"],
    notes: [
      "Organizer-approved SIMULATED_TEE=true was used on Coston2.",
      "ALLOW and DENY were independently computed by three registered machines; the router accepted two matching attestations.",
      "The private policy, ciphertexts, owner authorizations, and signatures are excluded from public evidence.",
      "The on-chain lifecycle uses the deployed V1 administrator mapping; official-manager authorization remains a V2 release blocker.",
    ],
  };
}

async function writeEvidence(value: unknown): Promise<void> {
  await mkdir(resolve(root, "evidence/coston2"), { recursive: true });
  const temporary = `${evidencePath}.${process.pid}.tmp`;
  const serialized = `${JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2)}\n`;
  await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, evidencePath);
}

async function run(options: LifecycleCLI): Promise<void> {
  if (options.plan) {
    console.log(JSON.stringify({
      status: "planned", network: "flare-coston2", dispatcher,
      operations: ["three-machine private custody", "two-of-three ALLOW", "execute", "two-of-three CAP_EXCEEDED DENY", "stop/resume/revoke"],
      broadcasts: false,
      caveat: "This proves a live simulated V1 lifecycle, not hardware attestation, V2 release, outage recovery, or mainnet readiness.",
    }, null, 2));
    return;
  }
  const custodyOptions = parseLiveCustodyCLI(["freeze", "--write-live-private-policy", "--broadcast"]);
  const context = await executeLiveCustody({ ...custodyOptions, policyProfile: "lifecycle" });
  if (!context?.freeze) throw new Error("live custody freeze did not complete");
  const { account, registry, vault, router, rpc, client, machines, binding, sourceCommit } = context;
  const chain = { id: 114, name: "Flare Coston2", nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } } as const;
  const wallet = createWalletClient({ account, chain, transport: http(rpc, { timeout: 15_000, retryCount: 2 }) });
  const write = async (address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[], value?: bigint) => {
    const simulation = await client.simulateContract({ account: account.address, address, abi: abi as never, functionName: functionName as never, args: args as never, ...(value === undefined ? {} : { value }) });
    const transaction = await wallet.writeContract({ ...simulation.request, account, chain } as never) as Hash;
    const receipt = await client.waitForTransactionReceipt({ hash: transaction, confirmations: 2, timeout: 180_000 });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
    return { transaction, receipt };
  };
  const accountingBefore = accountingOf(await client.readContract({ address: vault, abi: PayGuardVaultAbi, functionName: "accounting", args: [account.address, ftestXrp] }));
  if (accountingBefore.available < 200_000n) throw new Error("vault balance is below the live lifecycle safety buffer");

  const dispatchAndEvaluate = async (request: ActionRequestV1, state: SpendStateV1, expectedDecision: "ALLOW" | "DENY", expectedReason: PublicReasonClass) => {
    const created = await write(router, PayGuardActionRouterAbi, "createRequest", [request]);
    const message = stringToHex(JSON.stringify({ request: wireRequest(request), state: wireState(state) }));
    const dispatched = await write(dispatcher, PayGuardFccDispatcherAbi, "sendEvaluation", [machines.map((machine) => machine.teeId), message], 3_000_000n);
    let instructionId: Hex | undefined;
    for (const log of dispatched.receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: PayGuardFccDispatcherAbi, data: log.data, topics: log.topics, eventName: "EvaluationDispatched", strict: true });
        instructionId = decoded.args.instructionId;
      } catch { /* unrelated log */ }
    }
    if (!instructionId) throw new Error("dispatcher transaction omitted EvaluationDispatched");
    const evaluations = await Promise.all(machines.map((machine) => pollEvaluation(machine.origin, instructionId!, request, machine)));
    if (new Set(evaluations.map((item) => item.digest)).size !== 1
      || evaluations.some((item) => item.result.decision !== expectedDecision || item.result.publicReasonClass !== expectedReason)) {
      throw new Error("three live machines did not return one matching expected decision");
    }
    const submitted: Hash[] = [];
    for (const evaluation of evaluations.slice(0, 2)) {
      const tx = await write(router, PayGuardActionRouterAbi, "submitEvaluation", [{
        ...evaluation.result,
        decision: evaluation.result.decision === "ALLOW" ? 1 : 0,
        publicReasonClass: publicReasonCode(evaluation.result.publicReasonClass),
      }, evaluation.signature]);
      submitted.push(tx.transaction);
    }
    const stored = await client.readContract({ address: router, abi: PayGuardActionRouterAbi, functionName: "getRequest", args: [request.requestId] });
    const transactions: TransactionSet = {
      create: created.transaction,
      dispatch: dispatched.transaction,
      submit: submitted as [Hash, Hash],
    };
    return {
      instructionId, digest: evaluations[0]!.digest, results: evaluations,
      transactions,
      status: Number(stored.status),
    };
  };

  const firstBlock = await client.getBlock({ blockTag: "latest" });
  const firstCheckpoint = genesisSpendCheckpoint(binding.policyCommitment);
  const firstRequest = buildRequest(binding, account.address, registry, vault, router, 1, firstCheckpoint, balanceCheckpoint(accountingBefore, 1n), firstBlock.timestamp);
  const firstState: SpendStateV1 = { availableBalance: accountingBefore.available, history: [], occurrenceCount: 0, lastAccountingAt: 0n, spendCheckpoint: firstCheckpoint, balanceCheckpoint: firstRequest.balanceCheckpoint, now: firstBlock.timestamp };
  const allow = await dispatchAndEvaluate(firstRequest, firstState, "ALLOW", "OK");
  if (allow.status !== 2) throw new Error("two matching ALLOW results did not reserve the request");
  const executed = await write(router, PayGuardActionRouterAbi, "execute", [firstRequest.requestId]);
  allow.transactions.execute = executed.transaction;
  const storedAllow = await client.readContract({ address: router, abi: PayGuardActionRouterAbi, functionName: "getRequest", args: [firstRequest.requestId] });
  const accountingAfterAllow = accountingOf(await client.readContract({ address: vault, abi: PayGuardVaultAbi, functionName: "accounting", args: [account.address, ftestXrp] }));
  if (Number(storedAllow.status) !== 4 || accountingAfterAllow.available !== accountingBefore.available - firstRequest.amount
    || accountingAfterAllow.spent !== accountingBefore.spent + firstRequest.amount || accountingAfterAllow.reserved !== 0n) throw new Error("ALLOW execution conservation readback failed");

  const firstResult = allow.results[0]!.result;
  const history: SpendHistoryEntryV1[] = [{ request: firstRequest, accountedAt: firstResult.issuedAt }];
  const secondBlock = await client.getBlock({ blockTag: "latest" });
  const secondRequest = buildRequest(binding, account.address, registry, vault, router, 2, firstResult.resultingCheckpoint, balanceCheckpoint(accountingAfterAllow, 2n), secondBlock.timestamp);
  const secondState: SpendStateV1 = { availableBalance: accountingAfterAllow.available, history, occurrenceCount: 1, lastAccountingAt: firstResult.issuedAt, spendCheckpoint: firstResult.resultingCheckpoint, balanceCheckpoint: secondRequest.balanceCheckpoint, now: secondBlock.timestamp };
  const deny = await dispatchAndEvaluate(secondRequest, secondState, "DENY", "CAP_EXCEEDED");
  if (deny.status !== 3) throw new Error("two matching DENY results did not deny the request");
  const accountingAfterDeny = accountingOf(await client.readContract({ address: vault, abi: PayGuardVaultAbi, functionName: "accounting", args: [account.address, ftestXrp] }));
  if (!sameAccounting(accountingAfterAllow, accountingAfterDeny)) throw new Error("DENY changed vault accounting");

  const stopped = await write(registry, PayGuardPolicyRegistryAbi, "stopPolicy", [binding.policyCommitment]);
  if (Number(await client.readContract({ address: registry, abi: PayGuardPolicyRegistryAbi, functionName: "policyStatus", args: [binding.policyCommitment] })) !== 2) throw new Error("policy stop readback failed");
  const resumed = await write(registry, PayGuardPolicyRegistryAbi, "resumePolicy", [binding.policyCommitment]);
  if (Number(await client.readContract({ address: registry, abi: PayGuardPolicyRegistryAbi, functionName: "policyStatus", args: [binding.policyCommitment] })) !== 1) throw new Error("policy resume readback failed");
  const revoked = await write(registry, PayGuardPolicyRegistryAbi, "revokePolicy", [binding.policyCommitment]);
  if (Number(await client.readContract({ address: registry, abi: PayGuardPolicyRegistryAbi, functionName: "policyStatus", args: [binding.policyCommitment] })) !== 3) throw new Error("policy revoke readback failed");

  const observedBlock = revoked.receipt.blockNumber;
  const evidence = buildSanitizedLifecycleEvidence({
    sourceCommit, observedBlock, policyCommitment: binding.policyCommitment,
    custodyFreeze: context.freeze.policyFreezeTransaction, machines,
    allow: { instructionId: allow.instructionId, digest: allow.digest, transactions: allow.transactions, status: Number(storedAllow.status), accountingBefore, accountingAfter: accountingAfterAllow },
    deny: { instructionId: deny.instructionId, digest: deny.digest, reason: "CAP_EXCEEDED", transactions: deny.transactions, status: deny.status, accountingAfter: accountingAfterDeny },
    policyTransactions: { stop: stopped.transaction, resume: resumed.transaction, revoke: revoked.transaction },
  });
  await writeEvidence(evidence);
  console.log(JSON.stringify({
    status: evidence.status, policyCommitment: binding.policyCommitment,
    allowInstructionId: allow.instructionId, allowStatus: Number(storedAllow.status),
    denyInstructionId: deny.instructionId, denyStatus: deny.status,
    observedBlock: observedBlock.toString(), evidencePath, privateMaterialRecorded: false,
  }));
}

if (import.meta.url === new URL(process.argv[1]!, "file:").href) {
  run(parseLifecycleCLI(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "live lifecycle failed");
    process.exitCode = 1;
  });
}
