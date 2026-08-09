import {
  PayGuardActionRouterAbi,
  PayGuardVaultAbi,
} from "@xrp-payguard/bindings";
import {
  createWalletClient,
  createPublicClient,
  custom,
  decodeEventLog,
  erc20Abi,
  getAddress,
  http,
  keccak256,
  parseUnits,
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
  const contractEntries = [
    ["registry", PAYGUARD_COSTON2.registry],
    ["vault", PAYGUARD_COSTON2.vault],
    ["router", PAYGUARD_COSTON2.router],
  ] as const;
  const code = await Promise.all(contractEntries.map(([, address]) => client.getBytecode({ address, blockNumber })));
  contractEntries.forEach(([name], index) => {
    const runtime = code[index];
    if (!runtime || runtime === "0x" || keccak256(runtime).toLowerCase() !== runtimeCodeHashes[name].toLowerCase()) {
      throw new Error(`RUNTIME_${name.toUpperCase()}_MISMATCH`);
    }
  });

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

async function waitForFinalizedReceipt(hash: Hash): Promise<TransactionReceipt> {
  let receipt: TransactionReceipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 90_000 });
  } catch {
    throw new VaultTransactionError("PROVIDER_ERROR");
  }
  if (receipt.status !== "success") throw new VaultTransactionError("TRANSACTION_REVERTED");
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const finalized = await publicClient.getBlock({ blockTag: "finalized" });
      if (finalized.number !== null && finalized.number >= receipt.blockNumber) return receipt;
    } catch {
      // A transient RPC failure remains bounded; no success is returned early.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new VaultTransactionError("PROVIDER_ERROR");
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
