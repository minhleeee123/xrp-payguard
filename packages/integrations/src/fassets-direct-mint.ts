import { getAddress, isAddress, zeroAddress, type Hex } from "viem";

const MAX_UINT256 = (1n << 256n) - 1n;

/** The denominator used by the official direct-minting fee getter. */
export const DIRECT_MINTING_BIPS_DENOMINATOR = 10_000n;

export const DIRECT_MINTING_SETTINGS_ABI = [
  {
    type: "function",
    name: "getDirectMintingExecutorFeeUBA",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "executorFeeUBA", type: "uint256" }],
  },
  {
    type: "function",
    name: "getDirectMintingFeeBIPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "feeBIPS", type: "uint256" }],
  },
  {
    type: "function",
    name: "getDirectMintingMinimumFeeUBA",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "minimumFeeUBA", type: "uint256" }],
  },
] as const;

export type DirectMintingSettingsFunction =
  | "getDirectMintingExecutorFeeUBA"
  | "getDirectMintingFeeBIPS"
  | "getDirectMintingMinimumFeeUBA";

export interface DirectMintingSettingsV1 {
  executorFeeUBA: bigint;
  feeBIPS: bigint;
  minimumFeeUBA: bigint;
}

export interface DirectMintingPaymentQuoteV1 extends DirectMintingSettingsV1 {
  netMintAmountUBA: bigint;
  proportionalFeeUBA: bigint;
  mintingFeeUBA: bigint;
  totalPaymentUBA: bigint;
}

export interface DirectMintingSettingsReader {
  readContract(args: {
    address: Hex;
    abi: typeof DIRECT_MINTING_SETTINGS_ABI;
    functionName: DirectMintingSettingsFunction;
    args: readonly [];
  }): Promise<unknown>;
}

function isUint256(value: unknown): value is bigint {
  return typeof value === "bigint" && value >= 0n && value <= MAX_UINT256;
}

function checkedMultiply(left: bigint, right: bigint, label: string): bigint {
  if (left !== 0n && right > MAX_UINT256 / left) throw new Error(`${label} overflow`);
  return left * right;
}

function checkedAdd(left: bigint, right: bigint, label: string): bigint {
  if (right > MAX_UINT256 - left) throw new Error(`${label} overflow`);
  return left + right;
}

function validateSettings(settings: DirectMintingSettingsV1): void {
  if (!isUint256(settings.executorFeeUBA) || !isUint256(settings.feeBIPS)
    || !isUint256(settings.minimumFeeUBA)) throw new Error("direct minting settings invalid");
}

/**
 * Computes the exact UBA payment needed for a direct mint, using integer
 * division for the proportional fee as the AssetManager does on-chain.
 * This function performs no RPC, signing, or payment submission.
 */
export function computeDirectMintingPaymentQuote(input: {
  netMintAmountUBA: bigint;
  executorFeeUBA: bigint;
  feeBIPS: bigint;
  minimumFeeUBA: bigint;
}): DirectMintingPaymentQuoteV1 {
  const settings: DirectMintingSettingsV1 = {
    executorFeeUBA: input.executorFeeUBA,
    feeBIPS: input.feeBIPS,
    minimumFeeUBA: input.minimumFeeUBA,
  };
  if (!isUint256(input.netMintAmountUBA)) throw new Error("net mint amount invalid");
  validateSettings(settings);
  const proportionalFeeUBA = checkedMultiply(input.netMintAmountUBA, input.feeBIPS, "direct minting fee")
    / DIRECT_MINTING_BIPS_DENOMINATOR;
  const mintingFeeUBA = proportionalFeeUBA > input.minimumFeeUBA ? proportionalFeeUBA : input.minimumFeeUBA;
  const totalPaymentUBA = checkedAdd(
    checkedAdd(input.netMintAmountUBA, mintingFeeUBA, "direct minting payment"),
    input.executorFeeUBA,
    "direct minting payment",
  );
  return { ...settings, netMintAmountUBA: input.netMintAmountUBA, proportionalFeeUBA, mintingFeeUBA, totalPaymentUBA };
}

export function computeDirectMintingPaymentAmountUBA(input: {
  netMintAmountUBA: bigint;
  executorFeeUBA: bigint;
  feeBIPS: bigint;
  minimumFeeUBA: bigint;
}): bigint {
  return computeDirectMintingPaymentQuote(input).totalPaymentUBA;
}

function normalizeSetting(value: unknown, name: DirectMintingSettingsFunction): bigint {
  if (!isUint256(value)) throw new Error(`invalid direct minting setting: ${name}`);
  return value;
}

export async function readDirectMintingSettings(
  reader: DirectMintingSettingsReader,
  assetManager: string,
): Promise<DirectMintingSettingsV1> {
  if (!isAddress(assetManager) || getAddress(assetManager) === zeroAddress) {
    throw new Error("AssetManager address invalid");
  }
  const address = getAddress(assetManager) as Hex;
  const [executorFeeUBA, feeBIPS, minimumFeeUBA] = await Promise.all([
    reader.readContract({ address, abi: DIRECT_MINTING_SETTINGS_ABI, functionName: "getDirectMintingExecutorFeeUBA", args: [] }),
    reader.readContract({ address, abi: DIRECT_MINTING_SETTINGS_ABI, functionName: "getDirectMintingFeeBIPS", args: [] }),
    reader.readContract({ address, abi: DIRECT_MINTING_SETTINGS_ABI, functionName: "getDirectMintingMinimumFeeUBA", args: [] }),
  ]);
  return {
    executorFeeUBA: normalizeSetting(executorFeeUBA, "getDirectMintingExecutorFeeUBA"),
    feeBIPS: normalizeSetting(feeBIPS, "getDirectMintingFeeBIPS"),
    minimumFeeUBA: normalizeSetting(minimumFeeUBA, "getDirectMintingMinimumFeeUBA"),
  };
}

export async function readDirectMintingPaymentQuote(
  reader: DirectMintingSettingsReader,
  assetManager: string,
  netMintAmountUBA: bigint,
): Promise<DirectMintingPaymentQuoteV1> {
  const settings = await readDirectMintingSettings(reader, assetManager);
  return computeDirectMintingPaymentQuote({ ...settings, netMintAmountUBA });
}
