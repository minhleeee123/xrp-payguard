import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PayGuardVaultAbi } from "@xrp-payguard/bindings";
import { encodeAbiParameters, encodeEventTopics, erc20Abi, getAddress, keccak256, type Hex } from "viem";
import {
  COSTON2_CHAIN_HEX,
  PAYGUARD_COSTON2,
  WalletConnectionError,
  VaultTransactionError,
  connectCoston2Wallet,
  loadCoston2AccountSnapshot,
  parseFTestXrpAmount,
  readWalletSession,
  validateVaultTransaction,
  verifyVaultPostcondition,
  verifyVaultReceiptEvent,
  type Coston2ReadClient,
  type Eip1193Provider,
} from "../src/coston2.js";

const account = getAddress("0xE412d04DA2A211F7ADC80311CC0FF9F03440B64E");

class ProviderStub implements Eip1193Provider {
  readonly calls: { method: string; params?: readonly unknown[] | object }[] = [];
  chainId = "0x1";
  addRequired = false;

  async request(args: { method: string; params?: readonly unknown[] | object }): Promise<unknown> {
    this.calls.push(args);
    if (args.method === "eth_accounts" || args.method === "eth_requestAccounts") return [account];
    if (args.method === "eth_chainId") return this.chainId;
    if (args.method === "wallet_switchEthereumChain") {
      if (this.addRequired) {
        this.addRequired = false;
        throw { code: 4902 };
      }
      this.chainId = COSTON2_CHAIN_HEX;
      return null;
    }
    if (args.method === "wallet_addEthereumChain") return null;
    throw new Error(`unsupported ${args.method}`);
  }
}

function runtime(contract: "PayGuardPolicyRegistry" | "PayGuardVault" | "PayGuardActionRouter"): Hex {
  const artifact = JSON.parse(readFileSync(
    new URL(`../../../packages/contracts/out/${contract}.sol/${contract}.json`, import.meta.url),
    "utf8",
  )) as { deployedBytecode: { object: Hex } };
  return artifact.deployedBytecode.object;
}

function readClient(overrides: Partial<Coston2ReadClient> = {}): Coston2ReadClient {
  const runtimes = new Map<string, Hex>([
    [PAYGUARD_COSTON2.registry.toLowerCase(), runtime("PayGuardPolicyRegistry")],
    [PAYGUARD_COSTON2.vault.toLowerCase(), runtime("PayGuardVault")],
    [PAYGUARD_COSTON2.router.toLowerCase(), runtime("PayGuardActionRouter")],
  ]);
  const client: Coston2ReadClient = {
    getBlock: async () => ({ number: 1234n, timestamp: 1_800_000_000n }),
    getBytecode: async ({ address }) => runtimes.get(address.toLowerCase()),
    getBalance: async () => 9n * 10n ** 18n,
    readContract: async ({ address, functionName }) => {
      if (functionName === "balanceOf") return 18_829_054n;
      if (functionName === "allowance") return 1_000_000n;
      if (functionName === "accounting") return [2_000_000n, 1_250_000n, 250_000n, 300_000n, 150_000n, 50_000n];
      if (functionName === "name") return "FXRP";
      if (functionName === "symbol") return "FTestXRP";
      if (functionName === "decimals") return 6;
      if (functionName === "supportedAsset") return true;
      if (functionName === "router") return PAYGUARD_COSTON2.router;
      if (functionName === "registry") return PAYGUARD_COSTON2.registry;
      if (functionName === "vault" && address === PAYGUARD_COSTON2.router) return PAYGUARD_COSTON2.vault;
      throw new Error(`unsupported read ${functionName}`);
    },
  };
  return { ...client, ...overrides };
}

const testRuntimeHashes = {
  registry: keccak256(runtime("PayGuardPolicyRegistry")),
  vault: keccak256(runtime("PayGuardVault")),
  router: keccak256(runtime("PayGuardActionRouter")),
};

describe("Coston2 browser integration", () => {
  it.runIf(process.env.PAYGUARD_LIVE_COSTON2 === "1")("passes the credential-free finalized public read boundary", async () => {
    const snapshot = await loadCoston2AccountSnapshot(account);
    expect(snapshot.account).toBe(account);
    expect(snapshot.finalizedBlock).toBeGreaterThan(0n);
    expect(snapshot.contracts.runtimeVerified).toBe(true);
  }, 30_000);

  it("reads an already-authorized wallet without requesting access", async () => {
    const provider = new ProviderStub();
    provider.chainId = COSTON2_CHAIN_HEX;
    await expect(readWalletSession(provider)).resolves.toEqual({ account, chainId: 114 });
    expect(provider.calls.map((call) => call.method).sort()).toEqual(["eth_accounts", "eth_chainId"]);
  });

  it("requests the account and switches to Coston2", async () => {
    const provider = new ProviderStub();
    await expect(connectCoston2Wallet(provider)).resolves.toEqual({ account, chainId: 114 });
    expect(provider.calls.map((call) => call.method)).toContain("wallet_switchEthereumChain");
  });

  it("adds Coston2 only when the provider reports an unknown chain", async () => {
    const provider = new ProviderStub();
    provider.addRequired = true;
    await connectCoston2Wallet(provider);
    const add = provider.calls.find((call) => call.method === "wallet_addEthereumChain");
    expect(add).toBeDefined();
    expect(JSON.stringify(add?.params)).toContain('"chainId":"0x72"');
    expect(JSON.stringify(add?.params)).toContain("https://coston2-api.flare.network/ext/C/rpc");
  });

  it("uses stable failure classes without exposing provider error text", async () => {
    const provider: Eip1193Provider = { request: async () => { throw { code: 4001, message: "sensitive wallet text" }; } };
    const error = await connectCoston2Wallet(provider).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(WalletConnectionError);
    expect((error as WalletConnectionError).reason).toBe("USER_REJECTED");
    expect((error as Error).message).not.toContain("sensitive");
  });

  it("pins reads to one finalized block and verifies runtime, asset, wiring, and conservation", async () => {
    const snapshot = await loadCoston2AccountSnapshot(account, readClient(), testRuntimeHashes);
    expect(snapshot.finalizedBlock).toBe(1234n);
    expect(snapshot.token).toEqual({ name: "FXRP", symbol: "FTestXRP", decimals: 6 });
    expect(snapshot.tokenBalance).toBe(18_829_054n);
    expect(snapshot.accounting.available).toBe(1_250_000n);
    expect(snapshot.contracts).toEqual({
      runtimeVerified: true,
      supportedAsset: true,
      vaultRouter: PAYGUARD_COSTON2.router,
      routerRegistry: PAYGUARD_COSTON2.registry,
      routerVault: PAYGUARD_COSTON2.vault,
    });
  });

  it("accepts viem named-tuple accounting without weakening conservation", async () => {
    const client = readClient({
      readContract: async (args) => args.functionName === "accounting"
        ? { deposited: 10n, available: 4n, reserved: 1n, spent: 2n, withdrawn: 2n, refunded: 1n }
        : readClient().readContract(args),
    });
    const snapshot = await loadCoston2AccountSnapshot(account, client, testRuntimeHashes);
    expect(snapshot.accounting).toEqual({ deposited: 10n, available: 4n, reserved: 1n, spent: 2n, withdrawn: 2n, refunded: 1n });
  });

  it("fails closed on runtime or conservation drift", async () => {
    const wrongRuntime = readClient({ getBytecode: async () => "0x6000" });
    await expect(loadCoston2AccountSnapshot(account, wrongRuntime, testRuntimeHashes)).rejects.toThrow(/RUNTIME_/);
    const invalidAccounting = readClient({
      readContract: async (args) => args.functionName === "accounting"
        ? [2n, 2n, 2n, 2n, 2n, 2n]
        : readClient().readContract(args),
    });
    await expect(loadCoston2AccountSnapshot(account, invalidAccounting, testRuntimeHashes)).rejects.toThrow("VAULT_CONSERVATION_MISMATCH");
  });

  it("parses only positive exact FTestXRP base units", () => {
    expect(parseFTestXrpAmount("1")).toBe(1_000_000n);
    expect(parseFTestXrpAmount("0.000001")).toBe(1n);
    for (const invalid of ["", "0", "-1", "1.0000001", "1e3", ".5", "01"]) {
      expect(() => parseFTestXrpAmount(invalid)).toThrow(VaultTransactionError);
    }
  });

  it("preflights approve, deposit, and withdrawal against finalized balances", async () => {
    const snapshot = await loadCoston2AccountSnapshot(account, readClient(), testRuntimeHashes);
    expect(() => validateVaultTransaction("APPROVE", snapshot.tokenBalance + 1n, snapshot)).toThrow("INSUFFICIENT_TOKEN_BALANCE");
    expect(() => validateVaultTransaction("DEPOSIT", snapshot.vaultAllowance + 1n, snapshot)).toThrow("ALLOWANCE_REQUIRED");
    expect(() => validateVaultTransaction("WITHDRAW", snapshot.accounting.available + 1n, snapshot)).toThrow("INSUFFICIENT_VAULT_BALANCE");
    expect(() => validateVaultTransaction("DEPOSIT", 1_000_000n, snapshot)).not.toThrow();
  });

  it("requires exact finalized postconditions for all vault transaction kinds", async () => {
    const before = await loadCoston2AccountSnapshot(account, readClient(), testRuntimeHashes);
    verifyVaultPostcondition("APPROVE", 500_000n, before, { ...before, finalizedBlock: before.finalizedBlock + 1n, vaultAllowance: 500_000n });
    verifyVaultPostcondition("DEPOSIT", 500_000n, before, {
      ...before,
      finalizedBlock: before.finalizedBlock + 1n,
      tokenBalance: before.tokenBalance - 500_000n,
      accounting: {
        ...before.accounting,
        deposited: before.accounting.deposited + 500_000n,
        available: before.accounting.available + 500_000n,
      },
    });
    verifyVaultPostcondition("WITHDRAW", 500_000n, before, {
      ...before,
      finalizedBlock: before.finalizedBlock + 1n,
      tokenBalance: before.tokenBalance + 500_000n,
      accounting: {
        ...before.accounting,
        available: before.accounting.available - 500_000n,
        withdrawn: before.accounting.withdrawn + 500_000n,
      },
    });
    expect(() => verifyVaultPostcondition("DEPOSIT", 500_000n, before, { ...before, finalizedBlock: before.finalizedBlock + 1n }))
      .toThrow("POSTCONDITION_FAILED");
  });

  it("accepts only the exact public vault event for each intent", () => {
    const amount = 500_000n;
    const data = encodeAbiParameters([{ type: "uint256" }], [amount]);
    const approval = {
      address: PAYGUARD_COSTON2.asset,
      data,
      topics: encodeEventTopics({ abi: erc20Abi, eventName: "Approval", args: { owner: account, spender: PAYGUARD_COSTON2.vault } }) as [Hex, ...Hex[]],
    };
    const deposit = {
      address: PAYGUARD_COSTON2.vault,
      data,
      topics: encodeEventTopics({ abi: PayGuardVaultAbi, eventName: "Deposited", args: { owner: account, asset: PAYGUARD_COSTON2.asset } }) as [Hex, ...Hex[]],
    };
    const withdrawal = {
      address: PAYGUARD_COSTON2.vault,
      data,
      topics: encodeEventTopics({ abi: PayGuardVaultAbi, eventName: "Withdrawn", args: { owner: account, asset: PAYGUARD_COSTON2.asset, to: account } }) as [Hex, ...Hex[]],
    };
    expect(() => verifyVaultReceiptEvent("APPROVE", amount, account, [approval])).not.toThrow();
    expect(() => verifyVaultReceiptEvent("DEPOSIT", amount, account, [deposit])).not.toThrow();
    expect(() => verifyVaultReceiptEvent("WITHDRAW", amount, account, [withdrawal])).not.toThrow();
    expect(() => verifyVaultReceiptEvent("DEPOSIT", amount + 1n, account, [deposit])).toThrow("EVENT_MISMATCH");
  });
});
