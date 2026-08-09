import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { promisify } from "node:util";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodePacked,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseEventLogs,
  stringToHex,
  zeroAddress,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import WebSocket from "ws";

import { compileProtocolRuntime } from "./coston2-simulated-lifecycle.mjs";
import { COSTON2_CHAIN_ID, COSTON2_RPC_URL, FLARE_CONTRACT_REGISTRY } from "./coston2-deploy.mjs";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");

const CORE_EVIDENCE_PATH = resolve(root, "evidence/coston2/contracts-deployment.json");
const TRIGGER_EVIDENCE_PATH = resolve(root, "evidence/coston2/xrpl-fdc-trigger-deployment.json");
export const LIVE_FDC_EVIDENCE_PATH = resolve(
  root,
  "evidence/coston2/xrpl-fdc-trigger-pending-2026-08-09.json",
);
const ARTIFACTS = {
  registry: resolve(root, "packages/contracts/out/PayGuardPolicyRegistry.sol/PayGuardPolicyRegistry.json"),
  vault: resolve(root, "packages/contracts/out/PayGuardVault.sol/PayGuardVault.json"),
  router: resolve(root, "packages/contracts/out/PayGuardActionRouter.sol/PayGuardActionRouter.json"),
  trigger: resolve(root, "packages/contracts/out/PayGuardXrplFdcTrigger.sol/PayGuardXrplFdcTrigger.json"),
};
const XRPL_TESTNET_WEBSOCKET = "wss://s.altnet.rippletest.net:51233/";
const PUBLIC_FDC_ACCESS_ID = "00000000-0000-0000-0000-000000000000";
const PAYMENT_DROPS = 100n;
const MAX_PREPARE_WAIT_MS = 5 * 60 * 1_000;
const MAX_PROOF_WAIT_MS = 20 * 60 * 1_000;
const POLL_MS = 10_000;
const REQUEST_LIFETIME_SECONDS = 900n;
const PRIVATE_FIELD = /^(?:privateKey|private_key|secret|seed|ciphertext|policyPlaintext|credential|password|mnemonic|signature)$/iu;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;

const coston2 = {
  id: COSTON2_CHAIN_ID,
  name: "Flare Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [COSTON2_RPC_URL] } },
};

const flareRegistryAbi = [{
  type: "function",
  name: "getContractAddressByName",
  stateMutability: "view",
  inputs: [{ name: "name", type: "string" }],
  outputs: [{ name: "contractAddress", type: "address" }],
}];

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function address(value, label) {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) {
    throw new Error(`${label} must be a non-zero address`);
  }
  return getAddress(value);
}

function bytes32(value, label) {
  if (typeof value !== "string" || !HEX32.test(value) || /^0x0{64}$/i.test(value)) {
    throw new Error(`${label} must be non-zero bytes32`);
  }
  return value.toLowerCase();
}

function quoted(value, label) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a quoted unsigned integer`);
  }
  return value;
}

function inspectPublic(value, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => inspectPublic(child, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (PRIVATE_FIELD.test(key) && key !== "noPrivateKeyRecorded") {
      throw new Error(`${path} contains forbidden field ${key}`);
    }
    inspectPublic(child, `${path}.${key}`);
  }
}

function randomHash() {
  return `0x${randomBytes(32).toString("hex")}`;
}

export function randomNonZeroUint64(bytes = randomBytes) {
  const value = BigInt(`0x${bytes(8).toString("hex")}`);
  return value === 0n ? 1n : value;
}

function domainHash(label, nonce) {
  return keccak256(encodePacked(["string", "bytes32"], [label, nonce]));
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function publicJson(value) {
  return JSON.stringify(value, (_, child) => typeof child === "bigint" ? child.toString() : child, 2);
}

function progress(stage, details = {}) {
  process.stdout.write(`${JSON.stringify({ stage, ...details })}\n`);
}

export function parseLiveFdcCLI(argv) {
  if (argv.some((value) => /private|secret|seed|mnemonic|credential/i.test(value))) {
    throw new Error("credentials are accepted only through the local environment or ephemeral memory");
  }
  const mode = argv[0] ?? "plan";
  if (mode !== "plan" && mode !== "run") throw new Error(`unknown live FDC mode: ${mode}`);
  const broadcast = argv.includes("--broadcast");
  const faucet = argv.includes("--confirm-xrpl-testnet-faucet");
  const simulated = argv.includes("--confirm-simulated-tee-onchain");
  if (mode === "run" && (!broadcast || !faucet || !simulated)) {
    throw new Error("run requires broadcast, XRPL Testnet faucet, and simulated-TEE confirmations");
  }
  if (mode === "plan" && (broadcast || faucet || simulated)) throw new Error("plan is read-only");
  const allowed = new Set([mode, "--broadcast", "--confirm-xrpl-testnet-faucet", "--confirm-simulated-tee-onchain"]);
  for (const value of argv) if (!allowed.has(value)) throw new Error(`unknown argument: ${value}`);
  return { mode, broadcast, faucet, simulated };
}

async function json(path, label) {
  return record(JSON.parse(await readFile(path, "utf8")), label);
}

async function loadContext() {
  const [core, triggerEvidence] = await Promise.all([
    json(CORE_EVIDENCE_PATH, "core deployment evidence"),
    json(TRIGGER_EVIDENCE_PATH, "trigger deployment evidence"),
  ]);
  if (core.network?.chainId !== COSTON2_CHAIN_ID || triggerEvidence.network?.chainId !== COSTON2_CHAIN_ID) {
    throw new Error("deployment evidence is not Coston2");
  }
  for (const key of ["runtimeCodeVerified", "constructorBindingsVerified"]) {
    if (core.assertions?.[key] !== true || triggerEvidence.assertions?.[key] !== true) {
      throw new Error(`deployment evidence is missing ${key}`);
    }
  }
  const coreIds = record(core.publicIdentifiers, "core identifiers");
  const contracts = record(coreIds.contracts, "core contracts");
  const triggerIds = record(triggerEvidence.publicIdentifiers, "trigger identifiers");
  const context = {
    owner: address(coreIds.deployer, "core deployer"),
    registry: address(contracts.registry?.address, "policy registry"),
    vault: address(contracts.vault?.address, "vault"),
    router: address(contracts.router?.address, "router"),
    asset: address(coreIds.fTestXrp, "FTestXRP"),
    trigger: address(triggerIds.trigger, "XRPL FDC trigger"),
    fdcVerification: address(triggerIds.fdcVerification, "FdcVerification"),
    maxProofAgeSeconds: BigInt(quoted(triggerIds.maxProofAgeSeconds, "max proof age")),
    coreSourceCommit: coreIds.sourceCommit,
    triggerSourceCommit: triggerIds.sourceCommit,
  };
  if (address(triggerIds.router, "trigger router") !== context.router
    || address(triggerIds.deployer, "trigger deployer") !== context.owner) {
    throw new Error("trigger/core evidence binding drift");
  }
  return context;
}

async function loadAbis() {
  return Object.fromEntries(await Promise.all(Object.entries(ARTIFACTS).map(async ([name, path]) => {
    const artifact = await json(path, `${name} artifact`);
    if (!Array.isArray(artifact.abi)) throw new Error(`${name} artifact ABI is missing`);
    return [name, artifact.abi];
  })));
}

export async function compileIntegrationRuntime(executor = execFileAsync) {
  const cache = resolve(root, ".cache");
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(join(cache, "payguard-integration-runtime-"));
  try {
    await executor(resolve(root, "node_modules/.bin/tsc"), [
      "-p",
      resolve(root, "packages/integrations/tsconfig.runtime.json"),
      "--outDir",
      directory,
    ], { cwd: root, encoding: "utf8", timeout: 60_000 });
    const names = ["flare-registry", "fdc-verifier", "fdc-submit", "fdc-round", "fdc-finality", "fdc-proof", "fdc-verify", "triggers"];
    const modules = await Promise.all(names.map((name) => import(
      `${pathToFileURL(resolve(directory, `${name}.js`)).href}?v=${Date.now()}`
    )));
    return { runtime: Object.assign({}, ...modules), cleanup: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function loadXrplBrowserRuntime() {
  const packagePath = require.resolve("xrpl/package.json");
  const bundle = await readFile(resolve(dirname(packagePath), "build/xrpl-latest-min.js"), "utf8");
  const context = {
    WebSocket,
    fetch,
    Request,
    Response,
    Headers,
    AbortController,
    AbortSignal,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    crypto: globalThis.crypto,
    structuredClone,
    atob,
    btoa,
  };
  vm.createContext(context);
  vm.runInContext(bundle, context, { timeout: 15_000, filename: "xrpl-5.0.0-browser.js" });
  if (typeof context.xrpl?.Client !== "function" || typeof context.xrpl?.Wallet !== "function") {
    throw new Error("official xrpl.js browser runtime did not initialize");
  }
  return context.xrpl;
}

async function sourceState({ requireClean = false } = {}) {
  const [{ stdout: head }, { stdout: status }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }),
    execFileAsync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root, encoding: "utf8" }),
  ]);
  const commit = head.trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("unable to resolve source commit");
  if (requireClean && status.trim() !== "") throw new Error("live broadcast requires a clean committed worktree");
  return { commit, clean: status.trim() === "" };
}

function loadEnvironment() {
  try {
    process.loadEnvFile(resolve(root, ".env.local"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const configuredRpc = process.env.COSTON2_RPC_URL?.trim() || COSTON2_RPC_URL;
  if (configuredRpc !== COSTON2_RPC_URL) throw new Error("only the pinned Coston2 RPC is accepted");
}

function configuredAccount(expectedOwner) {
  loadEnvironment();
  const value = process.env.PAYGUARD_DEPLOYER_PRIVATE_KEY;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value ?? "")) {
    throw new Error("PAYGUARD_DEPLOYER_PRIVATE_KEY is missing or malformed");
  }
  const account = privateKeyToAccount(value);
  if (getAddress(account.address) !== getAddress(expectedOwner)) {
    throw new Error("configured PayGuard deployer does not match deployment evidence");
  }
  if (process.env.PAYGUARD_DEPLOYER_ADDRESS
    && address(process.env.PAYGUARD_DEPLOYER_ADDRESS, "configured deployer") !== getAddress(account.address)) {
    throw new Error("configured deployer address does not match local key");
  }
  return account;
}

function client() {
  return createPublicClient({
    chain: coston2,
    transport: http(COSTON2_RPC_URL, { timeout: 20_000, retryCount: 2 }),
  });
}

async function resolveDependencies(publicClient, integration) {
  const resolution = await integration.resolveCoston2Dependencies(
    publicClient,
    ["FdcHub", "FdcVerification", "Relay"],
  );
  const dependencies = {
    fdcHub: address(resolution.addresses.FdcHub, "runtime FdcHub"),
    fdcVerification: address(resolution.addresses.FdcVerification, "runtime FdcVerification"),
    relay: address(resolution.addresses.Relay, "runtime Relay"),
  };
  return dependencies;
}

function normalizeAccounting(value) {
  const tuple = Array.isArray(value) ? value : [
    value.deposited,
    value.available,
    value.reserved,
    value.spent,
    value.withdrawn,
    value.refunded,
  ];
  if (tuple.length !== 6 || tuple.some((entry) => typeof entry !== "bigint")) {
    throw new Error("invalid PayGuard vault accounting tuple");
  }
  return {
    deposited: tuple[0],
    available: tuple[1],
    reserved: tuple[2],
    spent: tuple[3],
    withdrawn: tuple[4],
    refunded: tuple[5],
  };
}

function balanceCheckpoint(context, accounting, observedBlock) {
  return keccak256(encodeAbiParameters([
    { type: "bytes32" },
    { type: "address" },
    { type: "address" },
    { type: "address" },
    { type: "uint256" },
    { type: "uint256" },
  ], [
    keccak256(stringToHex("PAYGUARD_BALANCE_CHECKPOINT_V1")),
    context.vault,
    context.owner,
    context.asset,
    accounting.available,
    observedBlock,
  ]));
}

async function readRuntimeSnapshot(publicClient, context, abis, integration) {
  const [chainId, blockNumber, registryAdmin, vaultRouter, supported, accounting, triggerRouter,
    triggerVerification, triggerRegistry, maxProofAge, dependencies] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBlockNumber(),
    publicClient.readContract({ address: context.registry, abi: abis.registry, functionName: "admin" }),
    publicClient.readContract({ address: context.vault, abi: abis.vault, functionName: "router" }),
    publicClient.readContract({ address: context.vault, abi: abis.vault, functionName: "supportedAsset", args: [context.asset] }),
    publicClient.readContract({ address: context.vault, abi: abis.vault, functionName: "accounting", args: [context.owner, context.asset] }),
    publicClient.readContract({ address: context.trigger, abi: abis.trigger, functionName: "router" }),
    publicClient.readContract({ address: context.trigger, abi: abis.trigger, functionName: "fdcVerification" }),
    publicClient.readContract({ address: context.trigger, abi: abis.trigger, functionName: "flareContractRegistry" }),
    publicClient.readContract({ address: context.trigger, abi: abis.trigger, functionName: "maxProofAgeSeconds" }),
    resolveDependencies(publicClient, integration),
  ]);
  if (chainId !== COSTON2_CHAIN_ID || address(registryAdmin, "registry admin") !== context.owner
    || address(vaultRouter, "vault router") !== context.router || supported !== true
    || address(triggerRouter, "trigger router") !== context.router
    || address(triggerVerification, "trigger verifier") !== context.fdcVerification
    || address(triggerRegistry, "trigger Flare registry") !== getAddress(FLARE_CONTRACT_REGISTRY)
    || BigInt(maxProofAge) !== context.maxProofAgeSeconds
    || dependencies.fdcVerification !== context.fdcVerification) {
    throw new Error("Coston2 deployment/runtime binding drift");
  }
  const normalized = normalizeAccounting(accounting);
  if (normalized.available < PAYMENT_DROPS || normalized.reserved !== 0n) {
    throw new Error("PayGuard vault is not ready for the bounded Pending request");
  }
  return { blockNumber, accounting: normalized, dependencies };
}

export async function planLiveFdcTrigger() {
  const [context, abis, compiled, source] = await Promise.all([
    loadContext(),
    loadAbis(),
    compileIntegrationRuntime(),
    sourceState(),
  ]);
  try {
    const snapshot = await readRuntimeSnapshot(client(), context, abis, compiled.runtime);
    return {
      mode: "LIVE_XRPL_FDC_PENDING_SIMULATED_TEE",
      broadcast: false,
      chainId: COSTON2_CHAIN_ID,
      sourceCommit: source.commit,
      sourceClean: source.clean,
      xrplNetwork: "xrpl-testnet",
      xrplWebSocket: XRPL_TESTNET_WEBSOCKET,
      paymentDrops: PAYMENT_DROPS.toString(),
      publicFdcAccess: true,
      contracts: {
        registry: context.registry,
        vault: context.vault,
        router: context.router,
        trigger: context.trigger,
      },
      dependencies: snapshot.dependencies,
      availableUBA: snapshot.accounting.available.toString(),
      maxProofAgeSeconds: context.maxProofAgeSeconds.toString(),
      ephemeralXrplWalletsOnly: true,
      simulatedTeeOnly: true,
      targetRequestStatus: "Pending",
      fccResultOrExecutionPlanned: false,
    };
  } finally {
    await compiled.cleanup();
  }
}

export function buildLiveFdcTriggerEvidence(observation) {
  const value = record(observation, "live FDC observation");
  if (value.chainId !== COSTON2_CHAIN_ID || value.mode !== "LIVE_XRPL_FDC_PENDING_SIMULATED_TEE"
    || value.request?.status !== "Pending" || value.request?.statusCode !== 1
    || value.transactionCount < 6) {
    throw new Error("live FDC observation is incomplete");
  }
  const evidence = {
    schemaVersion: 1,
    suite: "payguard-coston2-live-xrpl-fdc-pending-request",
    status: "coston2-live-pass",
    recordedAt: value.recordedAt,
    mode: value.mode,
    network: {
      name: "flare-coston2",
      chainId: COSTON2_CHAIN_ID,
      observedBlock: quoted(value.observedBlock, "observed block"),
      xrplNetwork: "xrpl-testnet",
    },
    publicIdentifiers: value.publicIdentifiers,
    xrplPayment: value.xrplPayment,
    fdc: value.fdc,
    simulatedPolicy: value.simulatedPolicy,
    request: value.request,
    assertions: {
      xrplPaymentValidated: true,
      fdcRequestReceiptSuccessful: true,
      fdcRoundFinalized: true,
      fdcProofVerifiedOnChain: true,
      runtimeFdcVerificationBound: true,
      proofOwnerBoundToTrigger: true,
      exactAmountAndMemoBound: true,
      triggerReceiptSuccessful: true,
      transactionReplayMarkerVerified: true,
      proofReplayMarkerVerified: true,
      routerPendingRequestVerified: true,
      requestHashVerified: true,
      atomicProofConsumptionVerified: true,
      simulatedPolicyOnly: true,
      hardwareTeeVerified: false,
      stableHttpsOriginsVerified: false,
      authenticatedIndexerVerified: false,
      liveFccResultVerified: false,
      requestExecuted: false,
      sourceCommitCleanAtBroadcast: true,
      ephemeralXrplWalletsDiscarded: true,
      testnetOnly: true,
      noPrivateKeyRecorded: true,
      noCredentialRecorded: true,
      noPolicyPlaintextOrCiphertextRecorded: true,
      noFccResultClaimed: true,
      noReleaseClaimed: true,
    },
    blockers: [
      "PRIVATE_FDC_DESCRIPTOR_EVALUATION_NOT_IMPLEMENTED",
      "LIVE_FCC_THRESHOLD_RESULT_NOT_VERIFIED",
      "STABLE_HTTPS_FCC_ORIGINS_NOT_DEPLOYED",
      "AUTHENTICATED_FCC_INDEXER_NOT_CONFIGURED",
    ],
    notes: [
      "This record proves a real XRPL Testnet payment, finalized Coston2 FDC proof, and atomic creation of one canonical Pending PayGuard request.",
      "The policy custody entries use three ephemeral in-memory simulated signers and do not prove hardware TEE or official FCC machine registration.",
      "No evaluation was submitted and no value was executed. The request remains Pending until the private FDC schema/evaluator and live FCC threshold path exist.",
      "XRPL seeds, EVM keys, receipt signatures, private policy fields, verifier access headers, and raw proofs are not recorded.",
    ],
  };
  inspectPublic(evidence);
  return evidence;
}

async function saveEvidence(value) {
  inspectPublic(value);
  await mkdir(dirname(LIVE_FDC_EVIDENCE_PATH), { recursive: true });
  const temporary = `${LIVE_FDC_EVIDENCE_PATH}.tmp-${process.pid}`;
  await writeFile(temporary, `${publicJson(value)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, LIVE_FDC_EVIDENCE_PATH);
}

async function writeContractStep({ publicClient, walletClient, account, contractAddress, abi, functionName, args, value = 0n }) {
  const { request } = await publicClient.simulateContract({
    account,
    address: contractAddress,
    abi,
    functionName,
    args,
    ...(value === 0n ? {} : { value }),
  });
  const transactionHash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
    confirmations: 1,
    timeout: 180_000,
  });
  if (receipt.status !== "success" || getAddress(receipt.from) !== getAddress(account.address)
    || getAddress(receipt.to) !== getAddress(contractAddress)) {
    throw new Error(`${functionName} receipt mismatch`);
  }
  return { transactionHash, receipt };
}

export function parseValidatedXrplPaymentResult(resultValue, expected) {
  const result = record(resultValue, "XRPL payment result");
  const transaction = record(result.tx_json, "XRPL payment transaction");
  const meta = record(result.meta, "XRPL payment metadata");
  const transactionHash = String(result.hash ?? transaction.hash ?? "").toUpperCase();
  const ledgerIndex = result.ledger_index;
  const deliverMax = transaction.DeliverMax ?? transaction.Amount;
  if (transaction.DeliverMax !== undefined && transaction.Amount !== undefined
    && transaction.DeliverMax !== transaction.Amount) {
    throw new Error("XRPL v1/v2 payment amount drift");
  }
  if (result.validated !== true || meta.TransactionResult !== "tesSUCCESS"
    || transaction.TransactionType !== "Payment" || transaction.Account !== expected.source
    || transaction.Destination !== expected.destination || deliverMax !== expected.amountDrops.toString()
    || meta.delivered_amount !== expected.amountDrops.toString()
    || !/^[0-9A-F]{64}$/.test(transactionHash)
    || !Number.isSafeInteger(ledgerIndex) || ledgerIndex <= 0) {
    throw new Error("XRPL payment validation mismatch");
  }
  const memoData = transaction.Memos?.[0]?.Memo?.MemoData;
  if (memoData !== expected.requestId.slice(2).toUpperCase()) throw new Error("XRPL request-ID memo mismatch");
  return { transactionHash: `0x${transactionHash.toLowerCase()}`, ledgerIndex: BigInt(ledgerIndex) };
}

async function submitXrplPayment(xrpl, requestId) {
  const xrplClient = new xrpl.Client(XRPL_TESTNET_WEBSOCKET, { connectionTimeout: 20_000 });
  const source = xrpl.Wallet.generate();
  const destination = xrpl.Wallet.generate();
  try {
    await xrplClient.connect();
    progress("xrpl-connected");
    await xrplClient.fundWallet(source, { usageContext: "xrp-payguard-fdc-trigger-source" });
    progress("xrpl-source-funded", { address: source.classicAddress });
    await xrplClient.fundWallet(destination, { usageContext: "xrp-payguard-fdc-trigger-destination" });
    progress("xrpl-destination-funded", { address: destination.classicAddress });
    const response = await xrplClient.submitAndWait({
      TransactionType: "Payment",
      Account: source.classicAddress,
      Destination: destination.classicAddress,
      Amount: PAYMENT_DROPS.toString(),
      Memos: [{ Memo: {
        MemoData: requestId.slice(2).toUpperCase(),
        MemoType: Buffer.from("PAYGUARD_REQUEST_ID_V1", "utf8").toString("hex").toUpperCase(),
      } }],
    }, { wallet: source, autofill: true, failHard: true });
    const parsed = parseValidatedXrplPaymentResult(response.result, {
      source: source.classicAddress,
      destination: destination.classicAddress,
      amountDrops: PAYMENT_DROPS,
      requestId,
    });
    progress("xrpl-payment-validated", {
      transactionHash: parsed.transactionHash,
      ledgerIndex: parsed.ledgerIndex.toString(),
    });
    return {
      transactionHash: parsed.transactionHash,
      ledgerIndex: parsed.ledgerIndex,
      source: source.classicAddress,
      destination: destination.classicAddress,
      amountDrops: PAYMENT_DROPS,
      requestId,
    };
  } finally {
    if (xrplClient.isConnected()) await xrplClient.disconnect();
  }
}

export async function waitForPreparedFdcRequest(
  prepare,
  input,
  {
    timeoutMs = MAX_PREPARE_WAIT_MS,
    pollMs = POLL_MS,
    clock = () => Date.now(),
    sleeper = sleep,
    onRetry = () => {},
  } = {},
) {
  const deadline = clock() + timeoutMs;
  let lastReason = "REJECTED";
  while (clock() <= deadline) {
    try {
      return await prepare(input);
    } catch (error) {
      if (!["REJECTED", "UNAVAILABLE", "HTTP_ERROR"].includes(error?.reason)) throw error;
      lastReason = error.reason;
      onRetry(lastReason);
      if (clock() + pollMs > deadline) break;
      await sleeper(pollMs);
    }
  }
  throw new Error(`timed out waiting for FDC verifier preparation (${lastReason})`);
}

async function submitFdcRequest({ publicClient, walletClient, account, integration, dependencies, transactionHash, proofOwner }) {
  const prepared = await waitForPreparedFdcRequest(
    integration.prepareCoston2XrplPaymentRequest,
    { transactionId: transactionHash, proofOwner, apiKey: PUBLIC_FDC_ACCESS_ID },
    { onRetry: (reason) => progress("fdc-verifier-index-pending", { reason }) },
  );
  const intent = await integration.prepareCoston2FdcSubmission(publicClient, {
    hubAddress: dependencies.fdcHub,
    requestBytes: prepared.abiEncodedRequest,
  });
  const { transactionHash: requestTransactionHash, receipt } = await writeContractStep({
    publicClient,
    walletClient,
    account,
    contractAddress: dependencies.fdcHub,
    abi: integration.FDC_HUB_REQUEST_ABI,
    functionName: "requestAttestation",
    args: [intent.requestBytes],
    value: intent.feeWei,
  });
  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
  const round = await integration.deriveCoston2FdcVotingRound(publicClient, {
    relayAddress: dependencies.relay,
    blockTimestamp: block.timestamp,
  });
  progress("fdc-request-mined", {
    transactionHash: requestTransactionHash,
    blockNumber: receipt.blockNumber.toString(),
    votingRound: round.votingRoundId.toString(),
  });
  return {
    prepared,
    intent,
    transactionHash: requestTransactionHash,
    blockNumber: receipt.blockNumber,
    blockTimestamp: block.timestamp,
    round,
  };
}

async function waitForFdcProof({ publicClient, integration, context, dependencies, submission }) {
  const deadline = Date.now() + MAX_PROOF_WAIT_MS;
  let finality;
  while (Date.now() <= deadline) {
    finality = await integration.readCoston2FdcRoundFinality(publicClient, {
      verificationAddress: dependencies.fdcVerification,
      votingRoundId: submission.round.votingRoundId,
    });
    if (finality.relayAddress !== dependencies.relay) throw new Error("FDC Relay runtime drift");
    if (finality.finalized) break;
    progress("fdc-finality-pending", { votingRound: submission.round.votingRoundId.toString() });
    await sleep(POLL_MS);
  }
  if (!finality?.finalized) throw new Error("timed out waiting for FDC round finality");
  progress("fdc-round-finalized", {
    votingRound: finality.votingRoundId.toString(),
    merkleRoot: finality.merkleRoot,
  });
  let payment;
  while (Date.now() <= deadline) {
    try {
      payment = await integration.fetchCoston2XrplPaymentProof({
        votingRoundId: submission.round.votingRoundId,
        requestBytes: submission.intent.requestBytes,
        apiKey: PUBLIC_FDC_ACCESS_ID,
      });
      break;
    } catch (error) {
      if (!["NOT_READY", "HTTP_ERROR", "UNAVAILABLE"].includes(error?.reason)) throw error;
      progress("fdc-proof-pending", { reason: error.reason });
      await sleep(POLL_MS);
    }
  }
  if (!payment) throw new Error("timed out waiting for FDC proof availability");
  const verification = await integration.verifyCoston2XrplPaymentProof(publicClient, {
    verificationAddress: dependencies.fdcVerification,
    payment,
    finality,
    expectedProofOwner: context.trigger,
  });
  progress("fdc-proof-verified", { proofCommitment: verification.proofCommitment });
  return { finality, payment, verification };
}

function machineDescriptors(accounts, runNonce) {
  return accounts.map((account, index) => ({
    account,
    signer: getAddress(account.address),
    machineId: keccak256(encodePacked(["string", "uint8", "address", "bytes32"], [
      "PAYGUARD_LIVE_FDC_SIMULATED_MACHINE_V1",
      index,
      account.address,
      runNonce,
    ])),
    keyFingerprint: keccak256(encodePacked(["string", "address", "bytes32"], [
      "PAYGUARD_LIVE_FDC_SIMULATED_KEY_V1",
      account.address,
      runNonce,
    ])),
  }));
}

function livePolicy(protocol, context, now, runNonce, submissionNonce) {
  return {
    schemaVersion: 1,
    chainId: BigInt(COSTON2_CHAIN_ID),
    registry: context.registry,
    vault: context.vault,
    router: context.router,
    owner: context.owner,
    policyId: domainHash("PAYGUARD_LIVE_FDC_SIMULATED_POLICY_ID_V1", runNonce),
    policyVersion: 1,
    asset: context.asset,
    referenceCurrency: keccak256(stringToHex("USD")),
    maxPerAction: PAYMENT_DROPS,
    dailyCap: PAYMENT_DROPS,
    rollingCap: PAYMENT_DROPS,
    rollingWindowSeconds: 86_400n,
    startAt: now,
    endAt: 0n,
    scheduleIntervalSeconds: 0n,
    scheduleGraceSeconds: 0n,
    cooldownSeconds: 0n,
    maxOccurrences: 1,
    allowTargets: [context.owner],
    denyTargets: [],
    allowRequesters: [context.trigger],
    allowActionTypes: [protocol.ACTION_FTESTXRP_TRANSFER],
    requireFtso: false,
    ftsoFeedId: protocol.ZERO_BYTES32,
    maxPriceAgeSeconds: 0n,
    privateSalt: domainHash("PAYGUARD_LIVE_FDC_SIMULATED_PRIVATE_SALT_V1", runNonce),
    submissionNonce,
  };
}

async function registerSimulatedPolicy({ publicClient, walletClient, account, context, abis, protocol }) {
  const runNonce = randomHash();
  const submissionNonce = randomHash();
  const machines = machineDescriptors(
    Array.from({ length: 3 }, () => privateKeyToAccount(generatePrivateKey())),
    runNonce,
  );
  const now = (await publicClient.getBlock({ blockTag: "latest" })).timestamp;
  const policy = livePolicy(protocol, context, now, runNonce, submissionNonce);
  const policyCommitment = protocol.policyCommitment(policy);
  const policyNonce = randomNonZeroUint64();
  const binding = {
    chainId: BigInt(COSTON2_CHAIN_ID),
    registry: context.registry,
    vault: context.vault,
    router: context.router,
    owner: context.owner,
    policyId: policy.policyId,
    policyVersion: 1,
    policyCommitment,
    schema: protocol.POLICY_SCHEMA_V1,
    extensionId: domainHash("PAYGUARD_LIVE_FDC_SIMULATED_EXTENSION_V1", runNonce),
    codeVersion: domainHash("PAYGUARD_LIVE_FDC_SIMULATED_CODE_V1", runNonce),
    machineIds: machines.map((machine) => machine.machineId),
    keyFingerprints: machines.map((machine) => machine.keyFingerprint),
    custodyThreshold: 3,
    resultThreshold: 2,
    policyNonce,
  };
  const issuedAt = now;
  const expiry = issuedAt + 3_600n;
  const receipts = await Promise.all(machines.map(async (machine) => {
    const body = {
      binding,
      machineId: machine.machineId,
      keyFingerprint: machine.keyFingerprint,
      submissionNonce,
      receiptNonce: policyNonce,
      issuedAt,
      expiry,
    };
    const signedValue = await machine.account.signMessage({
      message: { raw: protocol.policyReceiptAttestationDigest(body) },
    });
    return {
      machineId: body.machineId,
      keyFingerprint: body.keyFingerprint,
      submissionNonce: body.submissionNonce,
      receiptNonce: body.receiptNonce,
      issuedAt: body.issuedAt,
      expiry: body.expiry,
      signature: signedValue,
    };
  }));
  const machineTransactions = [];
  for (const machine of machines) {
    const step = await writeContractStep({
      publicClient,
      walletClient,
      account,
      contractAddress: context.registry,
      abi: abis.registry,
      functionName: "registerMachine",
      args: [machine.machineId, machine.keyFingerprint, machine.signer],
    });
    machineTransactions.push({
      transactionHash: step.transactionHash,
      blockNumber: step.receipt.blockNumber.toString(),
    });
  }
  const policyStep = await writeContractStep({
    publicClient,
    walletClient,
    account,
    contractAddress: context.registry,
    abi: abis.registry,
    functionName: "registerPolicy",
    args: [binding, receipts],
  });
  const status = await publicClient.readContract({
    address: context.registry,
    abi: abis.registry,
    functionName: "policyStatus",
    args: [policyCommitment],
  });
  if (status !== 1) throw new Error("simulated FDC policy registration readback mismatch");
  progress("simulated-policy-registered", {
    policyCommitment,
    transactionHash: policyStep.transactionHash,
  });
  return {
    policy,
    binding,
    policyCommitment,
    machines,
    machineTransactions,
    policyTransaction: {
      transactionHash: policyStep.transactionHash,
      blockNumber: policyStep.receipt.blockNumber.toString(),
    },
  };
}

function actionRequest({ protocol, integration, context, policyRegistration, payment, fdc, accounting, observedBlock, now }) {
  const triggerProof = {
    ...fdc.payment.response,
    finalized: true,
  };
  const inputCommitment = integration.xrplPaymentInputCommitmentV1(triggerProof);
  const expiry = now + REQUEST_LIFETIME_SECONDS;
  return {
    request: {
      chainId: BigInt(COSTON2_CHAIN_ID),
      registry: context.registry,
      vault: context.vault,
      router: context.router,
      policyId: policyRegistration.policy.policyId,
      policyVersion: 1,
      policyCommitment: policyRegistration.policyCommitment,
      requestId: payment.requestId,
      requestNonce: BigInt(randomHash()),
      attempt: 0,
      requester: context.trigger,
      target: context.owner,
      asset: context.asset,
      actionType: protocol.ACTION_FTESTXRP_TRANSFER,
      amount: payment.amountDrops,
      scheduleSlot: 0n,
      occurrence: 1,
      spendCheckpoint: protocol.genesisSpendCheckpoint(policyRegistration.policyCommitment),
      balanceCheckpoint: balanceCheckpoint(context, accounting, observedBlock),
      inputCommitment,
      createdAt: now,
      graceDeadline: expiry,
      expiry,
    },
    proof: {
      merkleProof: fdc.payment.merkleProof,
      data: fdc.payment.response,
    },
    inputCommitment,
  };
}

async function consumeProof({ publicClient, walletClient, account, context, abis, protocol, integration, policyRegistration, payment, fdc }) {
  const [accountingValue, observedBlock, latestBlock] = await Promise.all([
    publicClient.readContract({
      address: context.vault,
      abi: abis.vault,
      functionName: "accounting",
      args: [context.owner, context.asset],
    }),
    publicClient.getBlockNumber(),
    publicClient.getBlock({ blockTag: "latest" }),
  ]);
  const accounting = normalizeAccounting(accountingValue);
  if (latestBlock.timestamp < fdc.payment.response.responseBody.blockTimestamp) {
    throw new Error("Coston2 timestamp is behind the XRPL proof timestamp");
  }
  const constructed = actionRequest({
    protocol,
    integration,
    context,
    policyRegistration,
    payment,
    fdc,
    accounting,
    observedBlock,
    now: latestBlock.timestamp,
  });
  const [proofCommitment, contractInputCommitment] = await Promise.all([
    publicClient.readContract({
      address: context.trigger,
      abi: abis.trigger,
      functionName: "xrplProofCommitment",
      args: [constructed.proof],
    }),
    publicClient.readContract({
      address: context.trigger,
      abi: abis.trigger,
      functionName: "xrplInputCommitment",
      args: [constructed.proof],
    }),
  ]);
  if (bytes32(proofCommitment, "trigger proof commitment") !== fdc.verification.proofCommitment
    || bytes32(contractInputCommitment, "trigger input commitment") !== constructed.inputCommitment) {
    throw new Error("cross-language FDC commitment drift");
  }
  const step = await writeContractStep({
    publicClient,
    walletClient,
    account,
    contractAddress: context.trigger,
    abi: abis.trigger,
    functionName: "consumeAndCreateRequest",
    args: [constructed.proof, constructed.request],
  });
  const triggerEvents = parseEventLogs({
    abi: abis.trigger,
    logs: step.receipt.logs,
    eventName: "XrplFdcTriggerConsumed",
    strict: true,
  });
  const routerEvents = parseEventLogs({
    abi: abis.router,
    logs: step.receipt.logs,
    eventName: "RequestCreated",
    strict: true,
  });
  if (triggerEvents.length !== 1 || routerEvents.length !== 1
    || triggerEvents[0].args.transactionId.toLowerCase() !== payment.transactionHash.toLowerCase()
    || triggerEvents[0].args.requestId.toLowerCase() !== payment.requestId.toLowerCase()
    || triggerEvents[0].args.inputCommitment.toLowerCase() !== constructed.inputCommitment.toLowerCase()) {
    throw new Error("atomic trigger event mismatch");
  }
  const [transactionConsumed, proofConsumed, stored, canonicalRequestHash] = await Promise.all([
    publicClient.readContract({ address: context.trigger, abi: abis.trigger, functionName: "transactionConsumed", args: [payment.transactionHash] }),
    publicClient.readContract({ address: context.trigger, abi: abis.trigger, functionName: "proofConsumed", args: [proofCommitment] }),
    publicClient.readContract({ address: context.router, abi: abis.router, functionName: "getRequest", args: [payment.requestId] }),
    publicClient.readContract({ address: context.router, abi: abis.router, functionName: "requestHash", args: [constructed.request] }),
  ]);
  if (transactionConsumed !== true || proofConsumed !== true || stored.status !== 1
    || stored.request.requestId.toLowerCase() !== payment.requestId.toLowerCase()
    || stored.request.inputCommitment.toLowerCase() !== constructed.inputCommitment.toLowerCase()
    || stored.request.requester !== context.trigger
    || stored.requestHash.toLowerCase() !== canonicalRequestHash.toLowerCase()) {
    throw new Error("Pending request or replay-marker readback mismatch");
  }
  progress("fdc-trigger-consumed", {
    transactionHash: step.transactionHash,
    requestId: payment.requestId,
    status: "Pending",
  });
  return {
    request: constructed.request,
    proofCommitment,
    inputCommitment: constructed.inputCommitment,
    requestHash: canonicalRequestHash,
    transactionHash: step.transactionHash,
    blockNumber: step.receipt.blockNumber,
    status: "Pending",
    statusCode: 1,
    transactionConsumed,
    proofConsumed,
    triggerEventVerified: true,
    routerEventVerified: true,
  };
}

export async function runLiveFdcTrigger() {
  const source = await sourceState({ requireClean: true });
  const [context, abis, protocolCompiled, integrationCompiled, xrpl] = await Promise.all([
    loadContext(),
    loadAbis(),
    compileProtocolRuntime(),
    compileIntegrationRuntime(),
    loadXrplBrowserRuntime(),
  ]);
  try {
    const account = configuredAccount(context.owner);
    const publicClient = client();
    const walletClient = createWalletClient({ account, chain: coston2, transport: http(COSTON2_RPC_URL) });
    const snapshot = await readRuntimeSnapshot(publicClient, context, abis, integrationCompiled.runtime);
    const requestId = randomHash();
    progress("live-run-ready", { sourceCommit: source.commit, requestId });
    const payment = await submitXrplPayment(xrpl, requestId);
    const submission = await submitFdcRequest({
      publicClient,
      walletClient,
      account,
      integration: integrationCompiled.runtime,
      dependencies: snapshot.dependencies,
      transactionHash: payment.transactionHash,
      proofOwner: context.trigger,
    });
    const fdc = await waitForFdcProof({
      publicClient,
      integration: integrationCompiled.runtime,
      context,
      dependencies: snapshot.dependencies,
      submission,
    });
    const response = fdc.payment.response.responseBody;
    if (fdc.payment.response.requestBody.transactionId.toLowerCase() !== payment.transactionHash.toLowerCase()
      || fdc.payment.response.requestBody.proofOwner !== context.trigger
      || response.blockNumber !== payment.ledgerIndex
      || response.receivedAmount !== payment.amountDrops
      || response.intendedReceivedAmount !== payment.amountDrops
      || response.hasMemoData !== true
      || response.firstMemoData.toLowerCase() !== payment.requestId.toLowerCase()
      || response.status !== 0) {
      throw new Error("FDC proof does not bind the validated XRPL payment");
    }
    const policyRegistration = await registerSimulatedPolicy({
      publicClient,
      walletClient,
      account,
      context,
      abis,
      protocol: protocolCompiled.runtime,
    });
    const consumed = await consumeProof({
      publicClient,
      walletClient,
      account,
      context,
      abis,
      protocol: protocolCompiled.runtime,
      integration: integrationCompiled.runtime,
      policyRegistration,
      payment,
      fdc,
    });
    const observedBlock = await publicClient.getBlockNumber();
    const transactionCount = policyRegistration.machineTransactions.length + 3;
    const observation = {
      chainId: COSTON2_CHAIN_ID,
      mode: "LIVE_XRPL_FDC_PENDING_SIMULATED_TEE",
      recordedAt: new Date().toISOString(),
      observedBlock: observedBlock.toString(),
      transactionCount,
      publicIdentifiers: {
        sourceCommit: source.commit,
        owner: context.owner,
        asset: context.asset,
        flareContractRegistry: getAddress(FLARE_CONTRACT_REGISTRY),
        contracts: {
          registry: context.registry,
          vault: context.vault,
          router: context.router,
          trigger: context.trigger,
          fdcVerification: context.fdcVerification,
          fdcHub: snapshot.dependencies.fdcHub,
          relay: snapshot.dependencies.relay,
        },
        coreDeploymentSourceCommit: context.coreSourceCommit,
        triggerDeploymentSourceCommit: context.triggerSourceCommit,
      },
      xrplPayment: {
        network: "xrpl-testnet",
        transactionHash: payment.transactionHash,
        ledgerIndex: payment.ledgerIndex.toString(),
        source: payment.source,
        destination: payment.destination,
        amountDrops: payment.amountDrops.toString(),
        requestIdMemo: payment.requestId,
        validated: true,
      },
      fdc: {
        requestTransactionHash: submission.transactionHash,
        requestBlockNumber: submission.blockNumber.toString(),
        requestBlockTimestamp: submission.blockTimestamp.toString(),
        votingRound: fdc.finality.votingRoundId.toString(),
        merkleRoot: fdc.finality.merkleRoot,
        proofCommitment: fdc.verification.proofCommitment,
        proofOwner: fdc.verification.proofOwner,
        onChainVerified: true,
      },
      simulatedPolicy: {
        policyId: policyRegistration.policy.policyId,
        policyCommitment: policyRegistration.policyCommitment,
        extensionId: policyRegistration.binding.extensionId,
        codeVersion: policyRegistration.binding.codeVersion,
        machineEntries: policyRegistration.machines.map((machine, index) => ({
          machineId: machine.machineId,
          keyFingerprint: machine.keyFingerprint,
          signer: machine.signer,
          registrationTransactionHash: policyRegistration.machineTransactions[index].transactionHash,
          registrationBlockNumber: policyRegistration.machineTransactions[index].blockNumber,
        })),
        registrationTransactionHash: policyRegistration.policyTransaction.transactionHash,
        registrationBlockNumber: policyRegistration.policyTransaction.blockNumber,
        status: "Active",
        mode: "SIMULATED_TEE_ONCHAIN",
      },
      request: {
        requestId: consumed.request.requestId,
        requestNonce: consumed.request.requestNonce.toString(),
        amountUBA: consumed.request.amount.toString(),
        inputCommitment: consumed.inputCommitment,
        proofCommitment: consumed.proofCommitment,
        requestHash: consumed.requestHash,
        transactionHash: consumed.transactionHash,
        blockNumber: consumed.blockNumber.toString(),
        status: consumed.status,
        statusCode: consumed.statusCode,
        transactionConsumed: consumed.transactionConsumed,
        proofConsumed: consumed.proofConsumed,
        triggerEventVerified: consumed.triggerEventVerified,
        routerEventVerified: consumed.routerEventVerified,
      },
    };
    const evidence = buildLiveFdcTriggerEvidence(observation);
    await saveEvidence(evidence);
    progress("public-evidence-written", { path: "evidence/coston2/xrpl-fdc-trigger-pending-2026-08-09.json" });
    return evidence;
  } finally {
    await Promise.allSettled([protocolCompiled.cleanup(), integrationCompiled.cleanup()]);
  }
}

function safeError(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/\bs[1-9A-HJ-NP-Za-km-z]{28,35}\b/gu, "[REDACTED_XRPL_SEED]")
    .replace(/0x[0-9a-fA-F]{64}/gu, "[REDACTED_32_BYTE_VALUE]")
    .slice(0, 1_000);
}

async function main() {
  const cli = parseLiveFdcCLI(process.argv.slice(2));
  const result = cli.mode === "plan" ? await planLiveFdcTrigger() : await runLiveFdcTrigger();
  process.stdout.write(`${publicJson(result)}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${safeError(error)}\n`);
    process.exitCode = 1;
  });
}
