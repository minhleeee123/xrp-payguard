import {
  PayGuardActionRouterAbi,
  PayGuardPolicyRegistryAbi,
} from "@xrp-payguard/bindings";
import {
  ACTION_FTESTXRP_TRANSFER,
  POLICY_SCHEMA_V1,
  ZERO_BYTES32,
  actionRequestHash,
  encryptPrivatePolicyForTeeV1,
  genesisSpendCheckpoint,
  policyBindingDigest,
  policyCommitment,
  policyIngressAuthorizationDigest,
  policyReceiptAttestationDigest,
  policyReceiptDigest,
  type ActionRequestV1,
  type PolicyBindingV1,
  type PolicyReceiptV1,
  type PolicyV1,
  type TeePublicKeyV1,
} from "@xrp-payguard/protocol";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  encodeAbiParameters,
  getAddress,
  hexToBigInt,
  hexToBytes,
  http,
  isAddress,
  keccak256,
  padHex,
  recoverMessageAddress,
  stringToHex,
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from "viem";
import {
  COSTON2_CHAIN,
  PAYGUARD_COSTON2,
  loadCoston2AccountSnapshot,
  type Coston2AccountSnapshot,
  type Eip1193Provider,
} from "./coston2.js";

export const LIVE_FCC_MODE = "LIVE_SIMULATED_TEE_C2" as const;
const AUTHORIZATION_SECONDS = 900n;
const EVALUATION_AUTHORIZATION_SECONDS = 240n;
const REQUEST_LIFETIME_SECONDS = 900n;
const FINALITY_ATTEMPTS = 45;
const MAX_RESPONSE_BYTES = 512 * 1024;
const BALANCE_DOMAIN = keccak256(stringToHex("PAYGUARD_BALANCE_CHECKPOINT_V1"));
const RELAY_AUTH_PREFIX = padHex(stringToHex("PAYGUARD_RELAY_AUTH_V1"), { size: 32, dir: "right" });

const publicClient = createPublicClient({
  chain: COSTON2_CHAIN,
  transport: http(COSTON2_CHAIN.rpcUrls.default.http[0], { retryCount: 2, timeout: 15_000 }),
});

export interface LiveMachineConfig {
  index: 1 | 2 | 3;
  teeId: Address;
  proxyId: Address;
  origin: string;
  machineId: Hex;
  keyFingerprint: Hex;
  signer: Address;
  publicKey: TeePublicKeyV1;
  codeHash: Hex;
  platform: Hex;
  status: 2;
}

export interface LiveFccConfig {
  schemaVersion: 1;
  mode: typeof LIVE_FCC_MODE;
  status: "ready";
  chainId: 114;
  extensionId: Hex;
  deploymentBlock: bigint;
  operator: Address;
  relayOrigin: string;
  contracts: {
    registry: Address;
    vault: Address;
    router: Address;
    dispatcher: Address;
    manager: Address;
    asset: Address;
  };
  machines: [LiveMachineConfig, LiveMachineConfig, LiveMachineConfig];
  assertions: {
    registeredMachinesVerified: true;
    stableHttpsOriginsVerified: true;
    authenticatedPrivateIngressVerified: true;
    simulatedTee: true;
    hardwareTeeVerified: false;
    v2ReleaseVerified: false;
    verifiedPayGuardRelease: false;
  };
}

export interface LiveCustodyEnvelope {
  receipt: PolicyReceiptV1;
  digest: Hex;
  signer: Address;
  signature: Hex;
}

export interface LivePolicySession {
  policy: PolicyV1;
  binding: PolicyBindingV1;
  ciphertexts: readonly [Hex, Hex, Hex];
  custody: readonly [LiveCustodyEnvelope, LiveCustodyEnvelope, LiveCustodyEnvelope];
}

export interface LiveTransactionResult {
  hash: Hash;
  blockNumber: bigint;
}

export interface LiveRequestResult extends LiveTransactionResult {
  request: ActionRequestV1;
}

export interface LiveEvaluationResult {
  status: "threshold-submitted" | "already-finalized";
  requestId: Hex;
  routerStatus: 2 | 3 | 4;
  decision: "ALLOW" | "DENY";
  publicReasonClass: string;
  instructionId?: Hex;
  transactions: { dispatch?: Hex; submit: Hex[] };
}

export type LivePolicyAction = "STOP" | "RESUME" | "REVOKE";

export const DEFAULT_LIVE_FCC_RELAY_ORIGIN = "https://payguard-live-relay-production.up.railway.app";

export async function fetchLiveFccConfig(
  fetcher: typeof fetch = fetch,
  relayOrigin = String(import.meta.env.VITE_PAYGUARD_LIVE_RELAY_ORIGIN || DEFAULT_LIVE_FCC_RELAY_ORIGIN),
): Promise<LiveFccConfig> {
  const origin = normalizeRelayOrigin(relayOrigin);
  const response = await fetcher(`${origin}/v1/config`, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
    redirect: "error",
  });
  const text = await boundedResponse(response);
  if (!response.ok) throw new Error("LIVE_FCC_CONFIG_UNAVAILABLE");
  return parseLiveFccConfig(JSON.parse(text), origin);
}

export function livePolicyBindingV1(policy: PolicyV1, config: LiveFccConfig): PolicyBindingV1 {
  if (policy.chainId !== 114n || getAddress(policy.owner) !== config.operator
    || getAddress(policy.registry) !== config.contracts.registry
    || getAddress(policy.vault) !== config.contracts.vault
    || getAddress(policy.router) !== config.contracts.router
    || getAddress(policy.asset) !== config.contracts.asset) {
    throw new Error("LIVE_POLICY_OUTSIDE_OPERATOR_DOMAIN");
  }
  const policyNonce = BigInt(`0x${policy.submissionNonce.slice(2, 18)}`) || 1n;
  return {
    chainId: 114n,
    registry: config.contracts.registry,
    vault: config.contracts.vault,
    router: config.contracts.router,
    owner: config.operator,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyCommitment: policyCommitment(policy),
    schema: POLICY_SCHEMA_V1,
    extensionId: config.extensionId,
    codeVersion: config.machines[0].codeHash,
    machineIds: config.machines.map((machine) => machine.machineId) as [Hex, Hex, Hex],
    keyFingerprints: config.machines.map((machine) => machine.keyFingerprint) as [Hex, Hex, Hex],
    custodyThreshold: 3,
    resultThreshold: 2,
    policyNonce,
  };
}

export async function collectLiveCustody(
  policy: PolicyV1,
  account: Address,
  provider: Eip1193Provider,
  config: LiveFccConfig,
  fetcher: typeof fetch = fetch,
  now = BigInt(Math.floor(Date.now() / 1_000)),
): Promise<LivePolicySession> {
  if (getAddress(account) !== config.operator || getAddress(policy.owner) !== config.operator) {
    throw new Error("LIVE_OPERATOR_WALLET_REQUIRED");
  }
  const binding = livePolicyBindingV1(policy, config);
  const ciphertexts = await Promise.all(config.machines.map((machine) => encryptPrivatePolicyForTeeV1(policy, machine.publicKey))) as [Hex, Hex, Hex];
  const expiry = now + AUTHORIZATION_SECONDS;
  const custody: LiveCustodyEnvelope[] = [];
  for (let index = 0; index < 3; index += 1) {
    const machine = config.machines[index]!;
    const ciphertext = ciphertexts[index]!;
    const authorizationDigest = policyIngressAuthorizationDigest({
      binding,
      submissionNonce: policy.submissionNonce,
      issuedAt: now,
      expiry,
      ciphertextHash: keccak256(ciphertext),
      machineId: machine.machineId,
      keyFingerprint: machine.keyFingerprint,
    });
    const authorization = await signRawMessage(provider, account, authorizationDigest);
    const response = await fetcher(`${config.relayOrigin}/v1/ingress/${index + 1}`, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: stringifyWire({
        binding,
        submissionNonce: policy.submissionNonce,
        issuedAt: now,
        expiry,
        ciphertext: bytesToBase64(hexToBytes(ciphertext)),
        authorization,
      }),
    });
    const text = await boundedResponse(response);
    if (!response.ok) throw new Error("LIVE_CUSTODY_UNAVAILABLE");
    custody.push(parseLiveReceipt(JSON.parse(text), binding, policy.submissionNonce, now, expiry, machine));
  }
  const session: LivePolicySession = {
    policy,
    binding,
    ciphertexts,
    custody: custody as [LiveCustodyEnvelope, LiveCustodyEnvelope, LiveCustodyEnvelope],
  };
  await verifyLiveCustody(session, config);
  return session;
}

export async function verifyLiveCustody(session: LivePolicySession, config: LiveFccConfig): Promise<void> {
  const bindingDigest = policyBindingDigest(session.binding).toLowerCase();
  const machines = new Set<string>();
  for (let index = 0; index < 3; index += 1) {
    const machine = config.machines[index]!;
    const envelope = session.custody[index]!;
    if (policyBindingDigest(envelope.receipt.binding).toLowerCase() !== bindingDigest
      || envelope.receipt.machineId.toLowerCase() !== machine.machineId.toLowerCase()
      || envelope.receipt.keyFingerprint.toLowerCase() !== machine.keyFingerprint.toLowerCase()
      || envelope.receipt.submissionNonce.toLowerCase() !== session.policy.submissionNonce.toLowerCase()
      || envelope.receipt.receiptNonce !== session.binding.policyNonce
      || envelope.digest.toLowerCase() !== policyReceiptDigest(envelope.receipt).toLowerCase()
      || getAddress(envelope.signer) !== machine.signer || machines.has(machine.machineId.toLowerCase())) {
      throw new Error("LIVE_CUSTODY_INVALID");
    }
    const recovered = await recoverMessageAddress({ message: { raw: policyReceiptAttestationDigest(envelope.receipt) }, signature: envelope.signature });
    if (getAddress(recovered) !== machine.signer) throw new Error("LIVE_CUSTODY_INVALID");
    machines.add(machine.machineId.toLowerCase());
  }
  if (machines.size !== 3) throw new Error("LIVE_CUSTODY_INVALID");
}

export async function registerLivePolicy(
  session: LivePolicySession,
  account: Address,
  provider: Eip1193Provider,
  config: LiveFccConfig,
): Promise<LiveTransactionResult> {
  await verifyLiveCustody(session, config);
  if (getAddress(account) !== config.operator) throw new Error("LIVE_OPERATOR_WALLET_REQUIRED");
  const receipts = session.custody.map((envelope) => ({
    machineId: envelope.receipt.machineId,
    keyFingerprint: envelope.receipt.keyFingerprint,
    submissionNonce: envelope.receipt.submissionNonce,
    receiptNonce: envelope.receipt.receiptNonce,
    issuedAt: envelope.receipt.issuedAt,
    expiry: envelope.receipt.expiry,
    signature: envelope.signature,
  })) as never;
  const wallet = createWalletClient({ account, chain: COSTON2_CHAIN, transport: custom(provider) });
  const simulation = await publicClient.simulateContract({
    account,
    address: config.contracts.registry,
    abi: PayGuardPolicyRegistryAbi,
    functionName: "registerPolicy",
    args: [session.binding, receipts],
  });
  const hash = await wallet.writeContract(simulation.request);
  const receipt = await waitForFinalizedReceipt(hash);
  requireEvent(receipt, config.contracts.registry, PayGuardPolicyRegistryAbi, "PolicyRegistered", session.binding.policyCommitment);
  if (await loadLivePolicyStatus(session.binding.policyCommitment, config) !== 1) throw new Error("LIVE_POLICY_POSTCONDITION_FAILED");
  return { hash, blockNumber: receipt.blockNumber };
}

export async function createLiveRequest(
  session: LivePolicySession,
  amount: bigint,
  account: Address,
  provider: Eip1193Provider,
  config: LiveFccConfig,
): Promise<LiveRequestResult> {
  if (amount <= 0n || getAddress(account) !== config.operator || getAddress(session.binding.owner) !== config.operator) {
    throw new Error("LIVE_REQUEST_PREFLIGHT_FAILED");
  }
  const snapshot = await loadCoston2AccountSnapshot(account);
  if (snapshot.accounting.available < amount || await loadLivePolicyStatus(session.binding.policyCommitment, config) !== 1) {
    throw new Error("LIVE_REQUEST_PREFLIGHT_FAILED");
  }
  const spendRaw = await publicClient.readContract({
    address: config.contracts.router,
    abi: PayGuardActionRouterAbi,
    functionName: "spendState",
    args: [session.binding.policyCommitment],
    blockNumber: snapshot.finalizedBlock,
  });
  const spend = spendRecord(spendRaw);
  const occurrence = spend.initialized ? spend.occurrence + 1 : 1;
  const createdAt = snapshot.finalizedAt;
  const expiry = createdAt + REQUEST_LIFETIME_SECONDS;
  const request: ActionRequestV1 = {
    chainId: 114n,
    registry: config.contracts.registry,
    vault: config.contracts.vault,
    router: config.contracts.router,
    policyId: session.binding.policyId,
    policyVersion: session.binding.policyVersion,
    policyCommitment: session.binding.policyCommitment,
    requestId: randomBytes32(),
    requestNonce: hexToBigInt(randomBytes32()) || 1n,
    attempt: 1,
    requester: account,
    target: session.policy.allowTargets[0]!,
    asset: config.contracts.asset,
    actionType: ACTION_FTESTXRP_TRANSFER,
    amount,
    scheduleSlot: 0n,
    occurrence,
    spendCheckpoint: spend.initialized ? spend.checkpoint : genesisSpendCheckpoint(session.binding.policyCommitment),
    balanceCheckpoint: liveBalanceCheckpoint(snapshot, BigInt(occurrence)),
    inputCommitment: ZERO_BYTES32,
    createdAt,
    graceDeadline: expiry,
    expiry,
  };
  const wallet = createWalletClient({ account, chain: COSTON2_CHAIN, transport: custom(provider) });
  const simulation = await publicClient.simulateContract({
    account,
    address: config.contracts.router,
    abi: PayGuardActionRouterAbi,
    functionName: "createRequest",
    args: [request],
  });
  const hash = await wallet.writeContract(simulation.request);
  const receipt = await waitForFinalizedReceipt(hash);
  requireEvent(receipt, config.contracts.router, PayGuardActionRouterAbi, "RequestCreated", request.requestId);
  const stored = await loadStoredRequest(request.requestId, config);
  if (stored.status !== 1 || actionRequestHash(stored.request).toLowerCase() !== actionRequestHash(request).toLowerCase()) {
    throw new Error("LIVE_REQUEST_POSTCONDITION_FAILED");
  }
  return { request, hash, blockNumber: receipt.blockNumber };
}

export async function evaluateLiveRequest(
  requestId: Hex,
  account: Address,
  provider: Eip1193Provider,
  config: LiveFccConfig,
  fetcher: typeof fetch = fetch,
  now = BigInt(Math.floor(Date.now() / 1_000)),
): Promise<LiveEvaluationResult> {
  if (getAddress(account) !== config.operator) throw new Error("LIVE_OPERATOR_WALLET_REQUIRED");
  const expiry = now + EVALUATION_AUTHORIZATION_SECONDS;
  const digest = liveEvaluationAuthorizationDigest(requestId, account, now, expiry, config.contracts.dispatcher);
  const authorization = await signRawMessage(provider, account, digest);
  const response = await fetcher(`${config.relayOrigin}/v1/requests/${requestId}/evaluate`, {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-payguard-owner": account,
      "x-payguard-issued-at": now.toString(),
      "x-payguard-expiry": expiry.toString(),
      "x-payguard-authorization": authorization,
    },
    body: "{}",
    signal: AbortSignal.timeout(210_000),
  });
  const text = await boundedResponse(response);
  if (!response.ok) throw new Error("LIVE_EVALUATION_UNAVAILABLE");
  return parseEvaluationResult(JSON.parse(text), requestId);
}

export async function executeLiveRequest(
  requestId: Hex,
  account: Address,
  provider: Eip1193Provider,
  config: LiveFccConfig,
): Promise<LiveTransactionResult> {
  const before = await loadStoredRequest(requestId, config);
  if (before.status !== 2) throw new Error("LIVE_REQUEST_NOT_ALLOWED");
  const wallet = createWalletClient({ account, chain: COSTON2_CHAIN, transport: custom(provider) });
  const simulation = await publicClient.simulateContract({ account, address: config.contracts.router, abi: PayGuardActionRouterAbi, functionName: "execute", args: [requestId] });
  const hash = await wallet.writeContract(simulation.request);
  const receipt = await waitForFinalizedReceipt(hash);
  requireEvent(receipt, config.contracts.router, PayGuardActionRouterAbi, "RequestExecuted", requestId);
  if ((await loadStoredRequest(requestId, config)).status !== 4) throw new Error("LIVE_EXECUTION_POSTCONDITION_FAILED");
  return { hash, blockNumber: receipt.blockNumber };
}

export async function governLivePolicy(
  action: LivePolicyAction,
  commitment: Hex,
  account: Address,
  provider: Eip1193Provider,
  config: LiveFccConfig,
): Promise<LiveTransactionResult> {
  if (getAddress(account) !== config.operator) throw new Error("LIVE_OPERATOR_WALLET_REQUIRED");
  const functionName = action === "STOP" ? "stopPolicy" : action === "RESUME" ? "resumePolicy" : "revokePolicy";
  const expected = action === "STOP" ? 2 : action === "RESUME" ? 1 : 3;
  const wallet = createWalletClient({ account, chain: COSTON2_CHAIN, transport: custom(provider) });
  const simulation = await publicClient.simulateContract({ account, address: config.contracts.registry, abi: PayGuardPolicyRegistryAbi, functionName, args: [commitment] });
  const hash = await wallet.writeContract(simulation.request);
  const receipt = await waitForFinalizedReceipt(hash);
  requireEvent(receipt, config.contracts.registry, PayGuardPolicyRegistryAbi,
    action === "STOP" ? "PolicyStopped" : action === "RESUME" ? "PolicyResumed" : "PolicyRevoked", commitment);
  if (await loadLivePolicyStatus(commitment, config) !== expected) throw new Error("LIVE_GOVERNANCE_POSTCONDITION_FAILED");
  return { hash, blockNumber: receipt.blockNumber };
}

export async function loadLivePolicyStatus(commitment: Hex, config: LiveFccConfig): Promise<number> {
  const block = await publicClient.getBlock({ blockTag: "finalized" });
  if (!block.number) throw new Error("LIVE_FINALITY_UNAVAILABLE");
  return Number(await publicClient.readContract({
    address: config.contracts.registry,
    abi: PayGuardPolicyRegistryAbi,
    functionName: "policyStatus",
    args: [commitment],
    blockNumber: block.number,
  }));
}

export function liveEvaluationAuthorizationDigest(
  requestId: Hex,
  owner: Address,
  issuedAt: bigint,
  expiry: bigint,
  dispatcher: Address,
): Hex {
  return keccak256(encodeAbiParameters([
    { type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" },
    { type: "address" }, { type: "uint64" }, { type: "uint64" },
  ], [RELAY_AUTH_PREFIX, 114n, dispatcher, requestId, owner, issuedAt, expiry]));
}

function parseLiveFccConfig(value: unknown, relayOrigin: string): LiveFccConfig {
  const record = object(value, "live config");
  const contracts = object(record.contracts, "live contracts");
  const assertions = object(record.assertions, "live assertions");
  const machines = array(record.machines, "live machines");
  if (record.schemaVersion !== 1 || record.mode !== LIVE_FCC_MODE || record.status !== "ready" || record.chainId !== 114
    || machines.length !== 3 || assertions.registeredMachinesVerified !== true
    || assertions.stableHttpsOriginsVerified !== true || assertions.authenticatedPrivateIngressVerified !== true
    || assertions.simulatedTee !== true || assertions.hardwareTeeVerified !== false
    || assertions.v2ReleaseVerified !== false || assertions.verifiedPayGuardRelease !== false) {
    throw new Error("LIVE_FCC_CONFIG_INVALID");
  }
  const parsedContracts = {
    registry: address(contracts.registry, "registry"), vault: address(contracts.vault, "vault"),
    router: address(contracts.router, "router"), dispatcher: address(contracts.dispatcher, "dispatcher"),
    manager: address(contracts.manager, "manager"), asset: address(contracts.asset, "asset"),
  };
  if (parsedContracts.registry !== PAYGUARD_COSTON2.registry || parsedContracts.vault !== PAYGUARD_COSTON2.vault
    || parsedContracts.router !== PAYGUARD_COSTON2.router || parsedContracts.asset !== PAYGUARD_COSTON2.asset) {
    throw new Error("LIVE_FCC_CONFIG_INVALID");
  }
  const parsedMachines = machines.map((item, index) => parseMachine(item, index + 1)) as [LiveMachineConfig, LiveMachineConfig, LiveMachineConfig];
  if (new Set(parsedMachines.map((machine) => machine.teeId.toLowerCase())).size !== 3
    || new Set(parsedMachines.map((machine) => machine.machineId.toLowerCase())).size !== 3
    || new Set(parsedMachines.map((machine) => machine.keyFingerprint.toLowerCase())).size !== 3
    || new Set(parsedMachines.map((machine) => machine.codeHash.toLowerCase())).size !== 1) {
    throw new Error("LIVE_FCC_CONFIG_INVALID");
  }
  return {
    schemaVersion: 1,
    mode: LIVE_FCC_MODE,
    status: "ready",
    chainId: 114,
    extensionId: bytes32(record.extensionId, "extensionId"),
    deploymentBlock: decimal(record.deploymentBlock, "deploymentBlock"),
    operator: address(record.operator, "operator"),
    relayOrigin,
    contracts: parsedContracts,
    machines: parsedMachines,
    assertions: {
      registeredMachinesVerified: true, stableHttpsOriginsVerified: true,
      authenticatedPrivateIngressVerified: true, simulatedTee: true,
      hardwareTeeVerified: false, v2ReleaseVerified: false, verifiedPayGuardRelease: false,
    },
  };
}

function parseMachine(value: unknown, expectedIndex: number): LiveMachineConfig {
  const record = object(value, "live machine");
  const key = object(record.publicKey, "machine public key");
  const origin = normalizeRelayOrigin(String(record.origin ?? ""));
  if (record.index !== expectedIndex || record.status !== 2) throw new Error("LIVE_FCC_CONFIG_INVALID");
  return {
    index: expectedIndex as 1 | 2 | 3,
    teeId: address(record.teeId, "teeId"), proxyId: address(record.proxyId, "proxyId"), origin,
    machineId: bytes32(record.machineId, "machineId"), keyFingerprint: bytes32(record.keyFingerprint, "keyFingerprint"),
    signer: address(record.signer, "signer"), publicKey: { x: bytes32(key.x, "publicKey.x"), y: bytes32(key.y, "publicKey.y") },
    codeHash: bytes32(record.codeHash, "codeHash"), platform: bytes32(record.platform, "platform"), status: 2,
  };
}

function parseLiveReceipt(
  value: unknown,
  binding: PolicyBindingV1,
  submissionNonce: Hex,
  issuedAt: bigint,
  expiry: bigint,
  machine: LiveMachineConfig,
): LiveCustodyEnvelope {
  const envelope = object(value, "receipt envelope");
  const wire = object(envelope.receipt, "receipt");
  const receiptBinding = parseWireBinding(wire.binding);
  const receipt: PolicyReceiptV1 = {
    binding: receiptBinding,
    machineId: bytes32(wire.machineId, "receipt.machineId"),
    keyFingerprint: bytes32(wire.keyFingerprint, "receipt.keyFingerprint"),
    submissionNonce: bytes32(wire.submissionNonce, "receipt.submissionNonce"),
    receiptNonce: decimal(wire.receiptNonce, "receipt.receiptNonce"),
    issuedAt: decimal(wire.issuedAt, "receipt.issuedAt"),
    expiry: decimal(wire.expiry, "receipt.expiry"),
  };
  const digest = bytes32(envelope.digest, "receipt.digest");
  const signer = address(envelope.signer, "receipt.signer");
  const signature = signature65(envelope.signature, "receipt.signature");
  if (policyBindingDigest(receiptBinding).toLowerCase() !== policyBindingDigest(binding).toLowerCase()
    || receipt.machineId.toLowerCase() !== machine.machineId.toLowerCase()
    || receipt.keyFingerprint.toLowerCase() !== machine.keyFingerprint.toLowerCase()
    || receipt.submissionNonce.toLowerCase() !== submissionNonce.toLowerCase()
    || receipt.receiptNonce !== binding.policyNonce || receipt.issuedAt !== issuedAt || receipt.expiry !== expiry
    || digest.toLowerCase() !== policyReceiptDigest(receipt).toLowerCase() || signer !== machine.signer) {
    throw new Error("LIVE_CUSTODY_INVALID");
  }
  return { receipt, digest, signer, signature };
}

function parseWireBinding(value: unknown): PolicyBindingV1 {
  const record = object(value, "policy binding");
  const machines = array(record.machineIds, "machineIds");
  const fingerprints = array(record.keyFingerprints, "keyFingerprints");
  if (machines.length !== 3 || fingerprints.length !== 3) throw new Error("LIVE_CUSTODY_INVALID");
  return {
    chainId: decimal(record.chainId, "chainId"), registry: address(record.registry, "registry"),
    vault: address(record.vault, "vault"), router: address(record.router, "router"), owner: address(record.owner, "owner"),
    policyId: bytes32(record.policyId, "policyId"), policyVersion: integer(record.policyVersion, "policyVersion"),
    policyCommitment: bytes32(record.policyCommitment, "policyCommitment"), schema: bytes32(record.schema, "schema"),
    extensionId: bytes32(record.extensionId, "extensionId"), codeVersion: bytes32(record.codeVersion, "codeVersion"),
    machineIds: machines.map((item) => bytes32(item, "machineId")) as [Hex, Hex, Hex],
    keyFingerprints: fingerprints.map((item) => bytes32(item, "keyFingerprint")) as [Hex, Hex, Hex],
    custodyThreshold: integer(record.custodyThreshold, "custodyThreshold"), resultThreshold: integer(record.resultThreshold, "resultThreshold"),
    policyNonce: decimal(record.policyNonce, "policyNonce"),
  };
}

function parseEvaluationResult(value: unknown, requestId: Hex): LiveEvaluationResult {
  const record = object(value, "evaluation result");
  const assertions = object(record.assertions, "evaluation assertions");
  const transactions = object(record.transactions, "evaluation transactions");
  const submit = array(transactions.submit, "evaluation submissions").map((item) => bytes32(item, "submission transaction"));
  if (record.schemaVersion !== 1 || record.mode !== LIVE_FCC_MODE
    || (record.status !== "threshold-submitted" && record.status !== "already-finalized")
    || bytes32(record.requestId, "requestId").toLowerCase() !== requestId.toLowerCase()
    || ![2, 3, 4].includes(Number(record.routerStatus)) || (record.decision !== "ALLOW" && record.decision !== "DENY")
    || typeof record.publicReasonClass !== "string" || assertions.requestReadFromCoston2 !== true
    || assertions.clientDecisionAccepted !== false || assertions.simulatedTee !== true
    || assertions.hardwareTeeVerified !== false || assertions.verifiedPayGuardRelease !== false) {
    throw new Error("LIVE_EVALUATION_INVALID");
  }
  return {
    status: record.status,
    requestId,
    routerStatus: Number(record.routerStatus) as 2 | 3 | 4,
    decision: record.decision,
    publicReasonClass: record.publicReasonClass,
    ...(record.instructionId === undefined ? {} : { instructionId: bytes32(record.instructionId, "instructionId") }),
    transactions: {
      ...(transactions.dispatch === undefined ? {} : { dispatch: bytes32(transactions.dispatch, "dispatch transaction") }),
      submit,
    },
  };
}

async function loadStoredRequest(requestId: Hex, config: LiveFccConfig): Promise<{ request: ActionRequestV1; status: number }> {
  const block = await publicClient.getBlock({ blockTag: "finalized" });
  if (!block.number) throw new Error("LIVE_FINALITY_UNAVAILABLE");
  const value = await publicClient.readContract({ address: config.contracts.router, abi: PayGuardActionRouterAbi, functionName: "getRequest", args: [requestId], blockNumber: block.number }) as unknown as Record<string, unknown> & readonly unknown[];
  const raw = tuple(value, "request", 0) as ActionRequestV1;
  return { request: normalizeRequest(raw), status: Number(tuple(value, "status", 1)) };
}

function liveBalanceCheckpoint(snapshot: Coston2AccountSnapshot, sequence: bigint): Hex {
  const accounting = snapshot.accounting;
  return keccak256(encodeAbiParameters([
    { type: "bytes32" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" },
    { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" },
  ], [BALANCE_DOMAIN, accounting.deposited, accounting.available, accounting.reserved, accounting.spent, accounting.withdrawn, accounting.refunded, sequence]));
}

async function signRawMessage(provider: Eip1193Provider, account: Address, digest: Hex): Promise<Hex> {
  const value = await provider.request({ method: "personal_sign", params: [digest, account] });
  return signature65(value, "owner authorization");
}

async function waitForFinalizedReceipt(hash: Hash): Promise<TransactionReceipt> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error("LIVE_TRANSACTION_REVERTED");
  for (let attempt = 0; attempt < FINALITY_ATTEMPTS; attempt += 1) {
    const block = await publicClient.getBlock({ blockTag: "finalized" });
    if (block.number !== null && block.number >= receipt.blockNumber) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("LIVE_FINALITY_UNAVAILABLE");
}

function requireEvent(receipt: TransactionReceipt, contract: Address, abi: readonly unknown[], eventName: string, indexed: Hex): void {
  const matched = receipt.logs.some((log) => {
    if (getAddress(log.address) !== contract) return false;
    try {
      const decoded = decodeEventLog({ abi, eventName, data: log.data, topics: log.topics });
      return Object.values((decoded.args ?? {}) as Record<string, unknown>).some((item) => typeof item === "string" && item.toLowerCase() === indexed.toLowerCase());
    } catch { return false; }
  });
  if (!matched) throw new Error("LIVE_EVENT_MISMATCH");
}

function normalizeRequest(value: ActionRequestV1): ActionRequestV1 {
  return {
    ...value,
    chainId: BigInt(value.chainId), policyVersion: Number(value.policyVersion), requestNonce: BigInt(value.requestNonce), attempt: Number(value.attempt),
    amount: BigInt(value.amount), scheduleSlot: BigInt(value.scheduleSlot), occurrence: Number(value.occurrence), createdAt: BigInt(value.createdAt),
    graceDeadline: BigInt(value.graceDeadline), expiry: BigInt(value.expiry), registry: getAddress(value.registry), vault: getAddress(value.vault),
    router: getAddress(value.router), requester: getAddress(value.requester), target: getAddress(value.target), asset: getAddress(value.asset),
  };
}

function spendRecord(value: unknown): { checkpoint: Hex; occurrence: number; initialized: boolean } {
  const record = value as Record<string, unknown> & readonly unknown[];
  return {
    checkpoint: bytes32(tuple(record, "checkpoint", 0), "spend checkpoint"),
    occurrence: Number(tuple(record, "occurrence", 1)),
    initialized: Boolean(tuple(record, "initialized", 3)),
  };
}

function normalizeRelayOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("LIVE_RELAY_ORIGIN_INVALID");
  }
  return url.origin;
}

async function boundedResponse(response: Response): Promise<string> {
  const text = await response.text();
  if (!text || new TextEncoder().encode(text).length > MAX_RESPONSE_BYTES) throw new Error("LIVE_RESPONSE_INVALID");
  return text;
}

function stringifyWire(value: unknown): string {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString(10) : item);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function randomBytes32(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const value = `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}` as Hex;
  return value === ZERO_BYTES32 ? keccak256(value) : value;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function array(value: unknown, label: string): unknown[] { if (!Array.isArray(value)) throw new Error(`${label} must be an array`); return value; }
function address(value: unknown, label: string): Address { if (typeof value !== "string" || !isAddress(value)) throw new Error(`${label} is invalid`); return getAddress(value); }
function bytes32(value: unknown, label: string): Hex { if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} is invalid`); return value.toLowerCase() as Hex; }
function signature65(value: unknown, label: string): Hex { if (typeof value !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(value)) throw new Error(`${label} is invalid`); return value as Hex; }
function decimal(value: unknown, label: string): bigint { if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${label} is invalid`); return BigInt(value); }
function integer(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is invalid`); return value; }
function tuple(value: Record<string, unknown> & readonly unknown[], key: string, index: number): unknown { return value[key] ?? value[index]; }
