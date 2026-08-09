import {
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  isAddress,
  zeroAddress,
  zeroHash,
  type Hex,
} from "viem";
import {
  assertRedemptionJobIntegrity,
  type FAssetsRedemptionClient,
  type RedemptionJobV1,
  type RedemptionRequestReceiptV1,
  type RedemptionRequestedEventV1,
} from "./redemption.js";

const MAX_UINT32 = (1n << 32n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;

export const COSTON2_REDEMPTION_CHAIN_ID = 114n;

/** The public ERC-20 calls needed before an AssetManager redemption. */
export const FASSET_REDEMPTION_ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "allowance", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

/** The official Coston2 AssetManager redemption calls. */
export const FASSET_REDEMPTION_ASSET_MANAGER_ABI = [
  {
    type: "function",
    name: "fAsset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "asset", type: "address" }],
  },
  {
    type: "function",
    name: "minimumRedeemAmountUBA",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "minimumAmountUBA", type: "uint256" }],
  },
  {
    type: "function",
    name: "redeemAmount",
    stateMutability: "payable",
    inputs: [
      { name: "amountUBA", type: "uint256" },
      { name: "redeemerUnderlyingAddressString", type: "string" },
      { name: "executor", type: "address" },
    ],
    outputs: [{ name: "redeemedAmountUBA", type: "uint256" }],
  },
  {
    type: "function",
    name: "redeemWithTag",
    stateMutability: "payable",
    inputs: [
      { name: "amountUBA", type: "uint256" },
      { name: "redeemerUnderlyingAddressString", type: "string" },
      { name: "executor", type: "address" },
      { name: "destinationTag", type: "uint256" },
    ],
    outputs: [{ name: "redeemedAmountUBA", type: "uint256" }],
  },
] as const;

/** Official public event fields used to create a redemption checkpoint. */
export const FASSET_REDEMPTION_EVENTS_ABI = [
  {
    type: "event",
    name: "RedemptionRequested",
    anonymous: false,
    inputs: [
      { name: "agentVault", type: "address", indexed: true },
      { name: "redeemer", type: "address", indexed: true },
      { name: "requestId", type: "uint256", indexed: true },
      { name: "paymentAddress", type: "string", indexed: false },
      { name: "valueUBA", type: "uint256", indexed: false },
      { name: "feeUBA", type: "uint256", indexed: false },
      { name: "firstUnderlyingBlock", type: "uint256", indexed: false },
      { name: "lastUnderlyingBlock", type: "uint256", indexed: false },
      { name: "lastUnderlyingTimestamp", type: "uint256", indexed: false },
      { name: "paymentReference", type: "bytes32", indexed: false },
      { name: "executor", type: "address", indexed: false },
      { name: "executorFeeNatWei", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RedemptionWithTagRequested",
    anonymous: false,
    inputs: [
      { name: "agentVault", type: "address", indexed: true },
      { name: "redeemer", type: "address", indexed: true },
      { name: "requestId", type: "uint256", indexed: true },
      { name: "paymentAddress", type: "string", indexed: false },
      { name: "valueUBA", type: "uint256", indexed: false },
      { name: "feeUBA", type: "uint256", indexed: false },
      { name: "firstUnderlyingBlock", type: "uint256", indexed: false },
      { name: "lastUnderlyingBlock", type: "uint256", indexed: false },
      { name: "lastUnderlyingTimestamp", type: "uint256", indexed: false },
      { name: "paymentReference", type: "bytes32", indexed: false },
      { name: "executor", type: "address", indexed: false },
      { name: "executorFeeNatWei", type: "uint256", indexed: false },
      { name: "destinationTag", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RedemptionAmountIncomplete",
    anonymous: false,
    inputs: [
      { name: "redeemer", type: "address", indexed: true },
      { name: "remainingAmountUBA", type: "uint256", indexed: false },
    ],
  },
] as const;

export interface Coston2RedemptionCallIntentV1 {
  assetManager: Hex;
  fAsset: Hex;
  redeemer: Hex;
  method: "AMOUNT" | "WITH_TAG";
  requestedAmountUBA: bigint;
  paymentAddress: string;
  executor: Hex;
  destinationTag?: bigint;
  valueWei: bigint;
  calldata: Hex;
}

export interface Coston2RedemptionLogV1 {
  address: string;
  topics: readonly Hex[];
  data: Hex;
}

export interface Coston2RedemptionReceiptV1 {
  status: "success" | "reverted";
  transactionHash: Hex;
  logs: readonly Coston2RedemptionLogV1[];
}

export interface Coston2RedemptionReader {
  readContract(args: {
    address: Hex;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }): Promise<unknown>;
}

export interface Coston2RedemptionWriter {
  writeContract(args: {
    address: Hex;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
    account: Hex;
    value: bigint;
  }): Promise<Hex>;
  waitForTransactionReceipt(args: { hash: Hex }): Promise<Coston2RedemptionReceiptV1>;
}

function validUint(value: unknown, max = MAX_UINT256): value is bigint {
  return typeof value === "bigint" && value >= 0n && value <= max;
}

function address(value: unknown, label: string, allowZero = false): Hex {
  if (typeof value !== "string" || !isAddress(value) || (!allowZero && getAddress(value) === zeroAddress)) {
    throw new Error(`${label} invalid`);
  }
  return getAddress(value) as Hex;
}

function nonZeroHash(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !HEX32.test(value) || value.toLowerCase() === zeroHash) {
    throw new Error(`${label} invalid`);
  }
  return value.toLowerCase() as Hex;
}

function uint(value: unknown, label: string, max = MAX_UINT256): bigint {
  if (!validUint(value, max)) throw new Error(`${label} invalid`);
  return value;
}

function readUint(value: unknown, label: string): bigint {
  return uint(value, label);
}

function asArgs(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("redemption event args invalid");
  return value as Record<string, unknown>;
}

function decodeTopics(topics: readonly Hex[]): [] | [Hex, ...Hex[]] {
  if (topics.length === 0) return [];
  return [topics[0]!, ...topics.slice(1)] as [Hex, ...Hex[]];
}

function redemptionEventAbi(eventName: "RedemptionRequested" | "RedemptionWithTagRequested") {
  return FASSET_REDEMPTION_EVENTS_ABI.filter((event) => event.name === eventName);
}

function decodeRedemptionLog(log: Coston2RedemptionLogV1): { eventName: "RedemptionRequested" | "RedemptionWithTagRequested"; args: Record<string, unknown> } | undefined {
  for (const eventName of ["RedemptionRequested", "RedemptionWithTagRequested"] as const) {
    try {
      const decoded = decodeEventLog({ abi: redemptionEventAbi(eventName), data: log.data, topics: decodeTopics(log.topics) });
      return { eventName, args: asArgs(decoded.args) };
    } catch {
      // This log belongs to another event; keep scanning the receipt.
    }
  }
  return undefined;
}

function incompleteAmount(log: Coston2RedemptionLogV1): { redeemer: Hex; remainingAmountUBA: bigint } | undefined {
  try {
    const decoded = decodeEventLog({
      abi: FASSET_REDEMPTION_EVENTS_ABI.filter((event) => event.name === "RedemptionAmountIncomplete"),
      data: log.data,
      topics: decodeTopics(log.topics),
    });
    const args = asArgs(decoded.args);
    return {
      redeemer: address(args.redeemer, "incomplete redeemer"),
      remainingAmountUBA: readUint(args.remainingAmountUBA, "remaining amount"),
    };
  } catch {
    return undefined;
  }
}

function mapRequestedEvent(
  job: RedemptionJobV1,
  eventName: "RedemptionRequested" | "RedemptionWithTagRequested",
  args: Record<string, unknown>,
): RedemptionRequestedEventV1 {
  const requestedRedeemer = address(args.redeemer, "redemption redeemer");
  if (requestedRedeemer !== getAddress(job.redeemer)) throw new Error("redemption receipt redeemer drift");
  const destinationTag = eventName === "RedemptionWithTagRequested"
    ? uint(args.destinationTag, "destination tag", MAX_UINT32)
    : undefined;
  if (job.method === "WITH_TAG" && destinationTag !== job.destinationTag) throw new Error("redemption receipt tag drift");
  if (job.method === "AMOUNT" && destinationTag !== undefined) throw new Error("redemption receipt tag drift");
  const event: RedemptionRequestedEventV1 = {
    agentVault: address(args.agentVault, "agent vault"),
    redeemer: requestedRedeemer,
    requestId: uint(args.requestId, "request id", (1n << 64n) - 1n),
    paymentAddress: typeof args.paymentAddress === "string" ? args.paymentAddress : "",
    valueUBA: readUint(args.valueUBA, "redemption value"),
    feeUBA: readUint(args.feeUBA, "redemption fee"),
    firstUnderlyingBlock: uint(args.firstUnderlyingBlock, "first underlying block", (1n << 64n) - 1n),
    lastUnderlyingBlock: uint(args.lastUnderlyingBlock, "last underlying block", (1n << 64n) - 1n),
    lastUnderlyingTimestamp: uint(args.lastUnderlyingTimestamp, "last underlying timestamp", (1n << 64n) - 1n),
    paymentReference: nonZeroHash(args.paymentReference, "payment reference"),
    executor: address(args.executor, "redemption executor", true),
    executorFeeNatWei: readUint(args.executorFeeNatWei, "executor fee"),
    ...(destinationTag === undefined ? {} : { destinationTag }),
  };
  if (event.paymentAddress !== job.paymentAddress) throw new Error("redemption receipt payment address drift");
  return event;
}

/**
 * Build the exact AssetManager redemption calldata. This is a pure boundary:
 * it neither approves tokens nor signs or broadcasts a transaction.
 */
export function buildCoston2RedemptionCall(input: {
  job: RedemptionJobV1;
  fAsset: string;
  valueWei?: bigint;
}): Coston2RedemptionCallIntentV1 {
  assertRedemptionJobIntegrity(input.job);
  const fAsset = address(input.fAsset, "FAsset");
  if (fAsset !== getAddress(input.job.fAsset)) throw new Error("FAsset intent drift");
  const valueWei = input.valueWei ?? 0n;
  if (!validUint(valueWei)) throw new Error("redemption value invalid");
  const assetManager = address(input.job.assetManager, "AssetManager");
  const redeemer = address(input.job.redeemer, "redeemer");
  const executor = address(input.job.executor, "executor", true);
  const requestedAmountUBA = uint(input.job.requestedAmountUBA, "redemption amount");
  if (input.job.method === "WITH_TAG") {
    if (input.job.destinationTag === undefined || !validUint(input.job.destinationTag, MAX_UINT32)) {
      throw new Error("destination tag invalid");
    }
    return {
      assetManager,
      fAsset,
      redeemer,
      method: input.job.method,
      requestedAmountUBA,
      paymentAddress: input.job.paymentAddress,
      executor,
      destinationTag: input.job.destinationTag,
      valueWei,
      calldata: encodeFunctionData({
        abi: FASSET_REDEMPTION_ASSET_MANAGER_ABI,
        functionName: "redeemWithTag",
        args: [requestedAmountUBA, input.job.paymentAddress, executor, input.job.destinationTag],
      }),
    };
  }
  return {
    assetManager,
    fAsset,
    redeemer,
    method: input.job.method,
    requestedAmountUBA,
    paymentAddress: input.job.paymentAddress,
    executor,
    valueWei,
    calldata: encodeFunctionData({
      abi: FASSET_REDEMPTION_ASSET_MANAGER_ABI,
      functionName: "redeemAmount",
      args: [requestedAmountUBA, input.job.paymentAddress, executor],
    }),
  };
}

/** Parse only AssetManager logs and preserve partial redemption as a public checkpoint. */
export function parseCoston2RedemptionReceipt(input: {
  job: RedemptionJobV1;
  receipt: Coston2RedemptionReceiptV1;
}): RedemptionRequestReceiptV1 {
  assertRedemptionJobIntegrity(input.job);
  if (input.job.state !== "CREATED" || input.receipt.status !== "success" || !HEX32.test(input.receipt.transactionHash)
    || input.receipt.transactionHash.toLowerCase() === zeroHash) throw new Error("redemption receipt unavailable");
  const assetManager = getAddress(input.job.assetManager);
  const requests: RedemptionRequestedEventV1[] = [];
  let remainingFromEvent: bigint | undefined;
  for (const log of input.receipt.logs) {
    if (!isAddress(log.address) || getAddress(log.address) !== assetManager) continue;
    const decoded = decodeRedemptionLog(log);
    if (decoded) requests.push(mapRequestedEvent(input.job, decoded.eventName, decoded.args));
    const incomplete = incompleteAmount(log);
    if (incomplete) {
      if (incomplete.redeemer !== getAddress(input.job.redeemer)) throw new Error("redemption incomplete redeemer drift");
      if (remainingFromEvent !== undefined) throw new Error("redemption incomplete event duplicate");
      remainingFromEvent = incomplete.remainingAmountUBA;
    }
  }
  if (requests.length === 0) throw new Error("redemption request event missing");
  let redeemedAmountUBA = 0n;
  const requestIds = new Set<string>();
  const paymentReferences = new Set<string>();
  const agentVaults = new Set<string>();
  for (const request of requests) {
    if (requestIds.has(request.requestId.toString()) || paymentReferences.has(request.paymentReference.toLowerCase())
      || agentVaults.has(getAddress(request.agentVault))) throw new Error("redemption receipt duplicate leg");
    requestIds.add(request.requestId.toString());
    paymentReferences.add(request.paymentReference.toLowerCase());
    agentVaults.add(getAddress(request.agentVault));
    redeemedAmountUBA += request.valueUBA;
  }
  if (redeemedAmountUBA > input.job.requestedAmountUBA) throw new Error("redemption receipt amount overflow");
  const remainingAmountUBA = remainingFromEvent ?? input.job.requestedAmountUBA - redeemedAmountUBA;
  if (!validUint(remainingAmountUBA) || redeemedAmountUBA + remainingAmountUBA !== input.job.requestedAmountUBA) {
    throw new Error("redemption receipt amount drift");
  }
  return {
    status: "REQUESTED",
    transactionHash: input.receipt.transactionHash.toLowerCase() as Hex,
    assetManager,
    fAsset: getAddress(input.job.fAsset),
    redeemer: getAddress(input.job.redeemer),
    requestedAmountUBA: input.job.requestedAmountUBA,
    redeemedAmountUBA,
    remainingAmountUBA,
    requests,
  };
}

function readAddress(value: unknown, label: string): Hex {
  return address(value, label);
}

function readBalance(value: unknown, label: string): bigint {
  return uint(value, label);
}

/**
 * Construct a writer-backed client while keeping credentials outside this
 * package. The injected writer may be a wallet client, but this boundary never
 * accepts or persists a private key.
 */
export function createCoston2FAssetsRedemptionClient(input: {
  reader: Coston2RedemptionReader;
  writer: Coston2RedemptionWriter;
  account: string;
  chainId: bigint;
  redemptionValueWei?: bigint;
}): FAssetsRedemptionClient {
  const account = readAddress(input.account, "redemption account");
  if (input.chainId !== COSTON2_REDEMPTION_CHAIN_ID) throw new Error("redemption chain invalid");
  const redemptionValueWei = input.redemptionValueWei ?? 0n;
  if (!validUint(redemptionValueWei)) throw new Error("redemption value invalid");
  return {
    requestRedemption: async (job) => {
      assertRedemptionJobIntegrity(job);
      if (job.state !== "CREATED" || getAddress(job.redeemer) !== account) throw new Error("redemption signer drift");
      const assetManager = readAddress(job.assetManager, "AssetManager");
      const fAsset = readAddress(job.fAsset, "FAsset");
      const configuredAsset = readAddress(await input.reader.readContract({
        address: assetManager,
        abi: FASSET_REDEMPTION_ASSET_MANAGER_ABI,
        functionName: "fAsset",
        args: [],
      }), "runtime FAsset");
      if (configuredAsset !== fAsset) throw new Error("runtime FAsset drift");
      const minimum = readBalance(await input.reader.readContract({
        address: assetManager,
        abi: FASSET_REDEMPTION_ASSET_MANAGER_ABI,
        functionName: "minimumRedeemAmountUBA",
        args: [],
      }), "minimum redemption amount");
      if (minimum === 0n) throw new Error("minimum redemption amount invalid");
      if (job.requestedAmountUBA < minimum) throw new Error("redemption amount below runtime minimum");
      const balance = readBalance(await input.reader.readContract({
        address: fAsset,
        abi: FASSET_REDEMPTION_ERC20_ABI,
        functionName: "balanceOf",
        args: [account],
      }), "FAsset balance");
      if (balance < job.requestedAmountUBA) throw new Error("FAsset balance insufficient");
      const allowance = readBalance(await input.reader.readContract({
        address: fAsset,
        abi: FASSET_REDEMPTION_ERC20_ABI,
        functionName: "allowance",
        args: [account, assetManager],
      }), "FAsset allowance");
      if (allowance < job.requestedAmountUBA) {
        const approvalHash = await input.writer.writeContract({
          address: fAsset,
          abi: FASSET_REDEMPTION_ERC20_ABI,
          functionName: "approve",
          args: [assetManager, job.requestedAmountUBA],
          account,
          value: 0n,
        });
        const approvalReceipt = await input.writer.waitForTransactionReceipt({ hash: approvalHash });
        if (approvalReceipt.status !== "success"
          || approvalReceipt.transactionHash.toLowerCase() !== approvalHash.toLowerCase()) throw new Error("FAsset approval failed");
        const postApprovalAllowance = readBalance(await input.reader.readContract({
          address: fAsset,
          abi: FASSET_REDEMPTION_ERC20_ABI,
          functionName: "allowance",
          args: [account, assetManager],
        }), "post-approval allowance");
        if (postApprovalAllowance < job.requestedAmountUBA) throw new Error("FAsset approval drift");
      }
      const call = buildCoston2RedemptionCall({ job, fAsset, valueWei: redemptionValueWei });
      const redemptionHash = await input.writer.writeContract({
        address: assetManager,
        abi: FASSET_REDEMPTION_ASSET_MANAGER_ABI,
        functionName: job.method === "WITH_TAG" ? "redeemWithTag" : "redeemAmount",
        args: job.method === "WITH_TAG"
          ? [job.requestedAmountUBA, job.paymentAddress, getAddress(job.executor), job.destinationTag!]
          : [job.requestedAmountUBA, job.paymentAddress, getAddress(job.executor)],
        account,
        value: redemptionValueWei,
      });
      const redemptionReceipt = await input.writer.waitForTransactionReceipt({ hash: redemptionHash });
      if (redemptionReceipt.transactionHash.toLowerCase() !== redemptionHash.toLowerCase()) throw new Error("redemption transaction drift");
      return parseCoston2RedemptionReceipt({ job, receipt: redemptionReceipt });
    },
  };
}
