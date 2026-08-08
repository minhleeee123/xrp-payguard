import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import {
  DIRECT_MINTING_BIPS_DENOMINATOR,
  DIRECT_MINTING_PAYMENT_ADDRESS_ABI,
  DIRECT_MINTING_SETTINGS_ABI,
  computeDirectMintingPaymentAmountUBA,
  computeDirectMintingPaymentQuote,
  readDirectMintingPaymentAddress,
  readDirectMintingPaymentQuote,
  readDirectMintingSettings,
} from "../src/fassets-direct-mint.js";

const assetManager = "0x00000000000000000000000000000000000000a1";

describe("FAssets direct-mint payment quote", () => {
  it("uses the minimum fee when the proportional fee is smaller", () => {
    const quote = computeDirectMintingPaymentQuote({
      netMintAmountUBA: 10_000n,
      executorFeeUBA: 10n,
      feeBIPS: 25n,
      minimumFeeUBA: 100n,
    });
    expect(quote.proportionalFeeUBA).toBe(25n);
    expect(quote.mintingFeeUBA).toBe(100n);
    expect(quote.totalPaymentUBA).toBe(10_110n);
    expect(computeDirectMintingPaymentAmountUBA(quote)).toBe(10_110n);
  });

  it("uses integer floor division and the proportional fee when larger", () => {
    const quote = computeDirectMintingPaymentQuote({
      netMintAmountUBA: 1_000_000n,
      executorFeeUBA: 10n,
      feeBIPS: 25n,
      minimumFeeUBA: 100n,
    });
    expect(quote.proportionalFeeUBA).toBe(2_500n);
    expect(quote.mintingFeeUBA).toBe(2_500n);
    expect(quote.totalPaymentUBA).toBe(1_002_510n);
    expect(DIRECT_MINTING_BIPS_DENOMINATOR).toBe(10_000n);
    expect(computeDirectMintingPaymentQuote({ ...quote, netMintAmountUBA: 399n }).proportionalFeeUBA).toBe(0n);
  });

  it("quotes memo-only funding as the minimum minting fee plus executor fee", () => {
    expect(computeDirectMintingPaymentQuote({
      netMintAmountUBA: 0n,
      executorFeeUBA: 7n,
      feeBIPS: 250n,
      minimumFeeUBA: 100n,
    })).toMatchObject({ proportionalFeeUBA: 0n, mintingFeeUBA: 100n, totalPaymentUBA: 107n });
  });

  it("rejects negative, non-uint, and overflowing quote inputs", () => {
    const base = { netMintAmountUBA: 1n, executorFeeUBA: 1n, feeBIPS: 1n, minimumFeeUBA: 1n };
    expect(() => computeDirectMintingPaymentQuote({ ...base, netMintAmountUBA: -1n })).toThrow(/net mint amount/);
    expect(() => computeDirectMintingPaymentQuote({ ...base, feeBIPS: 1.5 as unknown as bigint })).toThrow(/settings/);
    expect(() => computeDirectMintingPaymentQuote({ ...base, netMintAmountUBA: (1n << 256n) })).toThrow(/net mint amount/);
    expect(() => computeDirectMintingPaymentQuote({ ...base, netMintAmountUBA: (1n << 256n) - 1n, feeBIPS: 2n })).toThrow(/fee overflow/);
    expect(() => computeDirectMintingPaymentQuote({ ...base, netMintAmountUBA: (1n << 256n) - 1n, minimumFeeUBA: 1n, executorFeeUBA: 1n })).toThrow(/payment overflow/);
  });
});

describe("FAssets direct-mint settings reader", () => {
  it("reads the exact official getters through the injected reader", async () => {
    const calls: string[] = [];
    const settings = await readDirectMintingSettings({
      async readContract(args) {
        expect(args.address).toBe(getAddress(assetManager));
        expect(args.abi).toBe(DIRECT_MINTING_SETTINGS_ABI);
        expect(args.args).toEqual([]);
        calls.push(args.functionName);
        return args.functionName === "getDirectMintingExecutorFeeUBA" ? 7n
          : args.functionName === "getDirectMintingFeeBIPS" ? 25n : 100n;
      },
    }, assetManager);
    expect(calls.sort()).toEqual([
      "getDirectMintingExecutorFeeUBA",
      "getDirectMintingFeeBIPS",
      "getDirectMintingMinimumFeeUBA",
    ].sort());
    expect(settings).toEqual({ executorFeeUBA: 7n, feeBIPS: 25n, minimumFeeUBA: 100n });
    await expect(readDirectMintingPaymentQuote({
      async readContract(args) {
        return args.functionName === "getDirectMintingExecutorFeeUBA" ? 7n
          : args.functionName === "getDirectMintingFeeBIPS" ? 25n : 100n;
      },
    }, assetManager, 10_000n)).resolves.toMatchObject({ totalPaymentUBA: 10_107n });
  });

  it("fails closed for bad addresses, bad getter values, and reader errors", async () => {
    await expect(readDirectMintingSettings({ async readContract() { return 1n; } }, "0x0")).rejects.toThrow(/address/);
    await expect(readDirectMintingSettings({ async readContract() { return 1; } }, assetManager)).rejects.toThrow(/setting/);
    await expect(readDirectMintingSettings({ async readContract() { throw new Error("offline"); } }, assetManager)).rejects.toThrow("offline");
  });
});

describe("FAssets direct-mint XRPL payment-address reader", () => {
  it("reads the official runtime Core Vault address and validates its XRPL shape", async () => {
    const paymentAddress = "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn";
    const result = await readDirectMintingPaymentAddress({
      async readContract(args) {
        expect(args.address).toBe(getAddress(assetManager));
        expect(args.abi).toBe(DIRECT_MINTING_PAYMENT_ADDRESS_ABI);
        expect(args.functionName).toBe("directMintingPaymentAddress");
        expect(args.args).toEqual([]);
        return paymentAddress;
      },
    }, assetManager);
    expect(result).toBe(paymentAddress);
  });

  it("fails closed for invalid address, unavailable reader, and malformed result", async () => {
    await expect(readDirectMintingPaymentAddress({ async readContract() { return "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn"; } }, "0x0"))
      .rejects.toThrow(/AssetManager address/);
    await expect(readDirectMintingPaymentAddress({ async readContract() { throw new Error("offline"); } }, assetManager))
      .rejects.toThrow(/unavailable/);
    await expect(readDirectMintingPaymentAddress({ async readContract() { return "not-an-xrpl-address"; } }, assetManager))
      .rejects.toThrow(/malformed/);
  });
});
