import { createRequire } from "node:module";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  zeroAddress,
} from "viem";
import {
  COSTON2_CHAIN_ID,
  COSTON2_RPC_URL,
} from "./fcc-foundation-registration.mjs";
import { FLARE_CONTRACT_REGISTRY } from "./coston2-dependency-resolution.mjs";

const root = resolve(import.meta.dirname, "..");
export const DIRECT_MINT_EVIDENCE_PATH = resolve(
  root,
  "evidence/coston2/coston2-direct-mint-runtime-observation.json",
);
export const ASSET_MANAGER_REGISTRY_NAME = "AssetManagerFXRP";
export const DEFAULT_NET_MINT_AMOUNT_UBA = 1_000_000n;
export const DIRECT_MINTING_BIPS_DENOMINATOR = 10_000n;
const MAX_UINT256 = (1n << 256n) - 1n;
const require = createRequire(import.meta.url);
const { isValidClassicAddress } = require("../packages/integrations/node_modules/xrpl");

const REGISTRY_ABI = [{
  type: "function",
  name: "getContractAddressByName",
  stateMutability: "view",
  inputs: [{ name: "name", type: "string" }],
  outputs: [{ name: "contractAddress", type: "address" }],
}];

export const ASSET_MANAGER_RUNTIME_ABI = [
  {
    type: "function",
    name: "fAsset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "asset", type: "address" }],
  },
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
  {
    type: "function",
    name: "directMintingPaymentAddress",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "paymentAddress", type: "string" }],
  },
];

function chainClient() {
  const chain = {
    id: COSTON2_CHAIN_ID,
    name: "Flare Coston2",
    nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
    rpcUrls: { default: { http: [COSTON2_RPC_URL] } },
  };
  return createPublicClient({ chain, transport: http(COSTON2_RPC_URL, { timeout: 15_000, retryCount: 2 }) });
}

function requireAddress(value, label) {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) {
    throw new Error(`${label} must be a non-zero address`);
  }
  return getAddress(value);
}

function requireUint(value, label) {
  if (typeof value !== "bigint" || value < 0n || value > MAX_UINT256) {
    throw new Error(`${label} must be a uint256`);
  }
  return value;
}

function requireBlock(value) {
  if (typeof value !== "bigint" || value <= 0n || value > MAX_UINT256) throw new Error("observed block is invalid");
  return value.toString();
}

function computeQuote({ netMintAmountUBA, executorFeeUBA, feeBIPS, minimumFeeUBA }) {
  requireUint(netMintAmountUBA, "net mint amount");
  requireUint(executorFeeUBA, "executor fee");
  requireUint(feeBIPS, "fee BIPS");
  requireUint(minimumFeeUBA, "minimum fee");
  const proportionalFeeUBA = netMintAmountUBA * feeBIPS / DIRECT_MINTING_BIPS_DENOMINATOR;
  const mintingFeeUBA = proportionalFeeUBA > minimumFeeUBA ? proportionalFeeUBA : minimumFeeUBA;
  const totalPaymentUBA = netMintAmountUBA + mintingFeeUBA + executorFeeUBA;
  if (totalPaymentUBA > MAX_UINT256) throw new Error("direct mint payment overflow");
  return { netMintAmountUBA, executorFeeUBA, feeBIPS, minimumFeeUBA, proportionalFeeUBA, mintingFeeUBA, totalPaymentUBA };
}

export function parseDirectMintObservationCLI(argv) {
  const [mode = "observe", ...tokens] = argv;
  if (mode !== "observe") throw new Error("mode must be observe");
  let write = false;
  let netMintAmountUBA = DEFAULT_NET_MINT_AMOUNT_UBA;
  let netMintAmountSeen = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--write" && !write) {
      write = true;
      continue;
    }
    if (token === "--net-mint-uba" && index + 1 < tokens.length) {
      if (netMintAmountSeen) throw new Error("invalid or duplicate argument --net-mint-uba");
      netMintAmountSeen = true;
      const value = tokens[++index];
      if (!/^\d+$/.test(value) || (netMintAmountUBA = BigInt(value)) > MAX_UINT256) {
        throw new Error("--net-mint-uba must be a uint256 decimal");
      }
      continue;
    }
    throw new Error(`invalid or duplicate argument ${token}`);
  }
  return { mode, write, netMintAmountUBA };
}

export async function collectDirectMintObservation({ client = chainClient(), netMintAmountUBA = DEFAULT_NET_MINT_AMOUNT_UBA } = {}) {
  requireUint(netMintAmountUBA, "net mint amount");
  const [chainId, observedBlock, managerValue] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.readContract({
      address: FLARE_CONTRACT_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "getContractAddressByName",
      args: [ASSET_MANAGER_REGISTRY_NAME],
    }),
  ]);
  if (chainId !== COSTON2_CHAIN_ID) throw new Error("direct mint observation must target Coston2");
  const assetManager = requireAddress(managerValue, "runtime AssetManagerFXRP");
  const [fAssetValue, executorFeeUBA, feeBIPS, minimumFeeUBA, paymentAddress] = await Promise.all([
    client.readContract({ address: assetManager, abi: ASSET_MANAGER_RUNTIME_ABI, functionName: "fAsset", args: [] }),
    client.readContract({ address: assetManager, abi: ASSET_MANAGER_RUNTIME_ABI, functionName: "getDirectMintingExecutorFeeUBA", args: [] }),
    client.readContract({ address: assetManager, abi: ASSET_MANAGER_RUNTIME_ABI, functionName: "getDirectMintingFeeBIPS", args: [] }),
    client.readContract({ address: assetManager, abi: ASSET_MANAGER_RUNTIME_ABI, functionName: "getDirectMintingMinimumFeeUBA", args: [] }),
    client.readContract({ address: assetManager, abi: ASSET_MANAGER_RUNTIME_ABI, functionName: "directMintingPaymentAddress", args: [] }),
  ]);
  const fAsset = requireAddress(fAssetValue, "runtime FAsset");
  const settings = {
    executorFeeUBA: requireUint(executorFeeUBA, "executor fee"),
    feeBIPS: requireUint(feeBIPS, "fee BIPS"),
    minimumFeeUBA: requireUint(minimumFeeUBA, "minimum fee"),
  };
  if (typeof paymentAddress !== "string" || !isValidClassicAddress(paymentAddress)) {
    throw new Error("runtime direct-mint payment address is malformed");
  }
  return {
    chainId,
    observedBlock: requireBlock(observedBlock),
    assetManager,
    fAsset,
    paymentAddress,
    quote: computeQuote({ netMintAmountUBA, ...settings }),
  };
}

export function buildDirectMintObservationEvidence(observation, recordedAt = new Date().toISOString()) {
  if (observation?.chainId !== COSTON2_CHAIN_ID) throw new Error("direct mint evidence must target Coston2");
  const assetManager = requireAddress(observation.assetManager, "AssetManager");
  const fAsset = requireAddress(observation.fAsset, "FAsset");
  if (typeof observation.paymentAddress !== "string" || !isValidClassicAddress(observation.paymentAddress)) {
    throw new Error("direct mint evidence payment address is malformed");
  }
  const quote = observation.quote;
  const expected = computeQuote(quote);
  if (expected.totalPaymentUBA !== quote.totalPaymentUBA) throw new Error("direct mint quote drift");
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-direct-mint-runtime-observation",
    status: "runtime-quote-address-observed",
    recordedAt,
    network: {
      name: "flare-coston2",
      chainId: COSTON2_CHAIN_ID,
      rpcUrl: COSTON2_RPC_URL,
      observedBlock: observation.observedBlock,
    },
    publicIdentifiers: {
      registry: FLARE_CONTRACT_REGISTRY,
      registryName: ASSET_MANAGER_REGISTRY_NAME,
      assetManager,
      fAsset,
      directMintingPaymentAddress: observation.paymentAddress,
      quote: Object.fromEntries(Object.entries(quote).map(([key, value]) => [key, value.toString()])),
    },
    assertions: {
      chainIdVerified: true,
      assetManagerResolvedThroughRegistry: true,
      runtimeFAssetRead: true,
      runtimeDirectMintSettingsRead: true,
      runtimePaymentAddressValidated: true,
      integerQuoteRecomputed: true,
      noTransactionSubmitted: true,
      delayedMintStillExplicitlyUnverified: true,
      nonceProofOperationReceiptDriftStillUnverified: true,
      testnetOnly: true,
      noPrivateKeyRecorded: true,
      noCredentialRecorded: true,
      noPolicyPlaintextOrCiphertextRecorded: true,
      noPayGuardReleaseClaimed: true,
    },
    blockers: [
      "DELAYED_MINT_RESUME_NOT_LIVE_VERIFIED",
      "NONCE_PROOF_OPERATION_RECEIPT_DRIFT_NOT_LIVE_VERIFIED",
      "PAYGUARD_RELEASE_MANIFEST_NOT_VERIFIED",
    ],
    notes: [
      "This read-only observation resolves AssetManagerFXRP through the official Coston2 Contract Registry and reads the runtime direct-mint getters.",
      "The quote is an integer-only public calculation for the recorded net mint amount; no XRP payment, FDC request, signing, or mint transaction was submitted.",
      "The local delayed checkpoint and drift tests remain separate from this live runtime observation.",
    ],
  };
}

async function writeEvidence(evidence) {
  await mkdir(resolve(DIRECT_MINT_EVIDENCE_PATH, ".."), { recursive: true });
  const temporary = `${DIRECT_MINT_EVIDENCE_PATH}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
  await rename(temporary, DIRECT_MINT_EVIDENCE_PATH);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseDirectMintObservationCLI(process.argv.slice(2));
    const evidence = buildDirectMintObservationEvidence(await collectDirectMintObservation({ netMintAmountUBA: options.netMintAmountUBA }));
    if (options.write) await writeEvidence(evidence);
    console.log(JSON.stringify({
      status: "ok",
      write: options.write,
      evidencePath: options.write ? "evidence/coston2/coston2-direct-mint-runtime-observation.json" : undefined,
      observedBlock: evidence.network.observedBlock,
      assetManager: evidence.publicIdentifiers.assetManager,
      fAsset: evidence.publicIdentifiers.fAsset,
      totalPaymentUBA: evidence.publicIdentifiers.quote.totalPaymentUBA,
    }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
