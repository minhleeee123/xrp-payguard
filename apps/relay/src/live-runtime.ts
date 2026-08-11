import { timingSafeEqual } from "node:crypto";
import {
  PayGuardActionRouterAbi,
  PayGuardFccDispatcherAbi,
  PayGuardPolicyRegistryAbi,
  PayGuardVaultAbi,
} from "@xrp-payguard/bindings";
import {
  CHAIN_ID,
  POLICY_SCHEMA_V1,
  ZERO_BYTES32,
  actionRequestHash,
  evaluationAttestationDigest,
  evaluationDigest,
  genesisSpendCheckpoint,
  policyIngressAuthorizationDigest,
  policyReceiptAttestationDigest,
  policyReceiptDigest,
  publicReasonCode,
  teeMachineDescriptorV1,
  type ActionRequestV1,
  type EvaluationResultV1,
  type Hex,
  type PolicyBindingV1,
  type PolicyReceiptV1,
  type PublicReasonClass,
  type SpendHistoryEntryV1,
  type SpendStateV1,
  type TeePublicKeyV1,
} from "@xrp-payguard/protocol";
import {
  concatHex,
  createPublicClient,
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
  padHex,
  parseAbi,
  recoverMessageAddress,
  stringToHex,
  toHex,
  zeroAddress,
  type Address,
  type Hash,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { LIVE_FCC_MODE, type LiveEvaluationAuthorization, type LiveEvaluationResponse, type LiveFccConfig, type LiveMachineConfig, type LiveRelayRuntime } from "./live-types.js";

const CHAIN = {
  id: 114,
  name: "Flare Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;
const REGISTRY = getAddress("0x8DFb2D7D7a2608Ee7Cd78983fbe28cCE00e1D4A4");
const VAULT = getAddress("0xFFe7522075412B2eBA5b8B91c9aA4E1c2c6f84dB");
const ROUTER = getAddress("0x28A969018975Fb40aEd0BfA98f6d1c3023B6a7Da");
const DISPATCHER = getAddress("0x18Ea713cEf10ECf5cAC23c08dD25Ac17D2f07e3d");
const MANAGER = getAddress("0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE");
const ASSET = getAddress("0x0b6A3645c240605887a5532109323A3E12273dc7");
const EXTENSION_ID = 66037n;
const EXTENSION_ID_BYTES = padHex(toHex(EXTENSION_ID), { size: 32 });
const DEPLOYMENT_BLOCK = 33792913n;
const ORIGINS = [
  "https://payguard-fcc-a-production.up.railway.app",
  "https://payguard-fcc-b-production.up.railway.app",
  "https://payguard-fcc-d-production.up.railway.app",
] as const;
const SIMULATED_PLATFORM = padHex(stringToHex("TEST_PLATFORM"), { size: 32, dir: "right" });
const OP_TYPE = stringToHex("PAYGUARD", { size: 32 });
const OP_COMMAND = stringToHex("EVALUATE_V1", { size: 32 });
const TEE_RESULT_PREFIX = stringToHex("TEE_ACTION_RESULT", { size: 32 });
const PROXY_RESULT_PREFIX = stringToHex("PROXY_ACTION_RESULT", { size: 32 });
const BALANCE_DOMAIN = keccak256(stringToHex("PAYGUARD_BALANCE_CHECKPOINT_V1"));
const RELAY_AUTH_PREFIX = padHex(stringToHex("PAYGUARD_RELAY_AUTH_V1"), { size: 32, dir: "right" });
const MAX_UINT64 = (1n << 64n) - 1n;
const REASONS: readonly PublicReasonClass[] = [
  "OK", "POLICY_DENIED", "MALFORMED", "WRONG_DOMAIN", "STALE_INPUT",
  "DEPENDENCY_UNAVAILABLE", "EXPIRED", "STOPPED", "INSUFFICIENT_BALANCE",
  "CAP_EXCEEDED", "OCCURRENCE_EXCEEDED", "TARGET_DENIED", "REQUESTER_DENIED",
  "ACTION_DENIED", "FTSO_INVALID", "COOLDOWN", "FDC_INVALID",
];
const REQUEST_FIELDS = [
  "chainId", "registry", "vault", "router", "policyId", "policyVersion",
  "policyCommitment", "requestId", "requestNonce", "attempt", "requester",
  "target", "asset", "actionType", "amount", "scheduleSlot", "occurrence",
  "spendCheckpoint", "balanceCheckpoint", "inputCommitment", "createdAt",
  "graceDeadline", "expiry",
] as const;

const managerAbi = parseAbi([
  "function getTeeMachine(address teeId) view returns ((address teeId,address teeProxyId,string url) machine)",
  "function getTeeMachineWithAttestationData(address teeId) view returns ((address teeId,address initialTeeId,string url,bytes32 codeHash,bytes32 platform) attestation)",
  "function getTeeMachineStatus(address teeId) view returns (uint8 status)",
  "function getExtensionId(address teeId) view returns (uint256 extensionId)",
  "function isCodeHashPlatformSupported(uint256 extensionId,bytes32 codeHash,bytes32 platform) view returns (bool supported)",
  "function isCodeHashPlatformDisabled(uint256 extensionId,bytes32 codeHash,bytes32 platform) view returns (bool disabled)",
]);
const dispatcherReadAbi = parseAbi([
  "function owner() view returns (address)",
  "function getExtensionId() view returns (uint256)",
]);

interface RuntimeOptions {
  rpcUrl: string;
  executorPrivateKey: Hex;
  fetcher?: typeof fetch;
  explorerApiUrl?: string;
}

interface Accounting {
  deposited: bigint;
  available: bigint;
  reserved: bigint;
  spent: bigint;
  withdrawn: bigint;
  refunded: bigint;
}

interface EvaluationEnvelope {
  result: EvaluationResultV1;
  digest: Hex;
  signer: Address;
  signature: Hex;
}

export class Coston2LiveRelayRuntime implements LiveRelayRuntime {
  private readonly client: PublicClient;
  private readonly wallet: ReturnType<typeof createWalletClient>;
  private readonly account: ReturnType<typeof privateKeyToAccount>;
  private readonly fetcher: typeof fetch;
  private readonly explorerApiUrl: string;
  private configCache?: { expiresAt: number; value: LiveFccConfig };
  private readonly evaluations = new Map<string, Promise<LiveEvaluationResponse>>();

  constructor(private readonly options: RuntimeOptions) {
    if (!options.rpcUrl.startsWith("https://") || !/^0x[0-9a-fA-F]{64}$/.test(options.executorPrivateKey)) {
      throw new Error("live relay runtime configuration is invalid");
    }
    this.account = privateKeyToAccount(options.executorPrivateKey);
    const chain = { ...CHAIN, rpcUrls: { default: { http: [options.rpcUrl] } } } as const;
    this.client = createPublicClient({ chain, transport: http(options.rpcUrl, { timeout: 15_000, retryCount: 2 }) });
    this.wallet = createWalletClient({ account: this.account, chain, transport: http(options.rpcUrl, { timeout: 15_000, retryCount: 2 }) });
    this.fetcher = options.fetcher ?? fetch;
    this.explorerApiUrl = normalizeExplorerApiUrl(options.explorerApiUrl ?? "https://coston2-explorer.flare.network/api");
  }

  async config(): Promise<LiveFccConfig> {
    if (this.configCache && this.configCache.expiresAt > Date.now()) return this.configCache.value;
    const value = await this.loadConfig();
    this.configCache = { expiresAt: Date.now() + 20_000, value };
    return value;
  }

  async ingress(machineIndex: 1 | 2 | 3, value: unknown): Promise<unknown> {
    const config = await this.config();
    const machine = config.machines[machineIndex - 1];
    if (!machine) throw new Error("live machine is unavailable");
    const request = parseIngress(value, config, machine);
    const ciphertext = strictBase64(request.ciphertext);
    const authorizationDigest = policyIngressAuthorizationDigest({
      binding: request.binding,
      submissionNonce: request.submissionNonce,
      issuedAt: request.issuedAt,
      expiry: request.expiry,
      ciphertextHash: keccak256(`0x${ciphertext.toString("hex")}`),
      machineId: machine.machineId,
      keyFingerprint: machine.keyFingerprint,
    });
    const recovered = await recoverMessageAddress({ message: { raw: authorizationDigest }, signature: request.authorization });
    if (getAddress(recovered) !== getAddress(request.binding.owner)) throw new Error("policy ingress owner authorization is invalid");
    const response = await this.fetcher(`${machine.origin}/private/ingress`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: stringifyWire(request),
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
      throw new Error("machine ingress failed closed");
    }
    const text = await boundedText(response, 128 * 1024);
    const envelope = parseReceipt(JSON.parse(text), request.binding, machine);
    if (envelope.receipt.submissionNonce.toLowerCase() !== request.submissionNonce.toLowerCase()
      || envelope.receipt.issuedAt !== request.issuedAt || envelope.receipt.expiry !== request.expiry) {
      throw new Error("machine receipt request binding is invalid");
    }
    const receiptSigner = await recoverMessageAddress({ message: { raw: policyReceiptAttestationDigest(envelope.receipt) }, signature: envelope.signature });
    if (getAddress(receiptSigner) !== machine.signer || envelope.signer !== machine.signer) throw new Error("machine receipt signer is invalid");
    return wireReceipt(envelope);
  }

  evaluate(requestId: Hex, authorization: LiveEvaluationAuthorization): Promise<LiveEvaluationResponse> {
    const key = requestId.toLowerCase();
    const existing = this.evaluations.get(key);
    if (existing) return existing;
    const operation = this.evaluateOnce(requestId, authorization).finally(() => this.evaluations.delete(key));
    this.evaluations.set(key, operation);
    return operation;
  }

  private async loadConfig(): Promise<LiveFccConfig> {
    if (await this.client.getChainId() !== 114) throw new Error("relay RPC is not Coston2");
    const [dispatcherOwner, dispatcherExtension, registryCode, vaultCode, routerCode, routerRegistry, routerVault, vaultRouter] = await Promise.all([
      this.client.readContract({ address: DISPATCHER, abi: dispatcherReadAbi, functionName: "owner" }),
      this.client.readContract({ address: DISPATCHER, abi: dispatcherReadAbi, functionName: "getExtensionId" }),
      this.client.getCode({ address: REGISTRY }), this.client.getCode({ address: VAULT }), this.client.getCode({ address: ROUTER }),
      this.client.readContract({ address: ROUTER, abi: PayGuardActionRouterAbi, functionName: "registry" }),
      this.client.readContract({ address: ROUTER, abi: PayGuardActionRouterAbi, functionName: "vault" }),
      this.client.readContract({ address: VAULT, abi: PayGuardVaultAbi, functionName: "router" }),
    ]);
    if (getAddress(dispatcherOwner) !== this.account.address || dispatcherExtension !== EXTENSION_ID
      || !registryCode || registryCode === "0x" || !vaultCode || vaultCode === "0x" || !routerCode || routerCode === "0x"
      || getAddress(routerRegistry) !== REGISTRY || getAddress(routerVault) !== VAULT || getAddress(vaultRouter) !== ROUTER) {
      throw new Error("live relay contract domain failed verification");
    }
    const machines = await Promise.all(ORIGINS.map((origin, index) => this.loadMachine(origin, (index + 1) as 1 | 2 | 3)));
    if (new Set(machines.map((machine) => machine.teeId.toLowerCase())).size !== 3
      || new Set(machines.map((machine) => machine.keyFingerprint.toLowerCase())).size !== 3
      || new Set(machines.map((machine) => machine.codeHash.toLowerCase())).size !== 1) {
      throw new Error("live FCC machine set is incompatible");
    }
    return {
      schemaVersion: 1,
      mode: LIVE_FCC_MODE,
      status: "ready",
      chainId: 114,
      extensionId: EXTENSION_ID_BYTES,
      deploymentBlock: DEPLOYMENT_BLOCK.toString(),
      operator: this.account.address,
      contracts: { registry: REGISTRY, vault: VAULT, router: ROUTER, dispatcher: DISPATCHER, manager: MANAGER, asset: ASSET },
      machines: machines as [LiveMachineConfig, LiveMachineConfig, LiveMachineConfig],
      assertions: {
        registeredMachinesVerified: true,
        stableHttpsOriginsVerified: true,
        authenticatedPrivateIngressVerified: true,
        simulatedTee: true,
        hardwareTeeVerified: false,
        v2ReleaseVerified: false,
        verifiedPayGuardRelease: false,
      },
    };
  }

  private async loadMachine(origin: string, index: 1 | 2 | 3): Promise<LiveMachineConfig> {
    const [rawInfo, rawHealth] = await Promise.all([
      boundedJson(this.fetcher, `${origin}/info`, 128 * 1024),
      boundedJson(this.fetcher, `${origin}/private/health`, 32 * 1024),
    ]);
    const info = rawInfo as { teeInfo?: { chainId?: number; publicKey?: TeePublicKeyV1 }; machineData?: { extensionId?: Hex; codeHash?: Hex; platform?: Hex; publicKey?: TeePublicKeyV1 } };
    const health = rawHealth as { status?: string; machineId?: Hex; keyFingerprint?: Hex; signer?: Address };
    if (info.teeInfo?.chainId !== 114 || !info.teeInfo.publicKey || !info.machineData?.publicKey
      || !sameHex(info.teeInfo.publicKey.x, info.machineData.publicKey.x) || !sameHex(info.teeInfo.publicKey.y, info.machineData.publicKey.y)
      || BigInt(info.machineData.extensionId ?? 0) !== EXTENSION_ID) throw new Error("machine info is outside the live domain");
    const descriptor = teeMachineDescriptorV1(info.teeInfo.publicKey);
    const teeId = getAddress(descriptor.signer);
    if (health.status !== "ready" || !sameHex(health.machineId, descriptor.machineId)
      || !sameHex(health.keyFingerprint, descriptor.keyFingerprint) || !health.signer || getAddress(health.signer) !== teeId) {
      throw new Error("machine private ingress identity mismatch");
    }
    const codeHash = hex32(info.machineData.codeHash, "code hash");
    const platform = hex32(info.machineData.platform, "platform");
    const [registered, attestation, status, extension, supported, disabled, localMachine] = await Promise.all([
      this.client.readContract({ address: MANAGER, abi: managerAbi, functionName: "getTeeMachine", args: [teeId] }),
      this.client.readContract({ address: MANAGER, abi: managerAbi, functionName: "getTeeMachineWithAttestationData", args: [teeId] }),
      this.client.readContract({ address: MANAGER, abi: managerAbi, functionName: "getTeeMachineStatus", args: [teeId] }),
      this.client.readContract({ address: MANAGER, abi: managerAbi, functionName: "getExtensionId", args: [teeId] }),
      this.client.readContract({ address: MANAGER, abi: managerAbi, functionName: "isCodeHashPlatformSupported", args: [EXTENSION_ID, codeHash, platform] }),
      this.client.readContract({ address: MANAGER, abi: managerAbi, functionName: "isCodeHashPlatformDisabled", args: [EXTENSION_ID, codeHash, platform] }),
      this.client.readContract({ address: REGISTRY, abi: PayGuardPolicyRegistryAbi, functionName: "machine", args: [descriptor.machineId] }),
    ]);
    if (Number(status) !== 2 || extension !== EXTENSION_ID || !supported || disabled
      || getAddress(registered.teeId) !== teeId || getAddress(attestation.teeId) !== teeId
      || getAddress(attestation.initialTeeId) !== zeroAddress || registered.url !== origin || attestation.url !== origin
      || !sameHex(attestation.codeHash, codeHash) || !sameHex(attestation.platform, platform) || !sameHex(platform, SIMULATED_PLATFORM)
      || !localMachine[2] || getAddress(localMachine[0]) !== teeId || !sameHex(localMachine[1], descriptor.keyFingerprint)) {
      throw new Error("machine manager/registry readback mismatch");
    }
    return {
      index,
      teeId,
      proxyId: getAddress(registered.teeProxyId),
      origin,
      machineId: descriptor.machineId,
      keyFingerprint: descriptor.keyFingerprint,
      signer: teeId,
      publicKey: info.teeInfo.publicKey,
      codeHash,
      platform,
      status: 2,
    };
  }

  private async evaluateOnce(requestId: Hex, authorization: LiveEvaluationAuthorization): Promise<LiveEvaluationResponse> {
    const config = await this.config();
    const stored = await this.readStoredRequest(requestId);
    const request = stored.request;
    const policyRead = await this.client.readContract({ address: REGISTRY, abi: PayGuardPolicyRegistryAbi, functionName: "getPolicy", args: [request.policyCommitment] });
    const binding = normalizeBinding(policyRead[0]);
    await authorizeEvaluation(requestId, binding, authorization, this.account.address);
    if ([2, 3, 4].includes(stored.status)) return finalizedResponse(stored, config);
    if (stored.status !== 1) throw new Error("request is not pending");
    const latest = await this.client.getBlock({ blockTag: "latest" });
    if (request.expiry < latest.timestamp || request.inputCommitment.toLowerCase() !== ZERO_BYTES32.toLowerCase()) {
      throw new Error("request is expired or requires an unsupported live input");
    }
    const spendRaw = await this.client.readContract({ address: ROUTER, abi: PayGuardActionRouterAbi, functionName: "spendState", args: [request.policyCommitment] });
    const policyStatus = Number(policyRead[1]);
    validatePolicyAndRequest(binding, policyStatus, request, config);
    const accounting = accountingOf(await this.client.readContract({
      address: VAULT,
      abi: PayGuardVaultAbi,
      functionName: "accounting",
      args: [getAddress(binding.owner), ASSET],
    }));
    if (request.balanceCheckpoint.toLowerCase() !== balanceCheckpoint(accounting, BigInt(request.occurrence)).toLowerCase()) {
      throw new Error("request balance checkpoint does not match the canonical vault accounting");
    }
    const history = await this.reconstructHistory(request.policyCommitment, Number(spendRaw[1]));
    const initialized = Boolean(spendRaw[3]);
    const checkpoint = initialized ? hex32(spendRaw[0], "spend checkpoint") : genesisSpendCheckpoint(request.policyCommitment);
    if (request.spendCheckpoint.toLowerCase() !== checkpoint.toLowerCase()
      || request.occurrence !== Number(spendRaw[1]) + 1 || history.length !== Number(spendRaw[1])) {
      throw new Error("request spend checkpoint is stale");
    }
    const state: SpendStateV1 = {
      availableBalance: accounting.available,
      history,
      occurrenceCount: Number(spendRaw[1]),
      lastAccountingAt: BigInt(spendRaw[2]),
      spendCheckpoint: checkpoint,
      balanceCheckpoint: request.balanceCheckpoint,
      now: request.createdAt,
    };
    const message = stringToHex(stringifyWire({ request: wireRequest(request), state: wireState(state) }));
    const dispatch = await this.write(DISPATCHER, PayGuardFccDispatcherAbi, "sendEvaluation", [config.machines.map((machine) => machine.teeId), message], 3_000_000n);
    let instructionId: Hex | undefined;
    for (const log of dispatch.receipt.logs) {
      try {
        const event = decodeEventLog({ abi: PayGuardFccDispatcherAbi, data: log.data, topics: log.topics, eventName: "EvaluationDispatched", strict: true });
        instructionId = event.args.instructionId;
      } catch { /* unrelated event */ }
    }
    if (!instructionId) throw new Error("evaluation dispatch event is missing");
    const settled = await Promise.allSettled(config.machines.map((machine) => this.pollEvaluation(machine, instructionId!, request)));
    const evaluations = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
    if (evaluations.length < 2) throw new Error("fewer than two live machine results are available");
    const groups = new Map<string, EvaluationEnvelope[]>();
    for (const evaluation of evaluations) {
      const group = groups.get(evaluation.digest.toLowerCase()) ?? [];
      group.push(evaluation);
      groups.set(evaluation.digest.toLowerCase(), group);
    }
    const matching = [...groups.values()].find((group) => group.length >= 2);
    if (!matching) throw new Error("live machine results are split or unavailable");
    const decision = matching[0]!.result.decision;
    const reason = matching[0]!.result.publicReasonClass;
    const submitted: Hash[] = [];
    for (const evaluation of matching) {
      const already = await this.client.readContract({ address: ROUTER, abi: PayGuardActionRouterAbi, functionName: "machineSubmitted", args: [requestId, evaluation.result.machineId] });
      if (already) continue;
      const transaction = await this.write(ROUTER, PayGuardActionRouterAbi, "submitEvaluation", [{
        ...evaluation.result,
        decision: evaluation.result.decision === "ALLOW" ? 1 : 0,
        publicReasonClass: publicReasonCode(evaluation.result.publicReasonClass),
      }, evaluation.signature]);
      submitted.push(transaction.transaction);
      const current = await this.readStoredRequest(requestId);
      if (current.status === 2 || current.status === 3) break;
    }
    const finalized = await this.readStoredRequest(requestId);
    const expectedStatus = decision === "ALLOW" ? 2 : 3;
    if (finalized.status !== expectedStatus || finalized.matchingCount < 2) throw new Error("threshold submission postcondition failed");
    return {
      schemaVersion: 1,
      mode: LIVE_FCC_MODE,
      status: "threshold-submitted",
      requestId,
      routerStatus: expectedStatus,
      decision,
      publicReasonClass: reason,
      instructionId,
      transactions: { dispatch: dispatch.transaction, submit: submitted },
      assertions: {
        requestReadFromCoston2: true,
        clientDecisionAccepted: false,
        threeRegisteredMachinesChecked: true,
        outerSignaturesVerified: true,
        innerSignaturesVerified: true,
        twoMatchingResultsSubmitted: true,
        simulatedTee: true,
        hardwareTeeVerified: false,
        verifiedPayGuardRelease: false,
      },
    };
  }

  private async reconstructHistory(policyCommitment: Hex, expectedCount: number): Promise<SpendHistoryEntryV1[]> {
    if (expectedCount === 0) return [];
    const endpoint = new URL(this.explorerApiUrl);
    endpoint.searchParams.set("module", "logs");
    endpoint.searchParams.set("action", "getLogs");
    endpoint.searchParams.set("fromBlock", DEPLOYMENT_BLOCK.toString());
    endpoint.searchParams.set("toBlock", "latest");
    endpoint.searchParams.set("address", ROUTER);
    endpoint.searchParams.set("topic0", keccak256(stringToHex("RequestExecuted(bytes32,address,uint256,bytes32)")));
    const requestIds = parseExecutedRequestIds(await boundedJson(this.fetcher, endpoint.toString(), 2 * 1024 * 1024));
    const history: SpendHistoryEntryV1[] = [];
    for (const requestId of requestIds) {
      const stored = await this.readStoredRequest(requestId);
      if (stored.status !== 4 || stored.request.policyCommitment.toLowerCase() !== policyCommitment.toLowerCase()) continue;
      if (stored.request.inputCommitment.toLowerCase() !== ZERO_BYTES32.toLowerCase()) throw new Error("FTSO/FDC live history is not supported by this relay release");
      history.push({ request: stored.request, accountedAt: stored.approvedIssuedAt });
    }
    history.sort((left, right) => left.request.occurrence - right.request.occurrence);
    if (history.length !== expectedCount || history.some((entry, index) => entry.request.occurrence !== index + 1)) {
      throw new Error("public spend history is incomplete");
    }
    return history;
  }

  private async pollEvaluation(machine: LiveMachineConfig, instructionId: Hex, request: ActionRequestV1): Promise<EvaluationEnvelope> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await this.fetcher(`${machine.origin}/action/result/${instructionId}`, {
        headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 202 || response.status === 404) {
        if (attempt === 29) break;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        continue;
      }
      if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") throw new Error("evaluation result endpoint failed closed");
      return parseEvaluationResponse(JSON.parse(await boundedText(response, 512 * 1024)), instructionId, request, machine);
    }
    throw new Error("evaluation result polling timed out");
  }

  private async readStoredRequest(requestId: Hex): Promise<NormalizedStoredRequest> {
    const value = await this.client.readContract({ address: ROUTER, abi: PayGuardActionRouterAbi, functionName: "getRequest", args: [requestId] });
    return normalizeStoredRequest(value);
  }

  private async write(address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[], value?: bigint) {
    const simulation = await this.client.simulateContract({ account: this.account.address, address, abi: abi as never, functionName: functionName as never, args: args as never, ...(value === undefined ? {} : { value }) });
    const transaction = await this.wallet.writeContract({ ...simulation.request, account: this.account } as never) as Hash;
    const receipt = await this.client.waitForTransactionReceipt({ hash: transaction, confirmations: 2, timeout: 180_000 });
    if (receipt.status !== "success") throw new Error("live relay transaction reverted");
    return { transaction, receipt };
  }
}

export function parseExecutedRequestIds(value: unknown): Hex[] {
  const response = exactObject(value, ["status", "message", "result"], "explorer log response");
  if (response.status !== "1" || response.message !== "OK" || !Array.isArray(response.result) || response.result.length > 10_000) {
    throw new Error("explorer log response failed closed");
  }
  const topic0 = keccak256(stringToHex("RequestExecuted(bytes32,address,uint256,bytes32)")).toLowerCase();
  const requestIds: Hex[] = [];
  const distinct = new Set<string>();
  for (const item of response.result) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("explorer log item is invalid");
    const log = item as Record<string, unknown>;
    const topics = log.topics;
    if (typeof log.address !== "string" || !isAddress(log.address) || getAddress(log.address) !== ROUTER
      || !Array.isArray(topics) || topics.length < 3 || String(topics[0]).toLowerCase() !== topic0
      || typeof log.transactionHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(log.transactionHash)
      || typeof log.blockNumber !== "string" || !/^0x[0-9a-fA-F]+$/.test(log.blockNumber)) {
      throw new Error("explorer log item is outside the router domain");
    }
    const requestId = hex32(topics[1], "executed request ID");
    if (distinct.has(requestId)) throw new Error("explorer returned a duplicate executed request");
    distinct.add(requestId);
    requestIds.push(requestId);
  }
  return requestIds;
}

function normalizeExplorerApiUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/api"
    || url.search || url.hash) throw new Error("explorer API URL is invalid");
  return url.origin + url.pathname;
}

interface NormalizedStoredRequest {
  request: ActionRequestV1;
  status: number;
  matchingCount: number;
  approvedDecision: number;
  approvedReason: number;
  approvedIssuedAt: bigint;
}

function normalizeStoredRequest(value: unknown): NormalizedStoredRequest {
  const record = value as Record<string, unknown>;
  return {
    request: normalizeRequest(record.request),
    status: Number(record.status),
    matchingCount: Number(record.matchingCount),
    approvedDecision: Number(record.approvedDecision),
    approvedReason: Number(record.approvedReason),
    approvedIssuedAt: BigInt(record.approvedIssuedAt as bigint),
  };
}

function normalizeRequest(value: unknown): ActionRequestV1 {
  const request = value as Record<string, unknown>;
  return {
    chainId: BigInt(request.chainId as bigint), registry: getAddress(String(request.registry)), vault: getAddress(String(request.vault)), router: getAddress(String(request.router)),
    policyId: hex32(request.policyId, "policy ID"), policyVersion: Number(request.policyVersion), policyCommitment: hex32(request.policyCommitment, "policy commitment"),
    requestId: hex32(request.requestId, "request ID"), requestNonce: BigInt(request.requestNonce as bigint), attempt: Number(request.attempt),
    requester: getAddress(String(request.requester)), target: getAddress(String(request.target)), asset: getAddress(String(request.asset)), actionType: hex32(request.actionType, "action type"),
    amount: BigInt(request.amount as bigint), scheduleSlot: BigInt(request.scheduleSlot as bigint), occurrence: Number(request.occurrence),
    spendCheckpoint: hex32(request.spendCheckpoint, "spend checkpoint"), balanceCheckpoint: hex32(request.balanceCheckpoint, "balance checkpoint"), inputCommitment: hex32(request.inputCommitment, "input commitment"),
    createdAt: BigInt(request.createdAt as bigint), graceDeadline: BigInt(request.graceDeadline as bigint), expiry: BigInt(request.expiry as bigint),
  };
}

function normalizeBinding(value: unknown): PolicyBindingV1 {
  const binding = value as Record<string, unknown>;
  const machines = binding.machineIds as readonly unknown[];
  const fingerprints = binding.keyFingerprints as readonly unknown[];
  if (!Array.isArray(machines) || machines.length !== 3 || !Array.isArray(fingerprints) || fingerprints.length !== 3) throw new Error("policy binding machine set is invalid");
  return {
    chainId: BigInt(binding.chainId as bigint), registry: getAddress(String(binding.registry)), vault: getAddress(String(binding.vault)), router: getAddress(String(binding.router)), owner: getAddress(String(binding.owner)),
    policyId: hex32(binding.policyId, "policy ID"), policyVersion: Number(binding.policyVersion), policyCommitment: hex32(binding.policyCommitment, "policy commitment"),
    schema: hex32(binding.schema, "policy schema"), extensionId: hex32(binding.extensionId, "extension ID"), codeVersion: hex32(binding.codeVersion, "code version"),
    machineIds: machines.map((item) => hex32(item, "machine ID")) as [Hex, Hex, Hex],
    keyFingerprints: fingerprints.map((item) => hex32(item, "key fingerprint")) as [Hex, Hex, Hex],
    custodyThreshold: Number(binding.custodyThreshold), resultThreshold: Number(binding.resultThreshold), policyNonce: BigInt(binding.policyNonce as bigint),
  };
}

function parseIngress(value: unknown, config: LiveFccConfig, machine: LiveMachineConfig): IngressRequest {
  const record = exactObject(value, ["binding", "submissionNonce", "issuedAt", "expiry", "ciphertext", "authorization"], "ingress");
  const binding = parseWireBinding(record.binding);
  const issuedAt = decimal(record.issuedAt, "issuedAt", MAX_UINT64);
  const expiry = decimal(record.expiry, "expiry", MAX_UINT64);
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (issuedAt === 0n || issuedAt > now + 60n || expiry <= now || expiry <= issuedAt || expiry - issuedAt > 3_600n) throw new Error("ingress time window is invalid");
  if (binding.chainId !== 114n || getAddress(binding.registry) !== config.contracts.registry || getAddress(binding.vault) !== config.contracts.vault
    || getAddress(binding.router) !== config.contracts.router || binding.schema.toLowerCase() !== POLICY_SCHEMA_V1.toLowerCase()
    || binding.extensionId.toLowerCase() !== config.extensionId.toLowerCase() || binding.codeVersion.toLowerCase() !== machine.codeHash.toLowerCase()
    || binding.custodyThreshold !== 3 || binding.resultThreshold !== 2 || binding.policyNonce === 0n
    || binding.machineIds.some((item, index) => item.toLowerCase() !== config.machines[index]!.machineId.toLowerCase())
    || binding.keyFingerprints.some((item, index) => item.toLowerCase() !== config.machines[index]!.keyFingerprint.toLowerCase())) {
    throw new Error("ingress binding is outside the live FCC domain");
  }
  const authorization = signature(record.authorization, "authorization");
  if (typeof record.ciphertext !== "string") throw new Error("ciphertext wire is invalid");
  return { binding, submissionNonce: hex32(record.submissionNonce, "submission nonce"), issuedAt, expiry, ciphertext: record.ciphertext, authorization };
}

interface IngressRequest {
  binding: PolicyBindingV1;
  submissionNonce: Hex;
  issuedAt: bigint;
  expiry: bigint;
  ciphertext: string;
  authorization: Hex;
}

function parseWireBinding(value: unknown): PolicyBindingV1 {
  const record = exactObject(value, ["chainId", "registry", "vault", "router", "owner", "policyId", "policyVersion", "policyCommitment", "schema", "extensionId", "codeVersion", "machineIds", "keyFingerprints", "custodyThreshold", "resultThreshold", "policyNonce"], "binding");
  const machines = exactArray(record.machineIds, 3, "machine IDs");
  const fingerprints = exactArray(record.keyFingerprints, 3, "key fingerprints");
  return {
    chainId: decimal(record.chainId, "chainId"), registry: address(record.registry, "registry"), vault: address(record.vault, "vault"), router: address(record.router, "router"), owner: address(record.owner, "owner"),
    policyId: hex32(record.policyId, "policy ID"), policyVersion: integer(record.policyVersion, "policy version"), policyCommitment: hex32(record.policyCommitment, "policy commitment"),
    schema: hex32(record.schema, "schema"), extensionId: hex32(record.extensionId, "extension ID"), codeVersion: hex32(record.codeVersion, "code version"),
    machineIds: machines.map((item) => hex32(item, "machine ID")) as [Hex, Hex, Hex], keyFingerprints: fingerprints.map((item) => hex32(item, "key fingerprint")) as [Hex, Hex, Hex],
    custodyThreshold: integer(record.custodyThreshold, "custody threshold"), resultThreshold: integer(record.resultThreshold, "result threshold"), policyNonce: decimal(record.policyNonce, "policy nonce", MAX_UINT64),
  };
}

function parseReceipt(value: unknown, binding: PolicyBindingV1, machine: LiveMachineConfig): { receipt: PolicyReceiptV1; digest: Hex; signer: Address; signature: Hex } {
  const envelope = exactObject(value, ["receipt", "digest", "signer", "signature"], "receipt envelope");
  const wire = exactObject(envelope.receipt, ["binding", "machineId", "keyFingerprint", "submissionNonce", "receiptNonce", "issuedAt", "expiry"], "receipt");
  const receivedBinding = parseWireBinding(wire.binding);
  if (!safeEqual(stringifyWire(receivedBinding), stringifyWire(binding))) throw new Error("receipt binding mismatch");
  const receipt: PolicyReceiptV1 = {
    binding,
    machineId: hex32(wire.machineId, "machine ID"), keyFingerprint: hex32(wire.keyFingerprint, "key fingerprint"), submissionNonce: hex32(wire.submissionNonce, "submission nonce"),
    receiptNonce: decimal(wire.receiptNonce, "receipt nonce", MAX_UINT64), issuedAt: decimal(wire.issuedAt, "issuedAt", MAX_UINT64), expiry: decimal(wire.expiry, "expiry", MAX_UINT64),
  };
  const digest = hex32(envelope.digest, "receipt digest");
  const signer = address(envelope.signer, "receipt signer");
  const signed = signature(envelope.signature, "receipt signature");
  if (receipt.machineId.toLowerCase() !== machine.machineId.toLowerCase() || receipt.keyFingerprint.toLowerCase() !== machine.keyFingerprint.toLowerCase()
    || receipt.receiptNonce !== binding.policyNonce || digest.toLowerCase() !== policyReceiptDigest(receipt).toLowerCase()) throw new Error("receipt domain mismatch");
  return { receipt, digest, signer, signature: signed };
}

async function authorizeEvaluation(
  requestId: Hex,
  binding: PolicyBindingV1,
  authorization: LiveEvaluationAuthorization,
  operator: Address,
): Promise<void> {
  const now = BigInt(Math.floor(Date.now() / 1_000));
  if (getAddress(binding.owner) !== operator || getAddress(authorization.owner) !== operator
    || authorization.issuedAt === 0n || authorization.issuedAt > now + 60n
    || authorization.expiry <= now || authorization.expiry <= authorization.issuedAt
    || authorization.expiry - authorization.issuedAt > 300n) {
    throw new Error("evaluation authorization is outside the operator domain");
  }
  const digest = liveEvaluationAuthorizationDigest({
    requestId,
    owner: authorization.owner,
    issuedAt: authorization.issuedAt,
    expiry: authorization.expiry,
  });
  const recovered = await recoverMessageAddress({ message: { raw: digest }, signature: signature(authorization.signature, "evaluation authorization") });
  if (getAddress(recovered) !== operator) throw new Error("evaluation authorization signer is invalid");
}

async function parseEvaluationResponse(value: unknown, instructionId: Hex, request: ActionRequestV1, machine: LiveMachineConfig): Promise<EvaluationEnvelope> {
  const outer = exactObject(value, ["result", "signature", "proxySignature"], "action response");
  const action = exactObject(outer.result, ["id", "submissionTag", "status", "log", "opType", "opCommand", "additionalResultStatus", "version", "data"], "action result");
  if (hex32(action.id, "instruction ID").toLowerCase() !== instructionId.toLowerCase() || action.submissionTag !== "threshold"
    || action.status !== 1 || action.log !== "ok" || String(action.opType).toLowerCase() !== OP_TYPE.toLowerCase()
    || String(action.opCommand).toLowerCase() !== OP_COMMAND.toLowerCase() || action.additionalResultStatus !== "0x" || action.version !== "0.1.0-payguard") {
    throw new Error("action result domain mismatch");
  }
  if (typeof action.data !== "string" || !isHex(action.data) || action.data === "0x") throw new Error("evaluation data is invalid");
  const decoded = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(hexToBytes(action.data)));
  const envelope = exactObject(decoded, ["result", "digest", "signer", "signature"], "evaluation envelope");
  const raw = exactObject(envelope.result, ["request", "decision", "publicReasonClass", "reservedAmount", "resultingCheckpoint", "resultNonce", "attempt", "issuedAt", "expiry", "machineId", "keyFingerprint"], "evaluation result");
  const parsedRequest = parseWireRequest(raw.request);
  if (actionRequestHash(parsedRequest).toLowerCase() !== actionRequestHash(request).toLowerCase()) throw new Error("evaluation request mismatch");
  if ((raw.decision !== "ALLOW" && raw.decision !== "DENY") || !REASONS.includes(raw.publicReasonClass as PublicReasonClass)) throw new Error("evaluation decision is invalid");
  const result: EvaluationResultV1 = {
    request,
    decision: raw.decision,
    publicReasonClass: raw.publicReasonClass as PublicReasonClass,
    reservedAmount: decimal(raw.reservedAmount, "reserved amount"), resultingCheckpoint: hex32(raw.resultingCheckpoint, "resulting checkpoint"), resultNonce: hex32(raw.resultNonce, "result nonce"),
    attempt: integer(raw.attempt, "attempt"), issuedAt: decimal(raw.issuedAt, "issuedAt", MAX_UINT64), expiry: decimal(raw.expiry, "expiry", MAX_UINT64), machineId: hex32(raw.machineId, "machine ID"), keyFingerprint: hex32(raw.keyFingerprint, "key fingerprint"),
  };
  const digest = hex32(envelope.digest, "evaluation digest");
  const innerSignature = signature(envelope.signature, "evaluation signature");
  const signer = address(envelope.signer, "evaluation signer");
  const [inner, tee, proxy] = await Promise.all([
    recoverMessageAddress({ message: { raw: evaluationAttestationDigest(result) }, signature: innerSignature }),
    recoverMessageAddress({ message: { raw: actionSigningDigest(actionResultHash(action), TEE_RESULT_PREFIX) }, signature: signature(outer.signature, "TEE action signature") }),
    recoverMessageAddress({ message: { raw: actionSigningDigest(actionResultHash(action), PROXY_RESULT_PREFIX) }, signature: signature(outer.proxySignature, "proxy action signature") }),
  ]);
  if (digest.toLowerCase() !== evaluationDigest(result).toLowerCase() || result.machineId.toLowerCase() !== machine.machineId.toLowerCase()
    || result.keyFingerprint.toLowerCase() !== machine.keyFingerprint.toLowerCase() || getAddress(signer) !== machine.signer
    || getAddress(inner) !== machine.signer || getAddress(tee) !== machine.teeId || getAddress(proxy) !== machine.proxyId) throw new Error("evaluation signature binding mismatch");
  return { result, digest, signer, signature: innerSignature };
}

function actionResultHash(result: Record<string, unknown>): Hex {
  return keccak256(concatHex([keccak256(result.data as Hex), result.id as Hex, keccak256(stringToHex(String(result.submissionTag))), numberToHex(Number(result.status), { size: 1 })]));
}

function actionSigningDigest(resultHash: Hex, prefix: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "tuple", components: [{ name: "prefix", type: "bytes32" }, { name: "chainId", type: "uint256" }, { name: "dataHash", type: "bytes32" }] }], [{ prefix, chainId: CHAIN_ID, dataHash: resultHash }]));
}

function validatePolicyAndRequest(binding: PolicyBindingV1, status: number, request: ActionRequestV1, config: LiveFccConfig): void {
  if (status !== 1 || binding.chainId !== 114n || getAddress(binding.registry) !== REGISTRY || getAddress(binding.vault) !== VAULT || getAddress(binding.router) !== ROUTER
    || binding.policyId.toLowerCase() !== request.policyId.toLowerCase() || binding.policyVersion !== request.policyVersion || binding.policyCommitment.toLowerCase() !== request.policyCommitment.toLowerCase()
    || request.chainId !== 114n || getAddress(request.registry) !== REGISTRY || getAddress(request.vault) !== VAULT || getAddress(request.router) !== ROUTER || getAddress(request.asset) !== ASSET
    || binding.extensionId.toLowerCase() !== config.extensionId.toLowerCase() || binding.codeVersion.toLowerCase() !== config.machines[0].codeHash.toLowerCase()
    || binding.machineIds.some((item, index) => item.toLowerCase() !== config.machines[index]!.machineId.toLowerCase())
    || binding.keyFingerprints.some((item, index) => item.toLowerCase() !== config.machines[index]!.keyFingerprint.toLowerCase())) throw new Error("request policy binding is outside the live relay domain");
}

function finalizedResponse(stored: NormalizedStoredRequest, config: LiveFccConfig): LiveEvaluationResponse {
  if (![2, 3, 4].includes(stored.status)) throw new Error("request has no threshold result");
  const decision = stored.status === 3 ? "DENY" : "ALLOW";
  const reason = REASONS[stored.approvedReason] ?? "MALFORMED";
  return {
    schemaVersion: 1, mode: LIVE_FCC_MODE, status: "already-finalized", requestId: stored.request.requestId,
    routerStatus: stored.status as 2 | 3 | 4, decision, publicReasonClass: decision === "ALLOW" ? "OK" : reason,
    transactions: { submit: [] },
    assertions: {
      requestReadFromCoston2: true, clientDecisionAccepted: false, threeRegisteredMachinesChecked: config.machines.length === 3,
      outerSignaturesVerified: false, innerSignaturesVerified: false, twoMatchingResultsSubmitted: stored.matchingCount >= 2,
      simulatedTee: true, hardwareTeeVerified: false, verifiedPayGuardRelease: false,
    },
  };
}

function balanceCheckpoint(accounting: Accounting, sequence: bigint): Hex {
  return keccak256(encodeAbiParameters([
    { type: "bytes32" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" },
  ], [BALANCE_DOMAIN, accounting.deposited, accounting.available, accounting.reserved, accounting.spent, accounting.withdrawn, accounting.refunded, sequence]));
}

function accountingOf(value: unknown): Accounting {
  const record = value as Record<string, unknown>;
  const result = { deposited: BigInt(record.deposited as bigint), available: BigInt(record.available as bigint), reserved: BigInt(record.reserved as bigint), spent: BigInt(record.spent as bigint), withdrawn: BigInt(record.withdrawn as bigint), refunded: BigInt(record.refunded as bigint) };
  if (result.deposited !== result.available + result.reserved + result.spent + result.withdrawn + result.refunded) throw new Error("vault conservation failed");
  return result;
}

function wireRequest(request: ActionRequestV1) {
  return { chainId: request.chainId.toString(), registry: request.registry, vault: request.vault, router: request.router, policyId: request.policyId, policyVersion: request.policyVersion, policyCommitment: request.policyCommitment, requestId: request.requestId, requestNonce: request.requestNonce.toString(), attempt: request.attempt, requester: request.requester, target: request.target, asset: request.asset, actionType: request.actionType, amount: request.amount.toString(), scheduleSlot: request.scheduleSlot.toString(), occurrence: request.occurrence, spendCheckpoint: request.spendCheckpoint, balanceCheckpoint: request.balanceCheckpoint, inputCommitment: request.inputCommitment, createdAt: request.createdAt.toString(), graceDeadline: request.graceDeadline.toString(), expiry: request.expiry.toString() };
}

function parseWireRequest(value: unknown): ActionRequestV1 {
  const record = exactObject(value, REQUEST_FIELDS, "request");
  return normalizeRequest({
    ...record,
    chainId: decimal(record.chainId, "chainId"), requestNonce: decimal(record.requestNonce, "request nonce"), amount: decimal(record.amount, "amount"), scheduleSlot: decimal(record.scheduleSlot, "schedule slot", MAX_UINT64),
    createdAt: decimal(record.createdAt, "createdAt", MAX_UINT64), graceDeadline: decimal(record.graceDeadline, "grace deadline", MAX_UINT64), expiry: decimal(record.expiry, "expiry", MAX_UINT64),
  });
}

function wireState(state: SpendStateV1) {
  return { availableBalance: state.availableBalance.toString(), history: state.history.map((entry) => ({ request: wireRequest(entry.request), accountedAt: entry.accountedAt.toString() })), occurrenceCount: state.occurrenceCount, lastAccountingAt: state.lastAccountingAt.toString(), spendCheckpoint: state.spendCheckpoint, balanceCheckpoint: state.balanceCheckpoint, now: state.now.toString() };
}

function wireReceipt(envelope: { receipt: PolicyReceiptV1; digest: Hex; signer: Address; signature: Hex }) {
  return { receipt: { binding: envelope.receipt.binding, machineId: envelope.receipt.machineId, keyFingerprint: envelope.receipt.keyFingerprint, submissionNonce: envelope.receipt.submissionNonce, receiptNonce: envelope.receipt.receiptNonce.toString(), issuedAt: envelope.receipt.issuedAt.toString(), expiry: envelope.receipt.expiry.toString() }, digest: envelope.digest, signer: envelope.signer, signature: envelope.signature };
}

function stringifyWire(value: unknown): string { return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString(10) : item); }
function safeEqual(left: string, right: string): boolean { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function sameHex(left: unknown, right: unknown): boolean { return typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase(); }
function exactObject(value: unknown, keys: readonly string[], label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`); const record = value as Record<string, unknown>; if (Object.keys(record).sort().join(",") !== [...keys].sort().join(",")) throw new Error(`${label} fields are invalid`); return record; }
function exactArray(value: unknown, length: number, label: string): unknown[] { if (!Array.isArray(value) || value.length !== length) throw new Error(`${label} are invalid`); return value; }
function hex32(value: unknown, label: string): Hex { if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} must be bytes32`); return value.toLowerCase() as Hex; }
function address(value: unknown, label: string): Address { if (typeof value !== "string" || !isAddress(value)) throw new Error(`${label} must be an address`); return getAddress(value); }
function integer(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be an unsigned integer`); return value; }
function decimal(value: unknown, label: string, maximum?: bigint): bigint { if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${label} must be a canonical decimal string`); const result = BigInt(value); if (maximum !== undefined && result > maximum) throw new Error(`${label} exceeds its wire width`); return result; }
function signature(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(value)) throw new Error(`${label} must be a 65-byte signature`);
  const s = BigInt(`0x${value.slice(66, 130)}`);
  const v = Number.parseInt(value.slice(130, 132), 16);
  const halfOrder = BigInt("0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0");
  if (s === 0n || s > halfOrder || ![0, 1, 27, 28].includes(v)) throw new Error(`${label} is non-canonical`);
  return value as Hex;
}
function strictBase64(value: string): Buffer { if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("ciphertext must be canonical base64"); const bytes = Buffer.from(value, "base64"); if (bytes.length === 0 || bytes.length > 64 * 1024 || bytes.toString("base64") !== value) throw new Error("ciphertext size is invalid"); return bytes; }
async function boundedText(response: Response, maximum: number): Promise<string> { const length = Number(response.headers.get("content-length") ?? "0"); if (!Number.isFinite(length) || length > maximum) throw new Error("response is oversized"); const text = await response.text(); if (!text || text.length > maximum) throw new Error("response is empty or oversized"); return text; }
async function boundedJson(fetcher: typeof fetch, url: string, maximum: number): Promise<unknown> { const response = await fetcher(url, { headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(15_000) }); if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") throw new Error("machine endpoint unavailable"); return JSON.parse(await boundedText(response, maximum)); }

export const liveDomain = { REGISTRY, VAULT, ROUTER, DISPATCHER, MANAGER, ASSET, EXTENSION_ID, EXTENSION_ID_BYTES, DEPLOYMENT_BLOCK, ORIGINS, balanceCheckpoint };

export function liveEvaluationAuthorizationDigest(input: {
  requestId: Hex;
  owner: Address;
  issuedAt: bigint;
  expiry: bigint;
}): Hex {
  return keccak256(encodeAbiParameters([
    { type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" },
    { type: "address" }, { type: "uint64" }, { type: "uint64" },
  ], [RELAY_AUTH_PREFIX, CHAIN_ID, DISPATCHER, input.requestId, input.owner, input.issuedAt, input.expiry]));
}
