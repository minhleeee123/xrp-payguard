import {
  PayGuardActionRouterAbi,
  PayGuardPolicyRegistryV2Abi,
  PayGuardVaultAbi,
} from "@xrp-payguard/bindings";
import {
  payeeReceiptHash,
  buildPublicNotificationFeed,
  PUBLIC_NOTIFICATION_V1,
  publicNotificationHash,
  publicNotificationReadState,
  publicPayeeReadState,
  publicRequestReadState,
  unavailablePayeeState,
  type PublicPayeeReadState,
  type PublicNotificationReadState,
  type PublicNotificationKind,
  type PublicRequestReadState,
  type PublicRequestSnapshotV1,
} from "@xrp-payguard/integrations";
import { REASON_CODE, type PublicReasonClass } from "@xrp-payguard/protocol";
import {
  createWalletClient,
  createPublicClient,
  custom,
  decodeEventLog,
  encodeAbiParameters,
  erc20Abi,
  getAddress,
  http,
  keccak256,
  parseUnits,
  stringToHex,
  zeroHash,
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from "viem";

export const COSTON2_CHAIN = {
  id: 114,
  name: "Flare Testnet Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
  blockExplorers: {
    default: { name: "Coston2 Explorer", url: "https://coston2-explorer.flare.network" },
  },
  testnet: true,
} as const;

export const COSTON2_CHAIN_HEX = "0x72";

export const PAYGUARD_COSTON2 = {
  registry: getAddress("0xbB89d68Efd3994CD688816c175343511bA5c0E88"),
  vault: getAddress("0xe8f5b30F9adCea6b8532bFbD65f804E771520214"),
  router: getAddress("0x452988f04bE9602EC0CEB0239EBA5Fe60d8988D3"),
  asset: getAddress("0x0b6A3645c240605887a5532109323A3E12273dc7"),
  runtimeCodeHashes: {
    registry: "0x1ed44c1bdb9df8d47f81cb1e1d80a699799236e17a2251dd08ec9d1b93244f8d",
    vault: "0x5971e2ef67c18d4c9365aec05e063c65a484617f70a5e7ffde792e0dcd7cc006",
    router: "0x5c33c9e11ab8a2e4a4ff56a6ea4d0774e302146c32dcf3325b9341aa0160915f",
  },
  registryVersion: "V2",
  deploymentProfile: "COSTON2_SIMULATED_V2",
} as const;

export const PAYGUARD_COSTON2_V1 = {
  registry: getAddress("0x8DFb2D7D7a2608Ee7Cd78983fbe28cCE00e1D4A4"),
  vault: getAddress("0xFFe7522075412B2eBA5b8B91c9aA4E1c2c6f84dB"),
  router: getAddress("0x28A969018975Fb40aEd0BfA98f6d1c3023B6a7Da"),
  asset: getAddress("0x0b6A3645c240605887a5532109323A3E12273dc7"),
  runtimeCodeHashes: {
    registry: "0x9039caae6a89275071518b45a6261d8441699ac880c505a06ca44f30a7c89824",
    vault: "0x5971e2ef67c18d4c9365aec05e063c65a484617f70a5e7ffde792e0dcd7cc006",
    router: "0x52045b152d1f6e9c2818712faea445969f6a3a3d87470f432abd2c23e882e0bb",
  },
} as const;

export interface Eip1193Provider {
  request(args: { method: string; params?: readonly unknown[] | object }): Promise<unknown>;
  on?(event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void): void;
  removeListener?(event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void): void;
}

export type WalletFailure = "NO_PROVIDER" | "USER_REJECTED" | "WRONG_CHAIN" | "PROVIDER_ERROR";

export class WalletConnectionError extends Error {
  readonly reason: WalletFailure;

  constructor(reason: WalletFailure) {
    super(reason);
    this.name = "WalletConnectionError";
    this.reason = reason;
  }
}

export interface WalletSession {
  account: Address;
  chainId: number;
}

export interface VaultAccounting {
  deposited: bigint;
  available: bigint;
  reserved: bigint;
  spent: bigint;
  withdrawn: bigint;
  refunded: bigint;
}

export interface Coston2AccountSnapshot {
  account: Address;
  finalizedBlock: bigint;
  finalizedAt: bigint;
  nativeBalance: bigint;
  tokenBalance: bigint;
  vaultAllowance: bigint;
  accounting: VaultAccounting;
  token: { name: string; symbol: "FTestXRP"; decimals: 6 };
  contracts: {
    runtimeVerified: true;
    supportedAsset: true;
    vaultRouter: Address;
    routerRegistry: Address;
    routerVault: Address;
  };
}

export type VaultTransactionKind = "APPROVE" | "DEPOSIT" | "WITHDRAW";
export type VaultUserAction = "DEPOSIT" | "WITHDRAW";
export type VaultTransactionFailure =
  | "INPUT_INVALID"
  | "INSUFFICIENT_TOKEN_BALANCE"
  | "ALLOWANCE_REQUIRED"
  | "INSUFFICIENT_VAULT_BALANCE"
  | "USER_REJECTED"
  | "TRANSACTION_REVERTED"
  | "EVENT_MISMATCH"
  | "POSTCONDITION_FAILED"
  | "PROVIDER_ERROR";

export class VaultTransactionError extends Error {
  readonly reason: VaultTransactionFailure;

  constructor(reason: VaultTransactionFailure) {
    super(reason);
    this.name = "VaultTransactionError";
    this.reason = reason;
  }
}

export interface VaultTransactionResult {
  kind: VaultTransactionKind;
  amount: bigint;
  hash: Hash;
  blockNumber: bigint;
  before: Coston2AccountSnapshot;
  after: Coston2AccountSnapshot;
}

export interface VaultReceiptLog {
  address: Address;
  data: Hex;
  topics: [] | [Hex, ...Hex[]];
}

export interface ReviewedRequestExample {
  id: Hex;
  label: string;
  expectedStatus: "PENDING" | "CANCELLED" | "DENIED" | "EXECUTED";
  recordedBlock: bigint;
  referenceTransaction: Hash;
  description: string;
}

// These are previously created public Coston2 test requests, not activity from
// the connected wallet. Every selection is re-read from finalized V2 state.
// The earlier XRPL/FDC request belongs to the retained V1 rollback router and
// must not be offered by the active V2 reader.
export const REVIEWED_REQUEST_EXAMPLES = [
  {
    id: "0x44971c87c62da24955575c508ed0430b4b584994a512fb9848d633b6ce79cc1d",
    label: "Pending · previously created",
    expectedStatus: "PENDING",
    recordedBlock: 33941308n,
    referenceTransaction: "0x80d4921aa25e21a5b12b94acfea71fa51f31eb09387387bf0b37eaeb1c6c34dd",
    description: "Created in an earlier V2 test run and deliberately left pending. No threshold decision or payment is asserted.",
  },
  {
    id: "0x6eef68755dab92c53144a5f8031cbd2ac96a62be9df672af7263cfa8cf7efc2b",
    label: "Cancelled · previously cancelled",
    expectedStatus: "CANCELLED",
    recordedBlock: 33941321n,
    referenceTransaction: "0x28edbafb94b4761da2e1fb92adda9714ff407fe00a4482d2df323673901c151f",
    description: "Created and cancelled in an earlier V2 test run. It cannot be evaluated or executed.",
  },
  {
    id: "0x43b3edbe3ab3b2353f7df3a406bb23416c2051e4cd8e03552e3213a5249b8e6b",
    label: "Denied · previously denied",
    expectedStatus: "DENIED",
    recordedBlock: 33975752n,
    referenceTransaction: "0x4a4e02379b397e4a602e158a0ea4a9d17674601dec9c6fb8b3f1135248f78a06",
    description: "Created and denied with CAP_EXCEEDED in the reviewed hosted V2 lifecycle. No payment occurred.",
  },
  {
    id: "0x16273aab0102394706c627fd833ca235e352b164679efcde74efeb15c24aa907",
    label: "Executed · previously executed",
    expectedStatus: "EXECUTED",
    recordedBlock: 33975743n,
    referenceTransaction: "0x7a6361089680cd43e55d7da012ad7b14f3921c3f7a53be37e9f0a26e4f111e26",
    description: "Created, threshold-approved and executed in the reviewed hosted V2 lifecycle. Payee settlement still requires its exact receipt proof.",
  },
] as const satisfies readonly ReviewedRequestExample[];

export const REVIEWED_V2_REQUEST_ID = REVIEWED_REQUEST_EXAMPLES[0].id;

export interface Coston2PublicRequestResult {
  request: PublicRequestReadState;
  payee: PublicPayeeReadState;
  finalizedBlock: bigint;
  finalizedAt: bigint;
  policyOwner: Address;
}

export type RequestTransactionKind = "EXECUTE" | "EXPIRE" | "CANCEL";
export type RequestTransactionFailure = "INVALID_STATE" | "NOT_AUTHORIZED" | "USER_REJECTED" | "TRANSACTION_REVERTED" | "EVENT_MISMATCH" | "POSTCONDITION_FAILED" | "PROVIDER_ERROR";

export class RequestTransactionError extends Error {
  readonly reason: RequestTransactionFailure;

  constructor(reason: RequestTransactionFailure) {
    super(reason);
    this.name = "RequestTransactionError";
    this.reason = reason;
  }
}

export interface RequestTransactionResult {
  kind: RequestTransactionKind;
  hash: Hash;
  blockNumber: bigint;
  after: Coston2PublicRequestResult;
}

export interface RuntimeCodeHashes {
  registry: Hex;
  vault: Hex;
  router: Hex;
}

interface FinalizedBlock {
  number: bigint | null;
  timestamp: bigint;
}

export interface Coston2ReadClient {
  getBlock(args: { blockTag: "finalized" }): Promise<FinalizedBlock>;
  getBytecode(args: { address: Address; blockNumber: bigint }): Promise<Hex | undefined>;
  getBalance(args: { address: Address; blockNumber: bigint }): Promise<bigint>;
  readContract(args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    blockNumber: bigint;
  }): Promise<unknown>;
}

const publicClient = createPublicClient({
  chain: COSTON2_CHAIN,
  transport: http(COSTON2_CHAIN.rpcUrls.default.http[0], { retryCount: 2, timeout: 15_000 }),
});

const REQUEST_STATUSES = ["NONE", "PENDING", "ALLOWED", "DENIED", "EXECUTED", "EXPIRED", "CANCELLED"] as const;
const REASON_BY_CODE = new Map<number, PublicReasonClass>(
  Object.entries(REASON_CODE).map(([reason, code]) => [code, reason as PublicReasonClass]),
);

export function parseRequestId(value: string): Hex {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized) || normalized === zeroHash) throw new Error("REQUEST_ID_INVALID");
  return normalized as Hex;
}

export async function loadCoston2PublicRequest(
  input: string,
  client: Coston2ReadClient = publicClient as unknown as Coston2ReadClient,
  runtimeCodeHashes: RuntimeCodeHashes = PAYGUARD_COSTON2.runtimeCodeHashes,
): Promise<Coston2PublicRequestResult> {
  const requestId = parseRequestId(input);
  const block = await client.getBlock({ blockTag: "finalized" });
  if (block.number === null || block.number <= 0n || block.timestamp <= 0n) throw new Error("FINALIZED_BLOCK_UNAVAILABLE");
  const blockNumber = block.number;
  await verifyRuntimeCode(client, blockNumber, runtimeCodeHashes);
  const read = (address: Address, abi: readonly unknown[], functionName: string, args?: readonly unknown[]): Promise<unknown> =>
    client.readContract({ address, abi, functionName, ...(args ? { args } : {}), blockNumber });
  // The official credential-free RPC is rate limited, so keep this wallet-free
  // checkpoint deterministic and avoid a burst of parallel eth_call requests.
  const stored = await read(PAYGUARD_COSTON2.router, PayGuardActionRouterAbi, "getRequest", [requestId]);
  const routerRegistry = await read(PAYGUARD_COSTON2.router, PayGuardActionRouterAbi, "registry");
  const routerVault = await read(PAYGUARD_COSTON2.router, PayGuardActionRouterAbi, "vault");
  if (parseAddress(routerRegistry, "ROUTER_REGISTRY_INVALID") !== PAYGUARD_COSTON2.registry
    || parseAddress(routerVault, "ROUTER_VAULT_INVALID") !== PAYGUARD_COSTON2.vault) {
    throw new Error("CONTRACT_WIRING_MISMATCH");
  }
  const snapshot = parseStoredRequest(stored);
  if (snapshot.requestId.toLowerCase() !== requestId) throw new Error("REQUEST_ID_MISMATCH");
  if (snapshot.chainId !== BigInt(COSTON2_CHAIN.id)
    || getAddress(snapshot.registry) !== PAYGUARD_COSTON2.registry
    || getAddress(snapshot.vault) !== PAYGUARD_COSTON2.vault
    || getAddress(snapshot.router) !== PAYGUARD_COSTON2.router
    || getAddress(snapshot.asset) !== PAYGUARD_COSTON2.asset) {
    throw new Error("REQUEST_DOMAIN_MISMATCH");
  }
  const policy = await read(PAYGUARD_COSTON2.registry, PayGuardPolicyRegistryV2Abi, "getPolicy", [snapshot.policyCommitment]);
  const binding = tupleField(policy, "binding", 0);
  const policyOwner = parseAddress(tupleField(binding, "owner", 4), "POLICY_OWNER_INVALID");
  if (parseUint(tupleField(binding, "chainId", 0), "POLICY_CHAIN_INVALID") !== snapshot.chainId
    || parseAddress(tupleField(binding, "registry", 1), "POLICY_REGISTRY_INVALID") !== PAYGUARD_COSTON2.registry
    || parseAddress(tupleField(binding, "vault", 2), "POLICY_VAULT_INVALID") !== PAYGUARD_COSTON2.vault
    || parseAddress(tupleField(binding, "router", 3), "POLICY_ROUTER_INVALID") !== PAYGUARD_COSTON2.router
    || parseBytes32(tupleField(binding, "policyId", 5), "POLICY_ID_INVALID") !== snapshot.policyId
    || parseSmallUint(tupleField(binding, "policyVersion", 6), "POLICY_VERSION_INVALID") !== snapshot.policyVersion
    || parseBytes32(tupleField(binding, "policyCommitment", 7), "POLICY_COMMITMENT_INVALID") !== snapshot.policyCommitment) {
    throw new Error("POLICY_DOMAIN_MISMATCH");
  }
  const request = publicRequestReadState(snapshot, block.timestamp);
  return {
    request,
    payee: derivePayeeReadState(snapshot),
    finalizedBlock: blockNumber,
    finalizedAt: block.timestamp,
    policyOwner,
  };
}

export function validateRequestTransaction(
  kind: RequestTransactionKind,
  account: Address,
  request: PublicRequestSnapshotV1,
  policyOwner: Address,
  now: bigint,
): void {
  if (kind === "EXECUTE") {
    if (request.status !== "ALLOWED" || request.approvedDigest === zeroHash || now > request.approvedExpiry) {
      throw new RequestTransactionError("INVALID_STATE");
    }
    return;
  }
  if (kind === "EXPIRE") {
    if ((request.status !== "PENDING" && request.status !== "ALLOWED") || now <= request.expiry) {
      throw new RequestTransactionError("INVALID_STATE");
    }
    return;
  }
  if (request.status !== "PENDING" && request.status !== "ALLOWED") throw new RequestTransactionError("INVALID_STATE");
  if (account.toLowerCase() !== request.requester.toLowerCase() && account.toLowerCase() !== policyOwner.toLowerCase()) {
    throw new RequestTransactionError("NOT_AUTHORIZED");
  }
}

export async function executeRequestTransaction(
  kind: RequestTransactionKind,
  input: string,
  account: Address,
  provider: Eip1193Provider | null,
): Promise<RequestTransactionResult> {
  if (!provider) throw new RequestTransactionError("PROVIDER_ERROR");
  const before = await loadCoston2PublicRequest(input);
  if (before.request.status === "UNAVAILABLE") throw new RequestTransactionError("INVALID_STATE");
  validateRequestTransaction(kind, account, before.request.snapshot, before.policyOwner, before.finalizedAt);
  const functionName = kind === "EXECUTE" ? "execute" : kind === "EXPIRE" ? "expire" : "cancel";
  const wallet = createWalletClient({ account, chain: COSTON2_CHAIN, transport: custom(provider) });
  let hash: Hash;
  try {
    const { request } = await publicClient.simulateContract({
      account,
      address: PAYGUARD_COSTON2.router,
      abi: PayGuardActionRouterAbi,
      functionName,
      args: [before.request.snapshot.requestId],
    });
    hash = await wallet.writeContract(request);
  } catch (error) {
    if (hasProviderErrorCode(error, 4001)) throw new RequestTransactionError("USER_REJECTED");
    throw new RequestTransactionError("PROVIDER_ERROR");
  }
  const receipt = await waitForFinalizedReceipt(hash, (reason) => new RequestTransactionError(reason));
  verifyRequestReceiptEvent(kind, before.request.snapshot, receipt.logs);
  const after = await loadCoston2PublicRequest(input);
  if (after.request.status === "UNAVAILABLE") throw new RequestTransactionError("POSTCONDITION_FAILED");
  verifyRequestPostcondition(kind, before.request.snapshot, after.request.snapshot);
  return { kind, hash, blockNumber: receipt.blockNumber, after };
}

export function requestTransactionFailureMessage(reason: RequestTransactionFailure): string {
  if (reason === "INVALID_STATE") return "The finalized request state does not permit this action.";
  if (reason === "NOT_AUTHORIZED") return "Only the request creator or policy owner can cancel this request.";
  if (reason === "USER_REJECTED") return "The wallet request was cancelled. No router success is being asserted.";
  if (reason === "TRANSACTION_REVERTED") return "The Coston2 router transaction reverted.";
  if (reason === "EVENT_MISMATCH") return "The receipt did not contain the exact expected router event.";
  if (reason === "POSTCONDITION_FAILED") return "The finalized router state did not match the submitted action.";
  return "The wallet or Coston2 provider could not complete the router transaction safely.";
}

export function notificationStateFromRequest(result: Coston2PublicRequestResult): PublicNotificationReadState {
  if (result.request.status === "UNAVAILABLE") throw new Error("REQUEST_NOTIFICATION_UNAVAILABLE");
  const request = result.request.snapshot;
  const kind: PublicNotificationKind = request.status === "ALLOWED" ? "REQUEST_READY"
    : request.status === "DENIED" ? "REQUEST_DENIED"
      : request.status === "EXECUTED" ? "REQUEST_EXECUTED"
        : request.status === "EXPIRED" ? "REQUEST_EXPIRED" : "EVIDENCE_VERIFIED";
  const requestKind = kind !== "EVIDENCE_VERIFIED";
  const body = {
    chainId: request.chainId,
    eventId: keccak256(encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint64" }, { type: "bytes32" }],
      [request.requestHash, result.finalizedBlock, keccak256(stringToHex(kind))],
    )),
    kind,
    severity: kind === "REQUEST_DENIED" || kind === "REQUEST_EXPIRED" ? "WARNING" as const : "INFO" as const,
    reference: request.requestHash,
    requestId: requestKind ? request.requestId : zeroHash,
    blockNumber: result.finalizedBlock,
    observedAt: result.finalizedAt,
  };
  const notification = { ...body, schema: PUBLIC_NOTIFICATION_V1, notificationHash: publicNotificationHash(body) };
  const feed = buildPublicNotificationFeed({ chainId: request.chainId, generatedAt: result.finalizedAt, notifications: [notification] });
  return publicNotificationReadState(feed);
}

export function parseFTestXrpAmount(value: string): bigint {
  const normalized = value.trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(normalized)) throw new VaultTransactionError("INPUT_INVALID");
  let amount: bigint;
  try { amount = parseUnits(normalized, 6); } catch { throw new VaultTransactionError("INPUT_INVALID"); }
  if (amount <= 0n) throw new VaultTransactionError("INPUT_INVALID");
  return amount;
}

export function validateVaultTransaction(kind: VaultTransactionKind, amount: bigint, snapshot: Coston2AccountSnapshot): void {
  if (amount <= 0n) throw new VaultTransactionError("INPUT_INVALID");
  if ((kind === "APPROVE" || kind === "DEPOSIT") && amount > snapshot.tokenBalance) {
    throw new VaultTransactionError("INSUFFICIENT_TOKEN_BALANCE");
  }
  if (kind === "DEPOSIT" && amount > snapshot.vaultAllowance) throw new VaultTransactionError("ALLOWANCE_REQUIRED");
  if (kind === "WITHDRAW" && amount > snapshot.accounting.available) throw new VaultTransactionError("INSUFFICIENT_VAULT_BALANCE");
}

export function planVaultUserAction(
  action: VaultUserAction,
  amount: bigint,
  snapshot: Coston2AccountSnapshot,
): readonly VaultTransactionKind[] {
  if (amount <= 0n) throw new VaultTransactionError("INPUT_INVALID");
  if (action === "WITHDRAW") {
    validateVaultTransaction("WITHDRAW", amount, snapshot);
    return ["WITHDRAW"];
  }
  if (amount > snapshot.tokenBalance) throw new VaultTransactionError("INSUFFICIENT_TOKEN_BALANCE");
  return snapshot.vaultAllowance < amount ? ["APPROVE", "DEPOSIT"] : ["DEPOSIT"];
}

export function verifyVaultPostcondition(
  kind: VaultTransactionKind,
  amount: bigint,
  before: Coston2AccountSnapshot,
  after: Coston2AccountSnapshot,
): void {
  if (before.account.toLowerCase() !== after.account.toLowerCase() || after.finalizedBlock < before.finalizedBlock) {
    throw new VaultTransactionError("POSTCONDITION_FAILED");
  }
  if (kind === "APPROVE") {
    if (after.vaultAllowance !== amount || after.tokenBalance !== before.tokenBalance || !sameAccounting(before.accounting, after.accounting)) {
      throw new VaultTransactionError("POSTCONDITION_FAILED");
    }
    return;
  }
  if (kind === "DEPOSIT") {
    if (after.tokenBalance !== before.tokenBalance - amount
      || after.accounting.deposited !== before.accounting.deposited + amount
      || after.accounting.available !== before.accounting.available + amount
      || after.accounting.reserved !== before.accounting.reserved
      || after.accounting.spent !== before.accounting.spent
      || after.accounting.withdrawn !== before.accounting.withdrawn
      || after.accounting.refunded !== before.accounting.refunded) {
      throw new VaultTransactionError("POSTCONDITION_FAILED");
    }
    return;
  }
  if (after.tokenBalance !== before.tokenBalance + amount
    || after.accounting.deposited !== before.accounting.deposited
    || after.accounting.available !== before.accounting.available - amount
    || after.accounting.reserved !== before.accounting.reserved
    || after.accounting.spent !== before.accounting.spent
    || after.accounting.withdrawn !== before.accounting.withdrawn + amount
    || after.accounting.refunded !== before.accounting.refunded) {
    throw new VaultTransactionError("POSTCONDITION_FAILED");
  }
}

export async function executeVaultTransaction(
  kind: VaultTransactionKind,
  amount: bigint,
  account: Address,
  provider: Eip1193Provider | null,
): Promise<VaultTransactionResult> {
  if (!provider) throw new VaultTransactionError("PROVIDER_ERROR");
  const before = await loadCoston2AccountSnapshot(account);
  validateVaultTransaction(kind, amount, before);
  const wallet = createWalletClient({ account, chain: COSTON2_CHAIN, transport: custom(provider) });
  let hash: Hash;
  try {
    if (kind === "APPROVE") {
      const { request } = await publicClient.simulateContract({
        account,
        address: PAYGUARD_COSTON2.asset,
        abi: erc20Abi,
        functionName: "approve",
        args: [PAYGUARD_COSTON2.vault, amount],
      });
      hash = await wallet.writeContract(request);
    } else {
      const { request } = await publicClient.simulateContract({
        account,
        address: PAYGUARD_COSTON2.vault,
        abi: PayGuardVaultAbi,
        functionName: kind === "DEPOSIT" ? "deposit" : "withdraw",
        args: kind === "DEPOSIT"
          ? [PAYGUARD_COSTON2.asset, amount, account]
          : [PAYGUARD_COSTON2.asset, amount, account],
      });
      hash = await wallet.writeContract(request);
    }
  } catch (error) {
    if (hasProviderErrorCode(error, 4001)) throw new VaultTransactionError("USER_REJECTED");
    throw new VaultTransactionError("PROVIDER_ERROR");
  }
  const receipt = await waitForFinalizedReceipt(hash);
  verifyVaultReceiptEvent(kind, amount, account, receipt.logs);
  const after = await loadCoston2AccountSnapshot(account);
  verifyVaultPostcondition(kind, amount, before, after);
  return { kind, amount, hash, blockNumber: receipt.blockNumber, before, after };
}

export function vaultTransactionFailureMessage(reason: VaultTransactionFailure): string {
  if (reason === "INPUT_INVALID") return "Enter a positive FTestXRP amount with at most 6 decimal places.";
  if (reason === "INSUFFICIENT_TOKEN_BALANCE") return "The connected wallet does not have enough finalized FTestXRP.";
  if (reason === "ALLOWANCE_REQUIRED") return "Approve at least this exact FTestXRP amount before depositing.";
  if (reason === "INSUFFICIENT_VAULT_BALANCE") return "The finalized vault available balance is lower than this withdrawal.";
  if (reason === "USER_REJECTED") return "The wallet request was cancelled. No PayGuard success is being asserted.";
  if (reason === "TRANSACTION_REVERTED") return "The Coston2 transaction reverted.";
  if (reason === "EVENT_MISMATCH") return "The receipt did not contain the exact expected public event.";
  if (reason === "POSTCONDITION_FAILED") return "The finalized post-transaction balance or conservation check did not match the intent.";
  return "The wallet or Coston2 provider could not complete the transaction safely.";
}

export function explorerTransaction(hash: Hash): string {
  return `${COSTON2_CHAIN.blockExplorers.default.url}/tx/${hash}`;
}

export function injectedProvider(value: unknown = globalThis.window): Eip1193Provider | null {
  if (typeof value !== "object" || value === null) return null;
  const provider = (value as { ethereum?: unknown }).ethereum;
  if (typeof provider !== "object" || provider === null || typeof (provider as { request?: unknown }).request !== "function") return null;
  return provider as Eip1193Provider;
}

export async function readWalletSession(provider: Eip1193Provider): Promise<WalletSession | null> {
  const [rawAccounts, rawChain] = await Promise.all([
    provider.request({ method: "eth_accounts" }),
    provider.request({ method: "eth_chainId" }),
  ]);
  const accounts = parseAccounts(rawAccounts);
  if (accounts.length === 0) return null;
  return { account: accounts[0]!, chainId: parseChainId(rawChain) };
}

export async function connectCoston2Wallet(provider: Eip1193Provider | null): Promise<WalletSession> {
  if (!provider) throw new WalletConnectionError("NO_PROVIDER");
  try {
    const accounts = parseAccounts(await provider.request({ method: "eth_requestAccounts" }));
    if (accounts.length === 0) throw new WalletConnectionError("PROVIDER_ERROR");
    let chainId = parseChainId(await provider.request({ method: "eth_chainId" }));
    if (chainId !== COSTON2_CHAIN.id) {
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: COSTON2_CHAIN_HEX }] });
      } catch (error) {
        if (providerErrorCode(error) !== 4902) throw error;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: COSTON2_CHAIN_HEX,
            chainName: COSTON2_CHAIN.name,
            nativeCurrency: COSTON2_CHAIN.nativeCurrency,
            rpcUrls: [...COSTON2_CHAIN.rpcUrls.default.http],
            blockExplorerUrls: [COSTON2_CHAIN.blockExplorers.default.url],
          }],
        });
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: COSTON2_CHAIN_HEX }] });
      }
      chainId = parseChainId(await provider.request({ method: "eth_chainId" }));
    }
    if (chainId !== COSTON2_CHAIN.id) throw new WalletConnectionError("WRONG_CHAIN");
    return { account: accounts[0]!, chainId };
  } catch (error) {
    if (error instanceof WalletConnectionError) throw error;
    if (providerErrorCode(error) === 4001) throw new WalletConnectionError("USER_REJECTED");
    throw new WalletConnectionError("PROVIDER_ERROR");
  }
}

export async function loadCoston2AccountSnapshot(
  account: Address,
  client: Coston2ReadClient = publicClient as unknown as Coston2ReadClient,
  runtimeCodeHashes: RuntimeCodeHashes = PAYGUARD_COSTON2.runtimeCodeHashes,
): Promise<Coston2AccountSnapshot> {
  const block = await client.getBlock({ blockTag: "finalized" });
  if (block.number === null || block.number <= 0n || block.timestamp <= 0n) throw new Error("FINALIZED_BLOCK_UNAVAILABLE");
  const blockNumber = block.number;
  await verifyRuntimeCode(client, blockNumber, runtimeCodeHashes);

  const read = (address: Address, abi: readonly unknown[], functionName: string, args?: readonly unknown[]): Promise<unknown> =>
    client.readContract({ address, abi, functionName, ...(args ? { args } : {}), blockNumber });
  const [nativeBalance, tokenBalance, allowance, accounting, name, symbol, decimals, supportedAsset, vaultRouter, routerRegistry, routerVault] = await Promise.all([
    client.getBalance({ address: account, blockNumber }),
    read(PAYGUARD_COSTON2.asset, erc20Abi, "balanceOf", [account]),
    read(PAYGUARD_COSTON2.asset, erc20Abi, "allowance", [account, PAYGUARD_COSTON2.vault]),
    read(PAYGUARD_COSTON2.vault, PayGuardVaultAbi, "accounting", [account, PAYGUARD_COSTON2.asset]),
    read(PAYGUARD_COSTON2.asset, erc20Abi, "name"),
    read(PAYGUARD_COSTON2.asset, erc20Abi, "symbol"),
    read(PAYGUARD_COSTON2.asset, erc20Abi, "decimals"),
    read(PAYGUARD_COSTON2.vault, PayGuardVaultAbi, "supportedAsset", [PAYGUARD_COSTON2.asset]),
    read(PAYGUARD_COSTON2.vault, PayGuardVaultAbi, "router"),
    read(PAYGUARD_COSTON2.router, PayGuardActionRouterAbi, "registry"),
    read(PAYGUARD_COSTON2.router, PayGuardActionRouterAbi, "vault"),
  ]);
  const parsedAccounting = parseAccounting(accounting);
  const parsedVaultRouter = parseAddress(vaultRouter, "VAULT_ROUTER_INVALID");
  const parsedRouterRegistry = parseAddress(routerRegistry, "ROUTER_REGISTRY_INVALID");
  const parsedRouterVault = parseAddress(routerVault, "ROUTER_VAULT_INVALID");
  if (name !== "FXRP" || symbol !== "FTestXRP" || decimals !== 6) throw new Error("ASSET_METADATA_MISMATCH");
  if (supportedAsset !== true) throw new Error("ASSET_UNSUPPORTED");
  if (parsedVaultRouter !== PAYGUARD_COSTON2.router || parsedRouterRegistry !== PAYGUARD_COSTON2.registry || parsedRouterVault !== PAYGUARD_COSTON2.vault) {
    throw new Error("CONTRACT_WIRING_MISMATCH");
  }
  return {
    account,
    finalizedBlock: blockNumber,
    finalizedAt: block.timestamp,
    nativeBalance: parseUint(nativeBalance, "NATIVE_BALANCE_INVALID"),
    tokenBalance: parseUint(tokenBalance, "TOKEN_BALANCE_INVALID"),
    vaultAllowance: parseUint(allowance, "ALLOWANCE_INVALID"),
    accounting: parsedAccounting,
    token: { name, symbol, decimals },
    contracts: {
      runtimeVerified: true,
      supportedAsset: true,
      vaultRouter: parsedVaultRouter,
      routerRegistry: parsedRouterRegistry,
      routerVault: parsedRouterVault,
    },
  };
}

export function walletFailureMessage(reason: WalletFailure): string {
  if (reason === "NO_PROVIDER") return "Install MetaMask or another injected EVM wallet to use Coston2.";
  if (reason === "USER_REJECTED") return "Wallet connection was cancelled. No account or transaction was changed.";
  if (reason === "WRONG_CHAIN") return "The wallet did not switch to Flare Coston2 (chain 114).";
  return "The wallet provider could not complete the request safely.";
}

export function coston2ReadFailureMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "FINALIZED_BLOCK_UNAVAILABLE") return "The RPC did not provide a usable finalized Coston2 block.";
  if (/^RUNTIME_(REGISTRY|VAULT|ROUTER)_MISMATCH$/.test(code)) return "A deployed PayGuard runtime no longer matches the reviewed deployment evidence.";
  if (code === "CONTRACT_WIRING_MISMATCH") return "The live registry, vault, and router wiring did not match the reviewed deployment.";
  if (code === "ASSET_METADATA_MISMATCH" || code === "ASSET_UNSUPPORTED") return "The live FTestXRP asset metadata or vault support did not match the reviewed deployment.";
  if (code === "VAULT_CONSERVATION_MISMATCH") return "The finalized vault accounting did not satisfy conservation.";
  return "The public Coston2 RPC read was unavailable or failed schema validation.";
}

export function explorerAddress(address: Address): string {
  return `${COSTON2_CHAIN.blockExplorers.default.url}/address/${address}`;
}

function parseAccounts(value: unknown): Address[] {
  if (!Array.isArray(value)) throw new WalletConnectionError("PROVIDER_ERROR");
  return value.map((entry) => {
    if (typeof entry !== "string") throw new WalletConnectionError("PROVIDER_ERROR");
    try { return getAddress(entry); } catch { throw new WalletConnectionError("PROVIDER_ERROR"); }
  });
}

function parseChainId(value: unknown): number {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) throw new WalletConnectionError("PROVIDER_ERROR");
  const parsed = Number(BigInt(value));
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new WalletConnectionError("PROVIDER_ERROR");
  return parsed;
}

function parseAddress(value: unknown, error: string): Address {
  if (typeof value !== "string") throw new Error(error);
  try { return getAddress(value); } catch { throw new Error(error); }
}

function parseUint(value: unknown, error: string): bigint {
  if (typeof value !== "bigint" || value < 0n) throw new Error(error);
  return value;
}

function parseAccounting(value: unknown): VaultAccounting {
  const fields = Array.isArray(value)
    ? value
    : typeof value === "object" && value !== null
      ? ["deposited", "available", "reserved", "spent", "withdrawn", "refunded"].map((field) => (value as Record<string, unknown>)[field])
      : [];
  if (fields.length !== 6) throw new Error("VAULT_ACCOUNTING_INVALID");
  const parsed = fields.map((entry) => parseUint(entry, "VAULT_ACCOUNTING_INVALID"));
  const [deposited, available, reserved, spent, withdrawn, refunded] = parsed;
  if (deposited === undefined || available === undefined || reserved === undefined || spent === undefined || withdrawn === undefined || refunded === undefined) {
    throw new Error("VAULT_ACCOUNTING_INVALID");
  }
  if (deposited !== available + reserved + spent + withdrawn + refunded) throw new Error("VAULT_CONSERVATION_MISMATCH");
  return { deposited, available, reserved, spent, withdrawn, refunded };
}

async function verifyRuntimeCode(client: Coston2ReadClient, blockNumber: bigint, runtimeCodeHashes: RuntimeCodeHashes): Promise<void> {
  const contractEntries = [
    ["registry", PAYGUARD_COSTON2.registry],
    ["vault", PAYGUARD_COSTON2.vault],
    ["router", PAYGUARD_COSTON2.router],
  ] as const;
  for (const [name, address] of contractEntries) {
    const runtime = await client.getBytecode({ address, blockNumber });
    if (!runtime || runtime === "0x" || keccak256(runtime).toLowerCase() !== runtimeCodeHashes[name].toLowerCase()) {
      throw new Error(`RUNTIME_${name.toUpperCase()}_MISMATCH`);
    }
  }
}

function parseStoredRequest(value: unknown): PublicRequestSnapshotV1 {
  const request = tupleField(value, "request", 0);
  const statusCode = parseSmallUint(tupleField(value, "status", 1), "REQUEST_STATUS_INVALID");
  const status = REQUEST_STATUSES[statusCode];
  if (!status || status === "NONE") throw new Error("REQUEST_STATUS_INVALID");
  const approvedDigest = parseBytes32(tupleField(value, "approvedDigest", 3), "APPROVED_DIGEST_INVALID");
  const approvedDecision = parseSmallUint(tupleField(value, "approvedDecision", 5), "APPROVED_DECISION_INVALID");
  const decision = approvedDigest === zeroHash ? "PENDING" : approvedDecision === 1 ? "ALLOW" : approvedDecision === 0 ? "DENY" : null;
  if (decision === null) throw new Error("APPROVED_DECISION_INVALID");
  const reasonCode = parseSmallUint(tupleField(value, "approvedReason", 6), "APPROVED_REASON_INVALID");
  const publicReasonClass = decision === "PENDING" ? null : REASON_BY_CODE.get(reasonCode);
  if (decision !== "PENDING" && publicReasonClass === undefined) throw new Error("APPROVED_REASON_INVALID");
  return {
    chainId: parseUint(tupleField(request, "chainId", 0), "REQUEST_CHAIN_INVALID"),
    registry: parseAddress(tupleField(request, "registry", 1), "REQUEST_REGISTRY_INVALID"),
    vault: parseAddress(tupleField(request, "vault", 2), "REQUEST_VAULT_INVALID"),
    router: parseAddress(tupleField(request, "router", 3), "REQUEST_ROUTER_INVALID"),
    policyId: parseBytes32(tupleField(request, "policyId", 4), "POLICY_ID_INVALID"),
    policyVersion: parseSmallUint(tupleField(request, "policyVersion", 5), "POLICY_VERSION_INVALID"),
    policyCommitment: parseBytes32(tupleField(request, "policyCommitment", 6), "POLICY_COMMITMENT_INVALID"),
    requestId: parseBytes32(tupleField(request, "requestId", 7), "REQUEST_ID_INVALID"),
    requestNonce: parseUint(tupleField(request, "requestNonce", 8), "REQUEST_NONCE_INVALID"),
    attempt: parseSmallUint(tupleField(request, "attempt", 9), "REQUEST_ATTEMPT_INVALID"),
    requester: parseAddress(tupleField(request, "requester", 10), "REQUESTER_INVALID"),
    target: parseAddress(tupleField(request, "target", 11), "TARGET_INVALID"),
    asset: parseAddress(tupleField(request, "asset", 12), "ASSET_INVALID"),
    actionType: parseBytes32(tupleField(request, "actionType", 13), "ACTION_TYPE_INVALID"),
    amount: parseUint(tupleField(request, "amount", 14), "REQUEST_AMOUNT_INVALID"),
    scheduleSlot: parseUint(tupleField(request, "scheduleSlot", 15), "SCHEDULE_SLOT_INVALID"),
    occurrence: parseSmallUint(tupleField(request, "occurrence", 16), "OCCURRENCE_INVALID"),
    spendCheckpoint: parseBytes32(tupleField(request, "spendCheckpoint", 17), "SPEND_CHECKPOINT_INVALID"),
    balanceCheckpoint: parseBytes32(tupleField(request, "balanceCheckpoint", 18), "BALANCE_CHECKPOINT_INVALID"),
    inputCommitment: parseBytes32(tupleField(request, "inputCommitment", 19), "INPUT_COMMITMENT_INVALID"),
    createdAt: parseUint(tupleField(request, "createdAt", 20), "CREATED_AT_INVALID"),
    graceDeadline: parseUint(tupleField(request, "graceDeadline", 21), "GRACE_DEADLINE_INVALID"),
    expiry: parseUint(tupleField(request, "expiry", 22), "EXPIRY_INVALID"),
    status,
    requestHash: parseBytes32(tupleField(value, "requestHash", 2), "REQUEST_HASH_INVALID"),
    approvedDigest,
    matchingCount: parseSmallUint(tupleField(value, "matchingCount", 4), "MATCHING_COUNT_INVALID"),
    decision,
    publicReasonClass: publicReasonClass ?? null,
    approvedAmount: parseUint(tupleField(value, "approvedAmount", 7), "APPROVED_AMOUNT_INVALID"),
    approvedCheckpoint: parseBytes32(tupleField(value, "approvedCheckpoint", 8), "APPROVED_CHECKPOINT_INVALID"),
    approvedNonce: parseBytes32(tupleField(value, "approvedNonce", 9), "APPROVED_NONCE_INVALID"),
    approvedAttempt: parseSmallUint(tupleField(value, "approvedAttempt", 10), "APPROVED_ATTEMPT_INVALID"),
    approvedIssuedAt: parseUint(tupleField(value, "approvedIssuedAt", 11), "APPROVED_ISSUED_AT_INVALID"),
    approvedExpiry: parseUint(tupleField(value, "approvedExpiry", 12), "APPROVED_EXPIRY_INVALID"),
  };
}

function derivePayeeReadState(request: PublicRequestSnapshotV1): PublicPayeeReadState {
  if (request.status === "EXECUTED") return unavailablePayeeState("RECEIPT_UNFINALIZED");
  const status = request.status === "PENDING" ? "PENDING"
    : request.status === "ALLOWED" ? "READY"
      : request.status === "DENIED" ? "DENIED"
        : request.status === "EXPIRED" ? "EXPIRED" : "CANCELLED";
  const base = {
    chainId: request.chainId,
    router: request.router,
    vault: request.vault,
    requestId: request.requestId,
    requestHash: request.requestHash,
    payee: request.target,
    asset: request.asset,
    expectedAmount: request.amount,
    expectedAt: request.scheduleSlot > 0n ? request.scheduleSlot : request.createdAt,
    expiry: request.expiry,
    status,
    settlementTransactionHash: zeroHash,
    settlementCheckpoint: zeroHash,
    settledAt: 0n,
  } as const;
  return publicPayeeReadState({ ...base, receiptHash: payeeReceiptHash(base), request });
}

function tupleField(value: unknown, key: string, index: number): unknown {
  if (Array.isArray(value)) return value[index];
  if (typeof value === "object" && value !== null && Object.prototype.hasOwnProperty.call(value, key)) {
    return (value as Record<string, unknown>)[key];
  }
  throw new Error("REQUEST_SCHEMA_INVALID");
}

function parseSmallUint(value: unknown, error: string): number {
  const parsed = typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : typeof value === "bigint" && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value) : null;
  if (parsed === null) throw new Error(error);
  return parsed;
}

function parseBytes32(value: unknown, error: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(error);
  return value.toLowerCase() as Hex;
}

function providerErrorCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : null;
}

function hasProviderErrorCode(error: unknown, expected: number): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && typeof current === "object" && current !== null; depth += 1) {
    if (providerErrorCode(current) === expected) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function sameAccounting(left: VaultAccounting, right: VaultAccounting): boolean {
  return left.deposited === right.deposited
    && left.available === right.available
    && left.reserved === right.reserved
    && left.spent === right.spent
    && left.withdrawn === right.withdrawn
    && left.refunded === right.refunded;
}

async function waitForFinalizedReceipt(
  hash: Hash,
  failure: (reason: "PROVIDER_ERROR" | "TRANSACTION_REVERTED") => Error = (reason) => new VaultTransactionError(reason),
): Promise<TransactionReceipt> {
  let receipt: TransactionReceipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 90_000 });
  } catch {
    throw failure("PROVIDER_ERROR");
  }
  if (receipt.status !== "success") throw failure("TRANSACTION_REVERTED");
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const finalized = await publicClient.getBlock({ blockTag: "finalized" });
      if (finalized.number !== null && finalized.number >= receipt.blockNumber) return receipt;
    } catch {
      // A transient RPC failure remains bounded; no success is returned early.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw failure("PROVIDER_ERROR");
}

export function verifyVaultReceiptEvent(kind: VaultTransactionKind, amount: bigint, account: Address, logs: readonly VaultReceiptLog[]): void {
  const expectedAddress = kind === "APPROVE" ? PAYGUARD_COSTON2.asset : PAYGUARD_COSTON2.vault;
  for (const log of logs) {
    if (log.address.toLowerCase() !== expectedAddress.toLowerCase()) continue;
    try {
      if (kind === "APPROVE") {
        const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
        if (decoded.eventName === "Approval"
          && decoded.args.owner.toLowerCase() === account.toLowerCase()
          && decoded.args.spender.toLowerCase() === PAYGUARD_COSTON2.vault.toLowerCase()
          && decoded.args.value === amount) return;
      } else {
        const decoded = decodeEventLog({ abi: PayGuardVaultAbi, data: log.data, topics: log.topics });
        if (kind === "DEPOSIT" && decoded.eventName === "Deposited"
          && decoded.args.owner.toLowerCase() === account.toLowerCase()
          && decoded.args.asset.toLowerCase() === PAYGUARD_COSTON2.asset.toLowerCase()
          && decoded.args.amount === amount) return;
        if (kind === "WITHDRAW" && decoded.eventName === "Withdrawn"
          && decoded.args.owner.toLowerCase() === account.toLowerCase()
          && decoded.args.asset.toLowerCase() === PAYGUARD_COSTON2.asset.toLowerCase()
          && decoded.args.to.toLowerCase() === account.toLowerCase()
          && decoded.args.amount === amount) return;
      }
    } catch {
      // Ignore unrelated or malformed logs; one exact event is mandatory below.
    }
  }
  throw new VaultTransactionError("EVENT_MISMATCH");
}

export function verifyRequestReceiptEvent(
  kind: RequestTransactionKind,
  request: PublicRequestSnapshotV1,
  logs: readonly VaultReceiptLog[],
): void {
  const expectedEvent = kind === "EXECUTE" ? "RequestExecuted" : kind === "EXPIRE" ? "RequestExpired" : "RequestCancelled";
  for (const log of logs) {
    if (log.address.toLowerCase() !== PAYGUARD_COSTON2.router.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: PayGuardActionRouterAbi, data: log.data, topics: log.topics });
      if (decoded.eventName !== expectedEvent || decoded.args.requestId.toLowerCase() !== request.requestId.toLowerCase()) continue;
      if (kind !== "EXECUTE") return;
      if (decoded.eventName === "RequestExecuted"
        && decoded.args.target.toLowerCase() === request.target.toLowerCase()
        && decoded.args.amount === request.amount
        && decoded.args.checkpoint.toLowerCase() === request.approvedCheckpoint.toLowerCase()) return;
    } catch {
      // Ignore unrelated or malformed logs; one exact event is mandatory below.
    }
  }
  throw new RequestTransactionError("EVENT_MISMATCH");
}

export function verifyRequestPostcondition(
  kind: RequestTransactionKind,
  before: PublicRequestSnapshotV1,
  after: PublicRequestSnapshotV1,
): void {
  const expected = kind === "EXECUTE" ? "EXECUTED" : kind === "EXPIRE" ? "EXPIRED" : "CANCELLED";
  if (after.status !== expected
    || after.requestId.toLowerCase() !== before.requestId.toLowerCase()
    || after.requestHash.toLowerCase() !== before.requestHash.toLowerCase()
    || after.policyCommitment.toLowerCase() !== before.policyCommitment.toLowerCase()
    || after.amount !== before.amount
    || after.target.toLowerCase() !== before.target.toLowerCase()) {
    throw new RequestTransactionError("POSTCONDITION_FAILED");
  }
}
