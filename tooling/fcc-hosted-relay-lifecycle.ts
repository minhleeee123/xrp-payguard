import { randomBytes } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ACTION_FTESTXRP_TRANSFER,
  CHAIN_ID,
  ZERO_BYTES32,
  genesisSpendCheckpoint,
  type ActionRequestV1,
  type Hex,
} from "../packages/protocol/src/index.js";
import {
  PayGuardActionRouterAbi,
  PayGuardPolicyRegistryV2Abi,
  PayGuardVaultAbi,
} from "../packages/bindings/src/index.js";
import { liveEvaluationAuthorizationDigest } from "../apps/relay/src/live-runtime.js";
import {
  createWalletClient,
  erc20Abi,
  encodeAbiParameters,
  getAddress,
  http,
  isAddress,
  isHex,
  keccak256,
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
const evidencePath = resolve(root, "evidence/coston2/fcc-hosted-relay-lifecycle.json");
const ftestXrp = getAddress("0x0b6A3645c240605887a5532109323A3E12273dc7");
const defaultRelay = "https://payguard-live-relay-production.up.railway.app";
const balanceDomain = keccak256(stringToHex("PAYGUARD_BALANCE_CHECKPOINT_V1"));

export interface HostedLifecycleCLI {
  plan: boolean;
  broadcast: boolean;
  writeLivePrivatePolicy: boolean;
  relayOrigin: string;
}

interface Accounting {
  deposited: bigint;
  available: bigint;
  reserved: bigint;
  spent: bigint;
  withdrawn: bigint;
  refunded: bigint;
}

interface RelayResult {
  status: "threshold-submitted" | "already-finalized";
  requestId: Hex;
  routerStatus: 2 | 3 | 4;
  decision: "ALLOW" | "DENY";
  publicReasonClass: string;
  instructionId?: Hex;
  transactions: { dispatch?: Hash; submit: Hash[] };
}

export function parseHostedLifecycleCLI(argv: readonly string[]): HostedLifecycleCLI {
  const [mode, ...tokens] = argv;
  if (mode === "plan" && tokens.length === 0) return { plan: true, broadcast: false, writeLivePrivatePolicy: false, relayOrigin: defaultRelay };
  if (mode !== "run") throw new Error("mode must be plan or run");
  let broadcast = false;
  let writeLivePrivatePolicy = false;
  let relayOrigin: string | undefined;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--broadcast" && !broadcast) { broadcast = true; continue; }
    if (token === "--write-live-private-policy" && !writeLivePrivatePolicy) { writeLivePrivatePolicy = true; continue; }
    if (token === "--relay" && index + 1 < tokens.length && !relayOrigin) {
      const candidate = tokens[++index]!;
      const origin = new URL(candidate).origin;
      if (origin !== candidate || !origin.startsWith("https://")) throw new Error("relay must be a bare HTTPS origin");
      relayOrigin = origin;
      continue;
    }
    throw new Error(`invalid or duplicate hosted lifecycle argument ${token}`);
  }
  if (!broadcast || !writeLivePrivatePolicy || !relayOrigin) {
    throw new Error("run requires --broadcast, --write-live-private-policy, and --relay");
  }
  return { plan: false, broadcast, writeLivePrivatePolicy, relayOrigin };
}

export function buildHostedLifecycleEvidence(input: {
  sourceCommit: string;
  relayOrigin: string;
  observedBlock: bigint;
  policyCommitment: Hex;
  custodyFreeze: Hash;
  machines: readonly LiveMachine[];
  allow: { requestId: Hex; instructionId: Hex; create: Hash; dispatch: Hash; submit: Hash[]; execute: Hash };
  deny: { requestId: Hex; instructionId: Hex; reason: string; create: Hash; dispatch: Hash; submit: Hash[] };
  policyTransactions: { stop: Hash; resume: Hash; revoke: Hash };
  accounting: { before: Accounting; afterAllow: Accounting; afterDeny: Accounting };
  recordedAt?: string;
}) {
  if (!/^[0-9a-f]{40}$/.test(input.sourceCommit) || input.machines.length !== 3
    || !input.relayOrigin.startsWith("https://") || input.allow.submit.length < 2 || input.deny.submit.length < 2
    || input.deny.reason !== "CAP_EXCEEDED") throw new Error("hosted lifecycle evidence input is invalid");
  if (input.accounting.afterAllow.available !== input.accounting.before.available - 100_000n
    || input.accounting.afterAllow.spent !== input.accounting.before.spent + 100_000n
    || !sameAccounting(input.accounting.afterAllow, input.accounting.afterDeny)) {
    throw new Error("hosted lifecycle conservation evidence is invalid");
  }
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-hosted-live-fcc-relay-lifecycle",
    status: "verified-hosted-live-simulated-fcc-lifecycle",
    registryVersion: "V2",
    deploymentProfile: "COSTON2_SIMULATED_V2",
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    network: { name: "flare-coston2", chainId: 114, observedBlock: input.observedBlock.toString() },
    publicIdentifiers: {
      verificationSourceCommit: input.sourceCommit,
      relayOrigin: input.relayOrigin,
      policyCommitment: input.policyCommitment,
      custodyFreezeTransaction: input.custodyFreeze,
      machines: input.machines.map((machine) => ({ teeId: machine.teeId, proxyId: machine.proxyId, url: machine.origin, status: machine.status })),
      allow: input.allow,
      deny: input.deny,
      policyLifecycleTransactions: input.policyTransactions,
      accounting: input.accounting,
    },
    assertions: {
      hostedRelayHealthVerified: true,
      hostedAuthenticatedPrivateIngressVerified: true,
      threeRegisteredMachineReceiptsVerified: true,
      requestIdOnlyEvaluationVerified: true,
      clientDecisionAccepted: false,
      relayCanonicalChainReconstructionVerified: true,
      twoMatchingAllowSubmittedByRelay: true,
      allowExecutionVerified: true,
      twoMatchingDenySubmittedByRelay: true,
      denyMovedNoFundsVerified: true,
      stopResumeRevokeVerified: true,
      vaultConservationVerified: true,
      hardwareAttestationVerified: false,
      simulatedTee: true,
      v2LiveCandidateVerified: true,
      v2ReleaseVerified: false,
      verifiedPayGuardRelease: false,
      noPrivateKeyRecorded: true,
      noCredentialRecorded: true,
      noPolicyRecorded: true,
      noCiphertextRecorded: true,
      noSignatureRecorded: true,
      testnetOnly: true,
    },
    blockers: ["HARDWARE_ATTESTATION_NOT_VERIFIED", "VERIFIED_RELEASE_NOT_PROMOTED"],
    notes: [
      "Organizer-approved SIMULATED_TEE=true was used on Coston2.",
      "The hosted relay received independently encrypted policy ciphertext only during authenticated ingress, then received request IDs with empty JSON bodies for evaluation.",
      "The relay reconstructed canonical public request, vault, policy, and spend state from Coston2 and did not accept a client decision.",
      "Private policy material, ciphertexts, owner authorizations, signatures, credentials, and keys are excluded from this evidence.",
      "This verifies the deployed V2 Coston2 simulated profile; it is not hardware attestation, a verified PayGuard release, or mainnet readiness.",
    ],
  };
}

async function run(options: HostedLifecycleCLI): Promise<void> {
  if (options.plan) {
    console.log(JSON.stringify({
      status: "planned",
      network: "flare-coston2",
      relayOrigin: options.relayOrigin,
      operations: ["hosted private ingress A/B/D", "policy register", "request-id-only ALLOW", "execute", "request-id-only CAP_EXCEEDED DENY", "stop/resume/revoke"],
      broadcasts: false,
      caveat: "Planned V2 Coston2 simulated-profile verification only; not a hardware-attested release claim.",
    }, null, 2));
    return;
  }
  const health = await boundedJson(`${options.relayOrigin}/healthz`, { headers: { accept: "application/json" } }, 64 * 1024);
  if (health.status !== "ready" || health.mode !== "LIVE_SIMULATED_TEE_C2" || health.machineCount !== 3
    || health.registryVersion !== "V2" || health.deploymentProfile !== "COSTON2_SIMULATED_V2"
    || health.v2LiveCandidateVerified !== true
    || health.simulatedTee !== true || health.hardwareTeeVerified !== false || health.verifiedPayGuardRelease !== false) {
    throw new Error("hosted relay health preflight failed");
  }
  const custodyOptions = parseLiveCustodyCLI([
    "freeze", "--write-live-private-policy", "--broadcast", "--relay", options.relayOrigin,
  ]);
  const context = await executeLiveCustody({ ...custodyOptions, policyProfile: "lifecycle" });
  if (!context?.freeze) throw new Error("hosted custody freeze did not complete");
  const { sourceCommit, account, registry, vault, router, rpc, client, machines, binding } = context;
  const chain = { id: 114, name: "Flare Coston2", nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } } as const;
  const wallet = createWalletClient({ account, chain, transport: http(rpc, { timeout: 15_000, retryCount: 2 }) });
  const write = async (address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[], value?: bigint) => {
    const simulation = await client.simulateContract({ account: account.address, address, abi: abi as never, functionName: functionName as never, args: args as never, ...(value === undefined ? {} : { value }) });
    const transaction = await wallet.writeContract({ ...simulation.request, account, chain } as never) as Hash;
    const receipt = await client.waitForTransactionReceipt({ hash: transaction, confirmations: 2, timeout: 180_000 });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
    return { transaction, receipt };
  };
  let accountingBefore = accountingOf(await client.readContract({ address: vault, abi: PayGuardVaultAbi, functionName: "accounting", args: [account.address, ftestXrp] }));
  if (accountingBefore.available < 200_000n) {
    const fundingAmount = 500_000n;
    const walletBalance = await client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
    if (walletBalance < fundingAmount) throw new Error("wallet FTestXRP balance is below the V2 lifecycle safety buffer");
    await write(ftestXrp, erc20Abi, "approve", [vault, fundingAmount]);
    await write(vault, PayGuardVaultAbi, "deposit", [ftestXrp, fundingAmount, account.address]);
    accountingBefore = accountingOf(await client.readContract({ address: vault, abi: PayGuardVaultAbi, functionName: "accounting", args: [account.address, ftestXrp] }));
    if (accountingBefore.available < 200_000n) throw new Error("V2 vault funding postcondition failed");
  }

  const firstBlock = await client.getBlock({ blockTag: "latest" });
  const firstRequest = buildRequest(binding, account.address, registry, vault, router, 1, genesisSpendCheckpoint(binding.policyCommitment), balanceCheckpoint(accountingBefore, 1n), firstBlock.timestamp);
  const createdAllow = await write(router, PayGuardActionRouterAbi, "createRequest", [firstRequest]);
  const allow = await requestRelayEvaluation(options.relayOrigin, firstRequest.requestId, account);
  if (allow.decision !== "ALLOW" || allow.publicReasonClass !== "OK" || allow.routerStatus !== 2 || !allow.instructionId || !allow.transactions.dispatch || allow.transactions.submit.length < 2) {
    throw new Error("hosted ALLOW threshold postcondition failed");
  }
  const executed = await write(router, PayGuardActionRouterAbi, "execute", [firstRequest.requestId]);
  const storedAllow = await client.readContract({ address: router, abi: PayGuardActionRouterAbi, functionName: "getRequest", args: [firstRequest.requestId] });
  const accountingAfterAllow = accountingOf(await client.readContract({ address: vault, abi: PayGuardVaultAbi, functionName: "accounting", args: [account.address, ftestXrp] }));
  if (Number(storedAllow.status) !== 4 || accountingAfterAllow.available !== accountingBefore.available - firstRequest.amount
    || accountingAfterAllow.spent !== accountingBefore.spent + firstRequest.amount || accountingAfterAllow.reserved !== 0n) {
    throw new Error("hosted ALLOW execution conservation failed");
  }

  const spend = await client.readContract({ address: router, abi: PayGuardActionRouterAbi, functionName: "spendState", args: [binding.policyCommitment] });
  const secondBlock = await client.getBlock({ blockTag: "latest" });
  const nextOccurrence = Number(spend[1]) + 1;
  const secondRequest = buildRequest(
    binding, account.address, registry, vault, router, nextOccurrence, spend[0],
    balanceCheckpoint(accountingAfterAllow, BigInt(nextOccurrence)), secondBlock.timestamp,
  );
  const createdDeny = await write(router, PayGuardActionRouterAbi, "createRequest", [secondRequest]);
  const deny = await requestRelayEvaluation(options.relayOrigin, secondRequest.requestId, account);
  if (deny.decision !== "DENY" || deny.publicReasonClass !== "CAP_EXCEEDED" || deny.routerStatus !== 3 || !deny.instructionId || !deny.transactions.dispatch || deny.transactions.submit.length < 2) {
    throw new Error("hosted DENY threshold postcondition failed");
  }
  const accountingAfterDeny = accountingOf(await client.readContract({ address: vault, abi: PayGuardVaultAbi, functionName: "accounting", args: [account.address, ftestXrp] }));
  if (!sameAccounting(accountingAfterAllow, accountingAfterDeny)) throw new Error("hosted DENY moved vault accounting");

  const stopped = await write(registry, PayGuardPolicyRegistryV2Abi, "stopPolicy", [binding.policyCommitment]);
  const resumed = await write(registry, PayGuardPolicyRegistryV2Abi, "resumePolicy", [binding.policyCommitment]);
  const revoked = await write(registry, PayGuardPolicyRegistryV2Abi, "revokePolicy", [binding.policyCommitment]);
  if (Number(await client.readContract({ address: registry, abi: PayGuardPolicyRegistryV2Abi, functionName: "policyStatus", args: [binding.policyCommitment] })) !== 3) {
    throw new Error("hosted policy governance readback failed");
  }
  const evidence = buildHostedLifecycleEvidence({
    sourceCommit,
    relayOrigin: options.relayOrigin,
    observedBlock: revoked.receipt.blockNumber,
    policyCommitment: binding.policyCommitment,
    custodyFreeze: context.freeze.policyFreezeTransaction,
    machines,
    allow: { requestId: firstRequest.requestId, instructionId: allow.instructionId, create: createdAllow.transaction, dispatch: allow.transactions.dispatch, submit: allow.transactions.submit, execute: executed.transaction },
    deny: { requestId: secondRequest.requestId, instructionId: deny.instructionId, reason: "CAP_EXCEEDED", create: createdDeny.transaction, dispatch: deny.transactions.dispatch, submit: deny.transactions.submit },
    policyTransactions: { stop: stopped.transaction, resume: resumed.transaction, revoke: revoked.transaction },
    accounting: { before: accountingBefore, afterAllow: accountingAfterAllow, afterDeny: accountingAfterDeny },
  });
  await writeEvidence(evidence);
  console.log(JSON.stringify({
    status: evidence.status,
    relayOrigin: options.relayOrigin,
    policyCommitment: binding.policyCommitment,
    allowRequestId: firstRequest.requestId,
    allowInstructionId: allow.instructionId,
    denyRequestId: secondRequest.requestId,
    denyInstructionId: deny.instructionId,
    finalBlock: revoked.receipt.blockNumber.toString(),
    evidencePath,
    privateMaterialRecorded: false,
  }, null, 2));
}

async function requestRelayEvaluation(relayOrigin: string, requestId: Hex, account: { address: Address; signMessage(input: { message: { raw: Hex } }): Promise<Hex> }): Promise<RelayResult> {
  const issuedAt = BigInt(Math.floor(Date.now() / 1_000));
  const expiry = issuedAt + 240n;
  const authorization = await account.signMessage({ message: { raw: liveEvaluationAuthorizationDigest({ requestId, owner: account.address, issuedAt, expiry }) } });
  const value = await boundedJson(`${relayOrigin}/v1/requests/${requestId}/evaluate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-payguard-owner": account.address,
      "x-payguard-issued-at": issuedAt.toString(),
      "x-payguard-expiry": expiry.toString(),
      "x-payguard-authorization": authorization,
    },
    body: "{}",
  }, 512 * 1024, 210_000);
  const transactions = object(value.transactions, "relay transactions");
  const assertions = object(value.assertions, "relay assertions");
  const submit = array(transactions.submit, "relay submissions").map((item) => hash(item, "relay submission"));
  if ((value.status !== "threshold-submitted" && value.status !== "already-finalized")
    || hash(value.requestId, "relay request ID") !== requestId.toLowerCase()
    || ![2, 3, 4].includes(Number(value.routerStatus)) || (value.decision !== "ALLOW" && value.decision !== "DENY")
    || typeof value.publicReasonClass !== "string" || assertions.requestReadFromCoston2 !== true
    || assertions.clientDecisionAccepted !== false || assertions.threeRegisteredMachinesChecked !== true
    || assertions.outerSignaturesVerified !== true || assertions.innerSignaturesVerified !== true
    || assertions.twoMatchingResultsSubmitted !== true || assertions.simulatedTee !== true
    || assertions.hardwareTeeVerified !== false || assertions.verifiedPayGuardRelease !== false) {
    throw new Error("hosted relay result assertions failed");
  }
  return {
    status: value.status,
    requestId,
    routerStatus: Number(value.routerStatus) as 2 | 3 | 4,
    decision: value.decision,
    publicReasonClass: value.publicReasonClass,
    ...(value.instructionId === undefined ? {} : { instructionId: hash(value.instructionId, "instruction ID") }),
    transactions: {
      ...(transactions.dispatch === undefined ? {} : { dispatch: hash(transactions.dispatch, "dispatch transaction") }),
      submit,
    },
  };
}

function buildRequest(
  binding: { policyId: Hex; policyVersion: number; policyCommitment: Hex }, owner: Address,
  registry: Address, vault: Address, router: Address, occurrence: number,
  spendCheckpoint: Hex, checkpoint: Hex, timestamp: bigint,
): ActionRequestV1 {
  return {
    chainId: CHAIN_ID, registry, vault, router, policyId: binding.policyId, policyVersion: binding.policyVersion,
    policyCommitment: binding.policyCommitment, requestId: randomHex32(), requestNonce: BigInt(randomHex32()), attempt: 1,
    requester: owner, target: owner, asset: ftestXrp, actionType: ACTION_FTESTXRP_TRANSFER, amount: 100_000n,
    scheduleSlot: 0n, occurrence, spendCheckpoint, balanceCheckpoint: checkpoint, inputCommitment: ZERO_BYTES32,
    createdAt: timestamp, graceDeadline: timestamp, expiry: timestamp + 1_800n,
  };
}

function balanceCheckpoint(accounting: Accounting, sequence: bigint): Hex {
  return keccak256(encodeAbiParameters([
    { type: "bytes32" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" },
    { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" },
  ], [balanceDomain, accounting.deposited, accounting.available, accounting.reserved, accounting.spent, accounting.withdrawn, accounting.refunded, sequence]));
}

function accountingOf(value: unknown): Accounting {
  const record = value as Record<string, unknown>;
  const accounting = {
    deposited: BigInt(record.deposited as bigint), available: BigInt(record.available as bigint),
    reserved: BigInt(record.reserved as bigint), spent: BigInt(record.spent as bigint),
    withdrawn: BigInt(record.withdrawn as bigint), refunded: BigInt(record.refunded as bigint),
  };
  if (accounting.deposited !== accounting.available + accounting.reserved + accounting.spent + accounting.withdrawn + accounting.refunded) {
    throw new Error("vault conservation failed");
  }
  return accounting;
}

function sameAccounting(left: Accounting, right: Accounting): boolean {
  return left.deposited === right.deposited && left.available === right.available && left.reserved === right.reserved
    && left.spent === right.spent && left.withdrawn === right.withdrawn && left.refunded === right.refunded;
}

async function boundedJson(url: string, init: RequestInit, maximum: number, timeout = 20_000): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(timeout) });
  const text = await response.text();
  if (!response.ok || !text || text.length > maximum) throw new Error(`hosted relay request failed with HTTP ${response.status}`);
  return object(JSON.parse(text), "hosted relay response");
}

async function writeEvidence(value: unknown): Promise<void> {
  await mkdir(resolve(root, "evidence/coston2"), { recursive: true });
  const temporary = `${evidencePath}.${process.pid}.tmp`;
  const serialized = `${JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2)}\n`;
  await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, evidencePath);
}

function randomHex32(): Hex { return `0x${randomBytes(32).toString("hex")}`; }
function object(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`); return value as Record<string, unknown>; }
function array(value: unknown, label: string): unknown[] { if (!Array.isArray(value)) throw new Error(`${label} is invalid`); return value; }
function hash(value: unknown, label: string): Hex { if (typeof value !== "string" || !isHex(value) || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} is invalid`); return value.toLowerCase() as Hex; }

if (import.meta.url === new URL(process.argv[1]!, "file:").href) {
  run(parseHostedLifecycleCLI(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "hosted relay lifecycle failed");
    process.exitCode = 1;
  });
}
