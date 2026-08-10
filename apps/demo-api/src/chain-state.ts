import {
  createPublicClient,
  getAddress,
  http,
  parseAbiItem,
  type Hex,
} from "viem";
import {
  PayGuardActionRouterAbi,
  PayGuardPolicyRegistryAbi,
  PayGuardVaultAbi,
} from "../../../packages/bindings/src/index.js";
import { actionRequestHash, type ActionRequestV1, type PolicyBindingV1 } from "../../../packages/protocol/src/index.js";
import type { DemoCanonicalEvaluationState, DemoStateReader } from "../../../packages/demo/src/server.js";
import type { DemoAccounting, DemoDomainConfig } from "../../../packages/demo/src/index.js";

const COSTON2_RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";
const requestCreated = parseAbiItem("event RequestCreated(bytes32 indexed requestId, bytes32 indexed policyCommitment, address indexed requester, uint256 amount)");

const coston2 = {
  id: 114,
  name: "Flare Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [COSTON2_RPC_URL] } },
} as const;
const coston2Client = createPublicClient({ chain: coston2, transport: http(COSTON2_RPC_URL, { timeout: 8_000, retryCount: 1 }) });

export async function loadCoston2FinalizedTimestamp(): Promise<bigint> {
  const block = await coston2Client.getBlock({ blockTag: "finalized" });
  if (!block.number || block.number <= 0n || block.timestamp <= 0n) throw new Error("finalized Coston2 clock is unavailable");
  return block.timestamp;
}

export function createCoston2DemoStateReader(config: DemoDomainConfig): DemoStateReader {
  const client = coston2Client;
  const readContract = client.readContract as unknown as (parameters: Record<string, unknown>) => Promise<unknown>;
  return {
    async load(requestId, policyCommitment): Promise<DemoCanonicalEvaluationState> {
      const finalized = await client.getBlock({ blockTag: "finalized" });
      const blockNumber = finalized.number;
      const [storedRaw, policyRaw, spendRaw] = await Promise.all([
        readContract({ address: getAddress(config.router), abi: PayGuardActionRouterAbi, functionName: "getRequest", args: [requestId], blockNumber }),
        readContract({ address: getAddress(config.registry), abi: PayGuardPolicyRegistryAbi, functionName: "getPolicy", args: [policyCommitment], blockNumber }),
        readContract({ address: getAddress(config.router), abi: PayGuardActionRouterAbi, functionName: "spendState", args: [policyCommitment], blockNumber }),
      ]);
      const stored = storedRaw as unknown as StoredRequest;
      const [bindingRaw, statusRaw] = policyRaw as unknown as [PolicyBindingV1, number];
      const request = normalizeRequest(stored.request);
      if (Number(stored.status) !== 1 || request.requestId.toLowerCase() !== requestId.toLowerCase()
        || request.policyCommitment.toLowerCase() !== policyCommitment.toLowerCase()
        || stored.requestHash.toLowerCase() !== actionRequestHash(request).toLowerCase()) {
        throw new Error("canonical request is not pending or failed hash validation");
      }
      const binding = normalizeBinding(bindingRaw);
      const accountingRaw = await readContract({
        address: getAddress(config.vault), abi: PayGuardVaultAbi, functionName: "accounting",
        args: [getAddress(binding.owner), getAddress(request.asset)], blockNumber,
      });
      const accounting = normalizeAccounting(accountingRaw);
      const logs = await client.getLogs({
        address: getAddress(config.router), event: requestCreated,
        args: { policyCommitment }, fromBlock: config.deploymentBlock, toBlock: blockNumber,
      });
      if (logs.length > 128) throw new Error("demo policy history exceeds the bounded reader");
      const historical = await Promise.all(logs
        .map((log) => log.args.requestId)
        .filter((value): value is Hex => Boolean(value) && value!.toLowerCase() !== requestId.toLowerCase())
        .map(async (historicalId) => readContract({
          address: getAddress(config.router), abi: PayGuardActionRouterAbi,
          functionName: "getRequest", args: [historicalId], blockNumber,
        }) as Promise<unknown>));
      const executed = historical
        .map((value) => value as StoredRequest)
        .filter((value) => Number(value.status) === 4)
        .map((value) => ({ request: normalizeRequest(value.request), accountedAt: BigInt(value.approvedIssuedAt) }))
        .sort((left, right) => left.request.occurrence - right.request.occurrence);
      const spend = normalizeSpendState(spendRaw, request);
      if (executed.length !== spend.occurrenceCount
        || executed.some((entry, index) => entry.request.occurrence !== index + 1)
        || (executed.at(-1)?.accountedAt ?? 0n) !== spend.lastAccountingAt) {
        throw new Error("canonical demo spend history is incomplete or inconsistent");
      }
      return {
        binding,
        policyStatus: policyStatus(statusRaw),
        request,
        accounting,
        history: executed,
        occurrenceCount: spend.occurrenceCount,
        lastAccountingAt: spend.lastAccountingAt,
        spendCheckpoint: spend.spendCheckpoint,
        finalizedAt: finalized.timestamp,
      };
    },
  };
}

interface StoredRequest {
  request: ActionRequestV1;
  status: number;
  requestHash: Hex;
  approvedIssuedAt: bigint;
}

function normalizeRequest(value: ActionRequestV1): ActionRequestV1 {
  return {
    ...value,
    chainId: BigInt(value.chainId), policyVersion: Number(value.policyVersion), requestNonce: BigInt(value.requestNonce),
    attempt: Number(value.attempt), amount: BigInt(value.amount), scheduleSlot: BigInt(value.scheduleSlot),
    occurrence: Number(value.occurrence), createdAt: BigInt(value.createdAt), graceDeadline: BigInt(value.graceDeadline), expiry: BigInt(value.expiry),
    registry: getAddress(value.registry), vault: getAddress(value.vault), router: getAddress(value.router), requester: getAddress(value.requester),
    target: getAddress(value.target), asset: getAddress(value.asset),
  };
}

function normalizeBinding(value: PolicyBindingV1): PolicyBindingV1 {
  return {
    ...value,
    chainId: BigInt(value.chainId), policyVersion: Number(value.policyVersion), policyNonce: BigInt(value.policyNonce),
    custodyThreshold: Number(value.custodyThreshold), resultThreshold: Number(value.resultThreshold),
    registry: getAddress(value.registry), vault: getAddress(value.vault), router: getAddress(value.router), owner: getAddress(value.owner),
  };
}

function normalizeAccounting(value: unknown): DemoAccounting {
  const tuple = value as { deposited: bigint; available: bigint; reserved: bigint; spent: bigint; withdrawn: bigint; refunded: bigint };
  return {
    deposited: BigInt(tuple.deposited), available: BigInt(tuple.available), reserved: BigInt(tuple.reserved),
    spent: BigInt(tuple.spent), withdrawn: BigInt(tuple.withdrawn), refunded: BigInt(tuple.refunded),
  };
}

function normalizeSpendState(value: unknown, request: ActionRequestV1): { spendCheckpoint: Hex; occurrenceCount: number; lastAccountingAt: bigint } {
  const object = value as { checkpoint: Hex; occurrence: number; accountedAt: bigint; initialized: boolean };
  const tuple = value as readonly [Hex, number, bigint, boolean];
  const checkpoint = Array.isArray(value) ? tuple[0] : object.checkpoint;
  const occurrence = Array.isArray(value) ? tuple[1] : object.occurrence;
  const accountedAt = Array.isArray(value) ? tuple[2] : object.accountedAt;
  const initialized = Array.isArray(value) ? tuple[3] : object.initialized;
  if (!initialized) return { spendCheckpoint: request.spendCheckpoint, occurrenceCount: 0, lastAccountingAt: 0n };
  return { spendCheckpoint: checkpoint, occurrenceCount: Number(occurrence), lastAccountingAt: BigInt(accountedAt) };
}

function policyStatus(value: number): 1 | 2 | 3 {
  const status = Number(value); if (status !== 1 && status !== 2 && status !== 3) throw new Error("unknown demo policy status"); return status;
}
