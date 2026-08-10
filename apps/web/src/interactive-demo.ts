import {
  PayGuardActionRouterAbi,
  PayGuardPolicyRegistryAbi,
  PayGuardVaultAbi,
} from "@xrp-payguard/bindings";
import {
  INTERACTIVE_DEMO_MODE,
  demoBalanceCheckpointV1,
  demoPolicyBindingV1,
  parseDemoConfig,
  parseDemoCustodyEnvelope,
  parseDemoEvaluationEnvelope,
  stringifyDemoWire,
  type DemoAccounting,
  type DemoCustodyEnvelope,
  type DemoDomainConfig,
  type DemoEvaluationEnvelope,
  type DemoIngressAuthorization,
} from "@xrp-payguard/demo";
import {
  ACTION_FTESTXRP_TRANSFER,
  ZERO_BYTES32,
  actionRequestHash,
  encryptPrivatePolicyForTeeV1,
  evaluationAttestationDigest,
  evaluationDigest,
  genesisSpendCheckpoint,
  policyBindingDigest,
  policyIngressAuthorizationDigest,
  policyInputCommitmentV1,
  policyReceiptAttestationDigest,
  policyReceiptDigest,
  publicReasonCode,
  type ActionRequestV1,
  type PolicyBindingV1,
  type PolicyV1,
} from "@xrp-payguard/protocol";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  erc20Abi,
  getAddress,
  hexToBigInt,
  http,
  isHex,
  keccak256,
  recoverMessageAddress,
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { COSTON2_CHAIN, type Eip1193Provider } from "./coston2.js";

const MAX_RESPONSE_BYTES = 192 * 1024;
const AUTHORIZATION_SECONDS = 3_000n;
const REQUEST_LIFETIME_SECONDS = 900n;
const FINALITY_ATTEMPTS = 45;

const publicClient = createPublicClient({
  chain: COSTON2_CHAIN,
  transport: http(COSTON2_CHAIN.rpcUrls.default.http[0], { retryCount: 2, timeout: 15_000 }),
});

export type DemoVaultAction = "APPROVE" | "DEPOSIT";
export type DemoPolicyAction = "STOP" | "RESUME" | "REVOKE";

export interface DemoPolicySession {
  policy: PolicyV1;
  binding: PolicyBindingV1;
  ciphertexts: readonly [Hex, Hex, Hex];
  authorizations: readonly [DemoIngressAuthorization, DemoIngressAuthorization, DemoIngressAuthorization];
  custody: readonly [DemoCustodyEnvelope, DemoCustodyEnvelope, DemoCustodyEnvelope];
}

export interface DemoAccountSnapshot {
  account: Address;
  finalizedBlock: bigint;
  finalizedAt: bigint;
  tokenBalance: bigint;
  allowance: bigint;
  accounting: DemoAccounting;
  policyStatus?: 1 | 2 | 3;
}

export interface DemoTransactionResult {
  hash: Hash;
  blockNumber: bigint;
}

export interface DemoRequestResult extends DemoTransactionResult {
  request: ActionRequestV1;
}

export interface DemoThresholdResult {
  status: "THRESHOLD_READY" | "SPLIT" | "UNAVAILABLE";
  matching: DemoEvaluationEnvelope[];
  valid: DemoEvaluationEnvelope[];
  digest?: Hex;
}

export async function fetchInteractiveDemoConfig(fetcher: typeof fetch = fetch): Promise<DemoDomainConfig> {
  const response = await fetcher("/api/demo/config", { method: "GET", cache: "no-store", headers: { Accept: "application/json" } });
  const text = await boundedResponse(response);
  if (!response.ok) throw new Error("INTERACTIVE_DEMO_UNAVAILABLE");
  return parseDemoConfig(JSON.parse(text));
}

export async function collectDemoCustody(
  policy: PolicyV1,
  account: Address,
  provider: Eip1193Provider,
  config: DemoDomainConfig,
  fetcher: typeof fetch = fetch,
  now: bigint = BigInt(Math.floor(Date.now() / 1000)),
): Promise<DemoPolicySession> {
  if (getAddress(policy.owner) !== getAddress(account)) throw new Error("DEMO_OWNER_MISMATCH");
  const binding = demoPolicyBindingV1(policy, config);
  const ciphertexts = await Promise.all(config.actors.map((actor) => encryptPrivatePolicyForTeeV1(policy, actor.publicKey))) as [Hex, Hex, Hex];
  const expiry = now + AUTHORIZATION_SECONDS;
  const authorizations: DemoIngressAuthorization[] = [];
  const custody: DemoCustodyEnvelope[] = [];
  for (let index = 0; index < 3; index += 1) {
    const actor = config.actors[index]!;
    const ciphertext = ciphertexts[index]!;
    const digest = policyIngressAuthorizationDigest({
      binding,
      submissionNonce: policy.submissionNonce,
      issuedAt: now,
      expiry,
      ciphertextHash: keccak256(ciphertext),
      machineId: actor.machineId,
      keyFingerprint: actor.keyFingerprint,
    });
    const signature = await signRawMessage(provider, account, digest);
    const authorization = { issuedAt: now, expiry, signature };
    const response = await fetcher(actor.endpoint, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: stringifyDemoWire({ operation: "CUSTODY", ciphertext, authorization }),
    });
    const text = await boundedResponse(response);
    if (!response.ok) throw new Error("DEMO_CUSTODY_UNAVAILABLE");
    authorizations.push(authorization);
    custody.push(parseDemoCustodyEnvelope(JSON.parse(text)));
  }
  const session = {
    policy,
    binding,
    ciphertexts,
    authorizations: authorizations as [DemoIngressAuthorization, DemoIngressAuthorization, DemoIngressAuthorization],
    custody: custody as [DemoCustodyEnvelope, DemoCustodyEnvelope, DemoCustodyEnvelope],
  };
  await verifyDemoCustody(session, config);
  return session;
}

export async function verifyDemoCustody(session: DemoPolicySession, config: DemoDomainConfig): Promise<void> {
  const expectedBinding = policyBindingDigest(session.binding).toLowerCase();
  const machines = new Set<string>();
  for (let index = 0; index < 3; index += 1) {
    const envelope = session.custody[index]!;
    const actor = config.actors[index]!;
    if (envelope.mode !== INTERACTIVE_DEMO_MODE || envelope.actor !== actor.actor
      || policyBindingDigest(envelope.binding).toLowerCase() !== expectedBinding
      || policyBindingDigest(envelope.receipt.binding).toLowerCase() !== expectedBinding
      || envelope.receipt.machineId.toLowerCase() !== actor.machineId.toLowerCase()
      || envelope.receipt.keyFingerprint.toLowerCase() !== actor.keyFingerprint.toLowerCase()
      || envelope.receipt.submissionNonce.toLowerCase() !== session.policy.submissionNonce.toLowerCase()
      || envelope.receipt.receiptNonce !== session.binding.policyNonce
      || policyReceiptDigest(envelope.receipt).toLowerCase() !== envelope.digest.toLowerCase()
      || envelope.assertions.hardwareTeeVerified !== false
      || envelope.assertions.productionFccReleaseVerified !== false) {
      throw new Error("DEMO_CUSTODY_INVALID");
    }
    const signer = await recoverMessageAddress({ message: { raw: policyReceiptAttestationDigest(envelope.receipt) }, signature: envelope.signature });
    if (getAddress(signer) !== getAddress(actor.signer) || getAddress(envelope.signer) !== getAddress(actor.signer)
      || machines.has(actor.machineId.toLowerCase())) throw new Error("DEMO_CUSTODY_INVALID");
    machines.add(actor.machineId.toLowerCase());
  }
  if (machines.size !== 3) throw new Error("DEMO_CUSTODY_INVALID");
}

export async function registerDemoPolicy(
  session: DemoPolicySession,
  account: Address,
  provider: Eip1193Provider,
  config: DemoDomainConfig,
): Promise<DemoTransactionResult> {
  await verifyDemoCustody(session, config);
  const receipts = session.custody.map((envelope) => ({
    machineId: envelope.receipt.machineId,
    keyFingerprint: envelope.receipt.keyFingerprint,
    submissionNonce: envelope.receipt.submissionNonce,
    receiptNonce: envelope.receipt.receiptNonce,
    issuedAt: envelope.receipt.issuedAt,
    expiry: envelope.receipt.expiry,
    signature: envelope.signature,
  })) as unknown as readonly [
    { machineId: Hex; keyFingerprint: Hex; submissionNonce: Hex; receiptNonce: bigint; issuedAt: bigint; expiry: bigint; signature: Hex },
    { machineId: Hex; keyFingerprint: Hex; submissionNonce: Hex; receiptNonce: bigint; issuedAt: bigint; expiry: bigint; signature: Hex },
    { machineId: Hex; keyFingerprint: Hex; submissionNonce: Hex; receiptNonce: bigint; issuedAt: bigint; expiry: bigint; signature: Hex },
  ];
  const wallet = createWalletClient({ account, chain: COSTON2_CHAIN, transport: custom(provider) });
  const { request } = await publicClient.simulateContract({
    account,
    address: getAddress(config.registry),
    abi: PayGuardPolicyRegistryAbi,
    functionName: "registerPolicy",
    args: [session.binding, receipts],
  });
  const hash = await wallet.writeContract(request);
  const receipt = await waitForFinalizedReceipt(hash);
  requireEvent(receipt, getAddress(config.registry), PayGuardPolicyRegistryAbi, "PolicyRegistered", session.binding.policyCommitment);
  const status = await publicClient.readContract({ address: getAddress(config.registry), abi: PayGuardPolicyRegistryAbi, functionName: "policyStatus", args: [session.binding.policyCommitment], blockNumber: await finalizedNumber() });
  if (Number(status) !== 1) throw new Error("DEMO_POLICY_POSTCONDITION_FAILED");
  return { hash, blockNumber: receipt.blockNumber };
}

export async function loadDemoAccount(account: Address, config: DemoDomainConfig, policyCommitment?: Hex): Promise<DemoAccountSnapshot> {
  const block = await publicClient.getBlock({ blockTag: "finalized" });
  if (!block.number || block.number <= 0n) throw new Error("DEMO_FINALIZED_BLOCK_UNAVAILABLE");
  const blockNumber = block.number;
  const [registryCode, vaultCode, routerCode, routerRegistry, routerVault, vaultRouter, supported, tokenBalance, allowance, accountingRaw] = await Promise.all([
    publicClient.getCode({ address: getAddress(config.registry), blockNumber }),
    publicClient.getCode({ address: getAddress(config.vault), blockNumber }),
    publicClient.getCode({ address: getAddress(config.router), blockNumber }),
    publicClient.readContract({ address: getAddress(config.router), abi: PayGuardActionRouterAbi, functionName: "registry", blockNumber }),
    publicClient.readContract({ address: getAddress(config.router), abi: PayGuardActionRouterAbi, functionName: "vault", blockNumber }),
    publicClient.readContract({ address: getAddress(config.vault), abi: PayGuardVaultAbi, functionName: "router", blockNumber }),
    publicClient.readContract({ address: getAddress(config.vault), abi: PayGuardVaultAbi, functionName: "supportedAsset", args: [getAddress(config.asset)], blockNumber }),
    publicClient.readContract({ address: getAddress(config.asset), abi: erc20Abi, functionName: "balanceOf", args: [account], blockNumber }),
    publicClient.readContract({ address: getAddress(config.asset), abi: erc20Abi, functionName: "allowance", args: [account, getAddress(config.vault)], blockNumber }),
    publicClient.readContract({ address: getAddress(config.vault), abi: PayGuardVaultAbi, functionName: "accounting", args: [account, getAddress(config.asset)], blockNumber }),
  ]);
  if ([registryCode, vaultCode, routerCode].some((code) => !code || code === "0x")
    || getAddress(routerRegistry) !== getAddress(config.registry) || getAddress(routerVault) !== getAddress(config.vault)
    || getAddress(vaultRouter) !== getAddress(config.router) || supported !== true) throw new Error("DEMO_CONTRACT_DOMAIN_INVALID");
  const accounting = accountingRecord(accountingRaw);
  assertConservation(accounting);
  let policyStatus: 1 | 2 | 3 | undefined;
  if (policyCommitment) {
    const value = Number(await publicClient.readContract({ address: getAddress(config.registry), abi: PayGuardPolicyRegistryAbi, functionName: "policyStatus", args: [policyCommitment], blockNumber }));
    if (value !== 1 && value !== 2 && value !== 3) throw new Error("DEMO_POLICY_STATUS_INVALID");
    policyStatus = value;
  }
  return {
    account,
    finalizedBlock: blockNumber,
    finalizedAt: block.timestamp,
    tokenBalance: BigInt(tokenBalance),
    allowance: BigInt(allowance),
    accounting,
    ...(policyStatus ? { policyStatus } : {}),
  };
}

export async function executeDemoVaultAction(
  kind: DemoVaultAction,
  amount: bigint,
  account: Address,
  provider: Eip1193Provider,
  config: DemoDomainConfig,
): Promise<DemoTransactionResult> {
  if (amount <= 0n) throw new Error("DEMO_AMOUNT_INVALID");
  const before = await loadDemoAccount(account, config);
  if (amount > before.tokenBalance || (kind === "DEPOSIT" && amount > before.allowance)) throw new Error("DEMO_VAULT_PREFLIGHT_FAILED");
  const wallet = createWalletClient({ account, chain: COSTON2_CHAIN, transport: custom(provider) });
  let hash: Hash;
  if (kind === "APPROVE") {
    const simulation = await publicClient.simulateContract({ account, address: getAddress(config.asset), abi: erc20Abi, functionName: "approve", args: [getAddress(config.vault), amount] });
    hash = await wallet.writeContract(simulation.request);
  } else {
    const simulation = await publicClient.simulateContract({ account, address: getAddress(config.vault), abi: PayGuardVaultAbi, functionName: "deposit", args: [getAddress(config.asset), amount, account] });
    hash = await wallet.writeContract(simulation.request);
  }
  const receipt = await waitForFinalizedReceipt(hash);
  requireEvent(receipt, kind === "APPROVE" ? getAddress(config.asset) : getAddress(config.vault), kind === "APPROVE" ? erc20Abi : PayGuardVaultAbi, kind === "APPROVE" ? "Approval" : "Deposited");
  const after = await loadDemoAccount(account, config);
  if (kind === "APPROVE") {
    if (after.allowance !== amount || after.tokenBalance !== before.tokenBalance || !sameAccounting(before.accounting, after.accounting)) throw new Error("DEMO_VAULT_POSTCONDITION_FAILED");
  } else if (after.tokenBalance !== before.tokenBalance - amount
    || !sameAccounting(after.accounting, {
      ...before.accounting,
      deposited: before.accounting.deposited + amount,
      available: before.accounting.available + amount,
    })) throw new Error("DEMO_VAULT_POSTCONDITION_FAILED");
  return { hash, blockNumber: receipt.blockNumber };
}

export async function createDemoRequest(
  session: DemoPolicySession,
  amount: bigint,
  account: Address,
  provider: Eip1193Provider,
  config: DemoDomainConfig,
): Promise<DemoRequestResult> {
  if (amount <= 0n || getAddress(account) !== getAddress(session.binding.owner)) throw new Error("DEMO_REQUEST_PREFLIGHT_FAILED");
  const snapshot = await loadDemoAccount(account, config, session.binding.policyCommitment);
  if (snapshot.policyStatus !== 1) throw new Error("DEMO_POLICY_NOT_ACTIVE");
  const spendRaw = await publicClient.readContract({ address: getAddress(config.router), abi: PayGuardActionRouterAbi, functionName: "spendState", args: [session.binding.policyCommitment], blockNumber: snapshot.finalizedBlock });
  const spend = spendRecord(spendRaw);
  const occurrence = spend.initialized ? spend.occurrence + 1 : 1;
  const requestId = randomBytes32();
  const requestNonceHash = randomBytes32();
  const requestNonce = hexToBigInt(requestNonceHash) || 1n;
  const createdAt = snapshot.finalizedAt;
  const expiry = createdAt + REQUEST_LIFETIME_SECONDS;
  const request: ActionRequestV1 = {
    chainId: 114n,
    registry: config.registry,
    vault: config.vault,
    router: config.router,
    policyId: session.binding.policyId,
    policyVersion: session.binding.policyVersion,
    policyCommitment: session.binding.policyCommitment,
    requestId,
    requestNonce,
    attempt: 1,
    requester: account,
    target: session.policy.allowTargets[0]!,
    asset: config.asset,
    actionType: ACTION_FTESTXRP_TRANSFER,
    amount,
    scheduleSlot: 0n,
    occurrence,
    spendCheckpoint: spend.initialized ? spend.checkpoint : genesisSpendCheckpoint(session.binding.policyCommitment),
    balanceCheckpoint: demoBalanceCheckpointV1(account, config.asset, snapshot.accounting),
    inputCommitment: policyInputCommitmentV1(undefined, undefined),
    createdAt,
    graceDeadline: expiry,
    expiry,
  };
  const wallet = createWalletClient({ account, chain: COSTON2_CHAIN, transport: custom(provider) });
  const { request: transaction } = await publicClient.simulateContract({ account, address: getAddress(config.router), abi: PayGuardActionRouterAbi, functionName: "createRequest", args: [request] });
  const hash = await wallet.writeContract(transaction);
  const receipt = await waitForFinalizedReceipt(hash);
  requireEvent(receipt, getAddress(config.router), PayGuardActionRouterAbi, "RequestCreated", requestId);
  const stored = await loadStoredRequest(requestId, config);
  if (stored.status !== 1 || actionRequestHash(stored.request).toLowerCase() !== actionRequestHash(request).toLowerCase()) throw new Error("DEMO_REQUEST_POSTCONDITION_FAILED");
  return { request, hash, blockNumber: receipt.blockNumber };
}

export async function collectDemoEvaluations(
  session: DemoPolicySession,
  request: ActionRequestV1,
  config: DemoDomainConfig,
  fetcher: typeof fetch = fetch,
): Promise<DemoThresholdResult> {
  const requestId = request.requestId;
  const expectedRequestHash = actionRequestHash(request).toLowerCase();
  const valid: DemoEvaluationEnvelope[] = [];
  for (let index = 0; index < 3; index += 1) {
    const actor = config.actors[index]!;
    const response = await fetcher(actor.endpoint, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: stringifyDemoWire({ operation: "EVALUATE", ciphertext: session.ciphertexts[index], authorization: session.authorizations[index], requestId }),
    });
    const text = await boundedResponse(response);
    if (!response.ok) continue;
    try {
      const envelope = parseDemoEvaluationEnvelope(JSON.parse(text));
      if (envelope.actor !== actor.actor || envelope.result.request.requestId.toLowerCase() !== requestId.toLowerCase()
        || actionRequestHash(envelope.result.request).toLowerCase() !== expectedRequestHash
        || envelope.result.request.policyCommitment.toLowerCase() !== session.binding.policyCommitment.toLowerCase()
        || envelope.result.machineId.toLowerCase() !== actor.machineId.toLowerCase()
        || envelope.result.keyFingerprint.toLowerCase() !== actor.keyFingerprint.toLowerCase()
        || evaluationDigest(envelope.result).toLowerCase() !== envelope.digest.toLowerCase()
        || getAddress(envelope.signer) !== getAddress(actor.signer)
        || envelope.assertions.hardwareTeeVerified !== false) continue;
      const recovered = await recoverMessageAddress({ message: { raw: evaluationAttestationDigest(envelope.result) }, signature: envelope.signature });
      if (getAddress(recovered) !== getAddress(actor.signer)) continue;
      valid.push(envelope);
    } catch { /* malformed actor response is unavailable, never success */ }
  }
  return selectDemoThreshold(valid);
}

export function selectDemoThreshold(valid: DemoEvaluationEnvelope[]): DemoThresholdResult {
  const distinct = new Map<string, DemoEvaluationEnvelope>();
  for (const envelope of valid) distinct.set(envelope.result.machineId.toLowerCase(), envelope);
  const unique = [...distinct.values()];
  const groups = new Map<string, DemoEvaluationEnvelope[]>();
  for (const envelope of unique) {
    const group = groups.get(envelope.digest.toLowerCase()) ?? [];
    group.push(envelope);
    groups.set(envelope.digest.toLowerCase(), group);
  }
  for (const [digest, matching] of groups) if (matching.length >= 2) return { status: "THRESHOLD_READY", matching, valid: unique, digest: digest as Hex };
  return { status: unique.length < 2 ? "UNAVAILABLE" : "SPLIT", matching: [], valid: unique };
}

export async function submitDemoThreshold(
  outcome: DemoThresholdResult,
  account: Address,
  provider: Eip1193Provider,
  config: DemoDomainConfig,
): Promise<DemoTransactionResult[]> {
  if (outcome.status !== "THRESHOLD_READY" || outcome.matching.length < 2) throw new Error("DEMO_THRESHOLD_UNAVAILABLE");
  const wallet = createWalletClient({ account, chain: COSTON2_CHAIN, transport: custom(provider) });
  const transactions: DemoTransactionResult[] = [];
  for (const envelope of outcome.matching.slice(0, 2)) {
    const contractResult = {
      ...envelope.result,
      decision: envelope.result.decision === "ALLOW" ? 1 : 0,
      publicReasonClass: publicReasonCode(envelope.result.publicReasonClass),
    };
    const simulation = await publicClient.simulateContract({ account, address: getAddress(config.router), abi: PayGuardActionRouterAbi, functionName: "submitEvaluation", args: [contractResult, envelope.signature] });
    const hash = await wallet.writeContract(simulation.request);
    const receipt = await waitForFinalizedReceipt(hash);
    requireEvent(receipt, getAddress(config.router), PayGuardActionRouterAbi, "EvaluationAccepted", envelope.result.request.requestId);
    transactions.push({ hash, blockNumber: receipt.blockNumber });
  }
  const stored = await loadStoredRequest(outcome.matching[0]!.result.request.requestId, config);
  const expected = outcome.matching[0]!.result.decision === "ALLOW" ? 2 : 3;
  if (stored.status !== expected || stored.matchingCount < 2) throw new Error("DEMO_THRESHOLD_POSTCONDITION_FAILED");
  return transactions;
}

export async function executeDemoRequest(requestId: Hex, account: Address, provider: Eip1193Provider, config: DemoDomainConfig): Promise<DemoTransactionResult> {
  const before = await loadStoredRequest(requestId, config);
  if (before.status !== 2) throw new Error("DEMO_REQUEST_NOT_ALLOWED");
  const wallet = createWalletClient({ account, chain: COSTON2_CHAIN, transport: custom(provider) });
  const simulation = await publicClient.simulateContract({ account, address: getAddress(config.router), abi: PayGuardActionRouterAbi, functionName: "execute", args: [requestId] });
  const hash = await wallet.writeContract(simulation.request);
  const receipt = await waitForFinalizedReceipt(hash);
  requireEvent(receipt, getAddress(config.router), PayGuardActionRouterAbi, "RequestExecuted", requestId);
  if ((await loadStoredRequest(requestId, config)).status !== 4) throw new Error("DEMO_EXECUTION_POSTCONDITION_FAILED");
  return { hash, blockNumber: receipt.blockNumber };
}

export async function governDemoPolicy(action: DemoPolicyAction, commitment: Hex, account: Address, provider: Eip1193Provider, config: DemoDomainConfig): Promise<DemoTransactionResult> {
  const expected = action === "STOP" ? 2 : action === "RESUME" ? 1 : 3;
  const functionName = action === "STOP" ? "stopPolicy" : action === "RESUME" ? "resumePolicy" : "revokePolicy";
  const wallet = createWalletClient({ account, chain: COSTON2_CHAIN, transport: custom(provider) });
  const simulation = await publicClient.simulateContract({ account, address: getAddress(config.registry), abi: PayGuardPolicyRegistryAbi, functionName, args: [commitment] });
  const hash = await wallet.writeContract(simulation.request);
  const receipt = await waitForFinalizedReceipt(hash);
  requireEvent(receipt, getAddress(config.registry), PayGuardPolicyRegistryAbi,
    action === "STOP" ? "PolicyStopped" : action === "RESUME" ? "PolicyResumed" : "PolicyRevoked", commitment);
  const status = Number(await publicClient.readContract({ address: getAddress(config.registry), abi: PayGuardPolicyRegistryAbi, functionName: "policyStatus", args: [commitment], blockNumber: await finalizedNumber() }));
  if (status !== expected) throw new Error("DEMO_GOVERNANCE_POSTCONDITION_FAILED");
  return { hash, blockNumber: receipt.blockNumber };
}

export async function loadDemoRequestStatus(requestId: Hex, config: DemoDomainConfig): Promise<{ status: number; matchingCount: number; approvedDigest: Hex }> {
  const stored = await loadStoredRequest(requestId, config);
  return { status: stored.status, matchingCount: stored.matchingCount, approvedDigest: stored.approvedDigest };
}

async function loadStoredRequest(requestId: Hex, config: DemoDomainConfig): Promise<{ request: ActionRequestV1; status: number; matchingCount: number; approvedDigest: Hex }> {
  const blockNumber = await finalizedNumber();
  const value = await publicClient.readContract({ address: getAddress(config.router), abi: PayGuardActionRouterAbi, functionName: "getRequest", args: [requestId], blockNumber }) as unknown as Record<string, unknown> & readonly unknown[];
  const request = tuple(value, "request", 0) as ActionRequestV1;
  return {
    request: normalizeRequest(request),
    status: Number(tuple(value, "status", 1)),
    approvedDigest: tuple(value, "approvedDigest", 3) as Hex,
    matchingCount: Number(tuple(value, "matchingCount", 4)),
  };
}

async function signRawMessage(provider: Eip1193Provider, account: Address, digest: Hex): Promise<Hex> {
  const value = await provider.request({ method: "personal_sign", params: [digest, account] });
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(value)) throw new Error("DEMO_OWNER_SIGNATURE_INVALID");
  return value as Hex;
}

async function boundedResponse(response: Response): Promise<string> {
  const text = await response.text();
  if (new TextEncoder().encode(text).length > MAX_RESPONSE_BYTES) throw new Error("DEMO_RESPONSE_TOO_LARGE");
  return text;
}

async function waitForFinalizedReceipt(hash: Hash): Promise<TransactionReceipt> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error("DEMO_TRANSACTION_REVERTED");
  for (let attempt = 0; attempt < FINALITY_ATTEMPTS; attempt += 1) {
    const finalized = await publicClient.getBlock({ blockTag: "finalized" });
    if (finalized.number !== null && finalized.number >= receipt.blockNumber) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("DEMO_FINALITY_UNAVAILABLE");
}

async function finalizedNumber(): Promise<bigint> {
  const block = await publicClient.getBlock({ blockTag: "finalized" });
  if (!block.number || block.number <= 0n) throw new Error("DEMO_FINALIZED_BLOCK_UNAVAILABLE");
  return block.number;
}

function requireEvent(receipt: TransactionReceipt, contract: Address, abi: readonly unknown[], eventName: string, indexed?: Hex): void {
  const matched = receipt.logs.some((log) => {
    if (getAddress(log.address) !== contract) return false;
    try {
      const decoded = decodeEventLog({ abi, eventName, data: log.data, topics: log.topics });
      if (!indexed) return true;
      return Object.values((decoded.args ?? {}) as Record<string, unknown>).some((value) => typeof value === "string" && value.toLowerCase() === indexed.toLowerCase());
    } catch { return false; }
  });
  if (!matched) throw new Error("DEMO_EVENT_MISMATCH");
}

function accountingRecord(value: unknown): DemoAccounting {
  const record = value as Record<string, unknown> & readonly unknown[];
  return {
    deposited: BigInt(tuple(record, "deposited", 0) as bigint),
    available: BigInt(tuple(record, "available", 1) as bigint),
    reserved: BigInt(tuple(record, "reserved", 2) as bigint),
    spent: BigInt(tuple(record, "spent", 3) as bigint),
    withdrawn: BigInt(tuple(record, "withdrawn", 4) as bigint),
    refunded: BigInt(tuple(record, "refunded", 5) as bigint),
  };
}

function spendRecord(value: unknown): { checkpoint: Hex; occurrence: number; accountedAt: bigint; initialized: boolean } {
  const record = value as Record<string, unknown> & readonly unknown[];
  return {
    checkpoint: tuple(record, "checkpoint", 0) as Hex,
    occurrence: Number(tuple(record, "occurrence", 1)),
    accountedAt: BigInt(tuple(record, "accountedAt", 2) as bigint),
    initialized: Boolean(tuple(record, "initialized", 3)),
  };
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

function tuple(value: Record<string, unknown> & readonly unknown[], key: string, index: number): unknown {
  return value[key] ?? value[index];
}

function assertConservation(accounting: DemoAccounting): void {
  if (accounting.deposited !== accounting.available + accounting.reserved + accounting.spent + accounting.withdrawn + accounting.refunded) {
    throw new Error("DEMO_VAULT_CONSERVATION_INVALID");
  }
}
function sameAccounting(left: DemoAccounting, right: DemoAccounting): boolean { return Object.keys(left).every((key) => left[key as keyof DemoAccounting] === right[key as keyof DemoAccounting]); }
function randomBytes32(): Hex { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); const value = `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}` as Hex; return value === ZERO_BYTES32 ? keccak256(value) : value; }
