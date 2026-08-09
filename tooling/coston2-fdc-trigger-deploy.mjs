import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  getAddress,
  getContractAddress,
  http,
  isAddress,
  keccak256,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  COSTON2_CHAIN_ID,
  COSTON2_RPC_URL,
  FLARE_CONTRACT_REGISTRY,
  verifyRuntimeBytecode,
} from "./coston2-deploy.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");

export const FDC_TRIGGER_STATE_PATH = resolve(root, "evidence/local/coston2-xrpl-fdc-trigger-deployment.json");
export const FDC_TRIGGER_EVIDENCE_PATH = resolve(root, "evidence/coston2/xrpl-fdc-trigger-deployment.json");
export const FDC_TRIGGER_ARTIFACT_PATH = resolve(
  root,
  "packages/contracts/out/PayGuardXrplFdcTrigger.sol/PayGuardXrplFdcTrigger.json",
);
export const MAX_PROOF_AGE_SECONDS = 3_600n;

const CORE_DEPLOYMENT_EVIDENCE_PATH = resolve(root, "evidence/coston2/contracts-deployment.json");
const minimumGasBalance = 10_000_000_000_000_000n;
const commitPattern = /^[0-9a-f]{40}$/;
const hashPattern = /^0x[0-9a-fA-F]{64}$/;
const decimalPattern = /^(0|[1-9][0-9]*)$/;
const privateFieldPattern = /^(?:privateKey|private_key|secret|seed|ciphertext|policyPlaintext|credential|password|mnemonic|signature)$/i;

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
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function publicOnly(value, label = "FDC trigger deployment") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => publicOnly(child, `${label}[${index}]`));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (privateFieldPattern.test(key)) throw new Error(`${label} contains forbidden field ${key}`);
    publicOnly(child, `${label}.${key}`);
  }
}

function address(value, label) {
  if (typeof value !== "string" || !isAddress(value) || value.toLowerCase() === zeroAddress) {
    throw new Error(`${label} must be a non-zero address`);
  }
  return getAddress(value);
}

function hash(value, label) {
  if (typeof value !== "string" || !hashPattern.test(value) || /^0x0{64}$/i.test(value)) {
    throw new Error(`${label} must be non-zero bytes32`);
  }
  return value.toLowerCase();
}

function decimal(value, label) {
  if (typeof value !== "string" || !decimalPattern.test(value)) throw new Error(`${label} must be a quoted decimal`);
  return value;
}

const assertionKeys = [
  "chainIdVerified",
  "sourceCommitCleanAtBroadcast",
  "coreRouterRuntimeVerified",
  "runtimeFdcVerificationResolved",
  "deploymentReceiptSuccessful",
  "runtimeCodeVerified",
  "constructorBindingsVerified",
  "proofAgeBoundVerified",
];

export function validateFdcTriggerDeploymentState(value, { requireComplete = false } = {}) {
  const state = record(value, "FDC trigger deployment state");
  publicOnly(state);
  if (state.schemaVersion !== 1 || !["in-progress", "verified"].includes(state.status)) throw new Error("invalid FDC trigger deployment state");
  if (!commitPattern.test(state.sourceCommit ?? "")) throw new Error("invalid FDC trigger source commit");
  address(state.deployer, "FDC trigger deployer");
  const network = record(state.network, "FDC trigger network");
  if (network.name !== "flare-coston2" || network.chainId !== COSTON2_CHAIN_ID || network.rpcUrl !== COSTON2_RPC_URL) {
    throw new Error("FDC trigger deployment must target pinned Coston2");
  }
  const dependencies = record(state.dependencies, "FDC trigger dependencies");
  if (address(dependencies.flareContractRegistry, "Flare Contract Registry") !== getAddress(FLARE_CONTRACT_REGISTRY)) {
    throw new Error("unexpected Flare Contract Registry");
  }
  address(dependencies.fdcVerification, "FdcVerification");
  address(dependencies.router, "PayGuard router");
  const artifact = record(state.artifact, "FDC trigger artifact");
  if (artifact.name !== "PayGuardXrplFdcTrigger") throw new Error("unexpected FDC trigger artifact");
  hash(artifact.creationCodeHash, "FDC trigger creation code hash");
  const configuration = record(state.configuration, "FDC trigger configuration");
  if (decimal(configuration.maxProofAgeSeconds, "max proof age") !== MAX_PROOF_AGE_SECONDS.toString()) {
    throw new Error("unexpected FDC trigger proof age");
  }
  const deployment = record(state.deployment, "FDC trigger deployment");
  address(deployment.address, "FDC trigger address");
  decimal(deployment.nonce, "FDC trigger nonce");
  if (deployment.transactionHash !== undefined) hash(deployment.transactionHash, "FDC trigger transaction");
  if (requireComplete) {
    hash(deployment.transactionHash, "FDC trigger transaction");
    decimal(deployment.blockNumber, "FDC trigger block");
    hash(deployment.runtimeCodeHash, "FDC trigger runtime code hash");
    if (deployment.receiptStatus !== "success" || deployment.runtimeVerified !== true
      || !Number.isInteger(deployment.runtimeBytes) || deployment.runtimeBytes <= 0) {
      throw new Error("FDC trigger deployment is incomplete");
    }
    const keys = Object.keys(record(state.assertions, "FDC trigger assertions")).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...assertionKeys].sort())
      || assertionKeys.some((key) => state.assertions[key] !== true)) {
      throw new Error("FDC trigger assertions are incomplete");
    }
    if (state.status !== "verified" || typeof state.verifiedAt !== "string") throw new Error("FDC trigger deployment is not verified");
    decimal(state.observedBlock, "FDC trigger observed block");
  }
  return state;
}

export function buildFdcTriggerDeploymentEvidence(value) {
  const state = validateFdcTriggerDeploymentState(value, { requireComplete: true });
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-xrpl-fdc-trigger-deployment",
    status: "verified",
    recordedAt: state.verifiedAt,
    network: {
      name: "flare-coston2",
      chainId: COSTON2_CHAIN_ID,
      observedBlock: state.observedBlock,
    },
    publicIdentifiers: {
      sourceCommit: state.sourceCommit,
      deployer: state.deployer,
      flareContractRegistry: state.dependencies.flareContractRegistry,
      fdcVerification: state.dependencies.fdcVerification,
      router: state.dependencies.router,
      trigger: state.deployment.address,
      transactionHash: state.deployment.transactionHash,
      blockNumber: state.deployment.blockNumber,
      runtimeCodeHash: state.deployment.runtimeCodeHash,
      maxProofAgeSeconds: state.configuration.maxProofAgeSeconds,
    },
    assertions: {
      ...state.assertions,
      testnetOnly: true,
      noPrivateKeyRecorded: true,
      noPolicyRecorded: true,
      noFdcProofConsumed: true,
      noRequestCreated: true,
      noFccResultClaimed: true,
      noReleaseClaimed: true,
    },
    blockers: [
      "LIVE_XRPL_FDC_TRIGGER_NOT_CONSUMED",
      "PRIVATE_FDC_DESCRIPTOR_EVALUATION_NOT_IMPLEMENTED",
      "LIVE_FCC_THRESHOLD_RESULT_NOT_VERIFIED",
    ],
    notes: [
      "This verifies only the PayGuard XRPL FDC trigger consumer deployment and constructor/runtime bindings on Coston2.",
      "No XRPL payment, FDC proof consumption, PayGuard request, private policy evaluation, FCC result, execution, or release is claimed by this record.",
    ],
  };
}

async function git(args) {
  return (await execFileAsync("git", args, { cwd: root, encoding: "utf8" })).stdout.trim();
}

async function sourceState({ requireClean = false } = {}) {
  const commit = await git(["rev-parse", "HEAD"]);
  if (!commitPattern.test(commit)) throw new Error("unable to resolve source commit");
  const status = await git(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (requireClean && status !== "") throw new Error("FDC trigger broadcast requires a clean committed worktree");
  return { commit, clean: status === "" };
}

function loadEnvironment() {
  try {
    process.loadEnvFile(resolve(root, ".env.local"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const configuredRpc = process.env.COSTON2_RPC_URL?.trim() || COSTON2_RPC_URL;
  if (configuredRpc !== COSTON2_RPC_URL) throw new Error("only the pinned credential-free Coston2 RPC is accepted");
}

function configuredDeployer() {
  loadEnvironment();
  return address(process.env.PAYGUARD_DEPLOYER_ADDRESS, "configured PayGuard deployer");
}

function deployerAccount() {
  const configured = configuredDeployer();
  const privateKey = process.env.PAYGUARD_DEPLOYER_PRIVATE_KEY;
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey ?? "")) throw new Error("PAYGUARD_DEPLOYER_PRIVATE_KEY is missing or malformed");
  const account = privateKeyToAccount(privateKey);
  if (account.address !== configured) throw new Error("configured deployer address does not match local key");
  return account;
}

async function readArtifact() {
  const value = JSON.parse(await readFile(FDC_TRIGGER_ARTIFACT_PATH, "utf8"));
  const prefix = (bytes) => typeof bytes === "string" && bytes.startsWith("0x") ? bytes : `0x${bytes ?? ""}`;
  const bytecode = prefix(value.bytecode?.object);
  const runtimeCode = prefix(value.deployedBytecode?.object);
  if (!Array.isArray(value.abi) || bytecode === "0x" || runtimeCode === "0x") throw new Error("FDC trigger artifact is incomplete");
  return {
    abi: value.abi,
    bytecode,
    runtimeCode,
    immutableReferences: value.deployedBytecode?.immutableReferences ?? {},
    creationCodeHash: keccak256(bytecode),
  };
}

async function readCoreRouter() {
  const evidence = record(JSON.parse(await readFile(CORE_DEPLOYMENT_EVIDENCE_PATH, "utf8")), "core deployment evidence");
  if (evidence.suite !== "payguard-coston2-contract-deployment" || evidence.network?.chainId !== COSTON2_CHAIN_ID
    || evidence.assertions?.runtimeCodeVerified !== true || evidence.assertions?.constructorBindingsVerified !== true) {
    throw new Error("verified Coston2 core deployment evidence is unavailable");
  }
  return address(evidence.publicIdentifiers?.contracts?.router?.address, "verified PayGuard router");
}

function clientFor() {
  return createPublicClient({ chain: coston2, transport: http(COSTON2_RPC_URL, { timeout: 15_000, retryCount: 2 }) });
}

async function resolveLiveContext(client) {
  const router = await readCoreRouter();
  const [chainId, blockNumber, registryCode, routerCode, fdcVerification] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getCode({ address: FLARE_CONTRACT_REGISTRY }),
    client.getCode({ address: router }),
    client.readContract({
      address: FLARE_CONTRACT_REGISTRY,
      abi: flareRegistryAbi,
      functionName: "getContractAddressByName",
      args: ["FdcVerification"],
    }),
  ]);
  const verification = address(fdcVerification, "runtime FdcVerification");
  const verificationCode = await client.getCode({ address: verification });
  if (chainId !== COSTON2_CHAIN_ID || !registryCode || registryCode === "0x" || !routerCode || routerCode === "0x"
    || !verificationCode || verificationCode === "0x") throw new Error("Coston2 FDC trigger dependency preflight failed");
  return {
    chainId,
    blockNumber,
    router,
    fdcVerification: verification,
    registryRuntimePresent: true,
    routerRuntimePresent: true,
    fdcVerificationRuntimePresent: true,
  };
}

async function preflight({ requireClean = false } = {}) {
  const client = clientFor();
  const deployer = configuredDeployer();
  const [{ commit, clean }, artifact, live] = await Promise.all([
    sourceState({ requireClean }),
    readArtifact(),
    resolveLiveContext(client),
  ]);
  const deploymentData = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [FLARE_CONTRACT_REGISTRY, live.fdcVerification, live.router, MAX_PROOF_AGE_SECONDS],
  });
  const [balance, gasPrice, deploymentGas] = await Promise.all([
    client.getBalance({ address: deployer }),
    client.getGasPrice(),
    client.estimateGas({ account: deployer, data: deploymentData }),
  ]);
  const estimatedCost = deploymentGas * gasPrice * 3n;
  const requiredBalance = estimatedCost > minimumGasBalance ? estimatedCost : minimumGasBalance;
  const checks = {
    chainIdMatches: live.chainId === COSTON2_CHAIN_ID,
    registryRuntimePresent: live.registryRuntimePresent,
    routerRuntimePresent: live.routerRuntimePresent,
    fdcVerificationRuntimePresent: live.fdcVerificationRuntimePresent,
    deployerHasGasBuffer: balance >= requiredBalance,
  };
  if (!Object.values(checks).every(Boolean)) throw new Error("Coston2 FDC trigger preflight failed closed");
  return {
    status: "ready",
    sourceCommit: commit,
    worktreeClean: clean,
    deployer,
    network: { name: "flare-coston2", chainId: live.chainId, rpcUrl: COSTON2_RPC_URL, observedBlock: String(live.blockNumber) },
    dependencies: {
      flareContractRegistry: getAddress(FLARE_CONTRACT_REGISTRY),
      fdcVerification: live.fdcVerification,
      router: live.router,
    },
    artifact: { name: "PayGuardXrplFdcTrigger", creationCodeHash: artifact.creationCodeHash },
    configuration: { maxProofAgeSeconds: MAX_PROOF_AGE_SECONDS.toString() },
    checks,
    estimatedDeploymentGas: deploymentGas.toString(),
    note: "Read-only preflight; no transaction was signed or broadcast.",
  };
}

async function saveJson(path, value) {
  publicOnly(value);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}

async function loadState() {
  try {
    return validateFdcTriggerDeploymentState(JSON.parse(await readFile(FDC_TRIGGER_STATE_PATH, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function verifyState(client, artifact, state) {
  validateFdcTriggerDeploymentState(state);
  const live = await resolveLiveContext(client);
  if (live.chainId !== COSTON2_CHAIN_ID || live.router !== address(state.dependencies.router, "state router")
    || live.fdcVerification !== address(state.dependencies.fdcVerification, "state FdcVerification")) {
    throw new Error("FDC trigger runtime dependency drift");
  }
  const receipt = await client.getTransactionReceipt({ hash: state.deployment.transactionHash });
  if (receipt.status !== "success" || !receipt.contractAddress
    || getAddress(receipt.contractAddress) !== address(state.deployment.address, "state trigger")) {
    throw new Error("FDC trigger deployment receipt mismatch");
  }
  const actualCode = await client.getCode({ address: state.deployment.address });
  if (!actualCode || actualCode === "0x") throw new Error("FDC trigger runtime code is unavailable");
  const runtime = verifyRuntimeBytecode(actualCode, artifact.runtimeCode, artifact.immutableReferences);
  const [registry, verification, router, maxAge, triggerChain, typeId, sourceId, runtimeVerification] = await Promise.all([
    client.readContract({ address: state.deployment.address, abi: artifact.abi, functionName: "flareContractRegistry" }),
    client.readContract({ address: state.deployment.address, abi: artifact.abi, functionName: "fdcVerification" }),
    client.readContract({ address: state.deployment.address, abi: artifact.abi, functionName: "router" }),
    client.readContract({ address: state.deployment.address, abi: artifact.abi, functionName: "maxProofAgeSeconds" }),
    client.readContract({ address: state.deployment.address, abi: artifact.abi, functionName: "COSTON2_CHAIN_ID" }),
    client.readContract({ address: state.deployment.address, abi: artifact.abi, functionName: "FDC_XRP_PAYMENT_V1" }),
    client.readContract({ address: state.deployment.address, abi: artifact.abi, functionName: "XRPL_TESTNET_SOURCE_ID" }),
    client.readContract({ address: FLARE_CONTRACT_REGISTRY, abi: flareRegistryAbi, functionName: "getContractAddressByName", args: ["FdcVerification"] }),
  ]);
  if (getAddress(registry) !== getAddress(FLARE_CONTRACT_REGISTRY)
    || getAddress(verification) !== live.fdcVerification || getAddress(runtimeVerification) !== live.fdcVerification
    || getAddress(router) !== live.router || maxAge !== MAX_PROOF_AGE_SECONDS || triggerChain !== BigInt(COSTON2_CHAIN_ID)
    || typeId.toLowerCase() !== `0x${Buffer.from("XRPPayment").toString("hex").padEnd(64, "0")}`
    || sourceId.toLowerCase() !== `0x${Buffer.from("testXRP").toString("hex").padEnd(64, "0")}`) {
    throw new Error("FDC trigger constructor or protocol binding mismatch");
  }
  Object.assign(state.deployment, {
    blockNumber: String(receipt.blockNumber),
    receiptStatus: receipt.status,
    runtimeCodeHash: runtime.runtimeCodeHash,
    runtimeBytes: runtime.runtimeBytes,
    runtimeVerified: true,
  });
  state.status = "verified";
  state.verifiedAt = new Date().toISOString();
  state.observedBlock = String(await client.getBlockNumber());
  state.assertions = Object.fromEntries(assertionKeys.map((key) => [key, true]));
  return validateFdcTriggerDeploymentState(state, { requireComplete: true });
}

export async function planFdcTriggerDeployment() {
  return preflight();
}

export async function deployFdcTrigger({ broadcast = false } = {}) {
  if (!broadcast) throw new Error("FDC trigger deployment requires explicit --broadcast");
  const ready = await preflight({ requireClean: true });
  const account = deployerAccount();
  if (account.address !== ready.deployer) throw new Error("FDC trigger deployer changed after preflight");
  const client = clientFor();
  const artifact = await readArtifact();
  let state = await loadState();
  if (!state) {
    const nonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
    state = {
      schemaVersion: 1,
      status: "in-progress",
      sourceCommit: ready.sourceCommit,
      deployer: account.address,
      network: { name: "flare-coston2", chainId: COSTON2_CHAIN_ID, rpcUrl: COSTON2_RPC_URL },
      dependencies: ready.dependencies,
      artifact: ready.artifact,
      configuration: ready.configuration,
      deployment: {
        address: getContractAddress({ from: account.address, nonce: BigInt(nonce) }),
        nonce: String(nonce),
      },
      assertions: {},
    };
    await saveJson(FDC_TRIGGER_STATE_PATH, state);
  }
  if (state.sourceCommit !== ready.sourceCommit || state.deployer !== account.address
    || JSON.stringify(state.dependencies) !== JSON.stringify(ready.dependencies)
    || state.artifact.creationCodeHash !== artifact.creationCodeHash) {
    throw new Error("FDC trigger deployment resume state mismatch");
  }
  if (!state.deployment.transactionHash) {
    const plannedNonce = Number(decimal(state.deployment.nonce, "planned FDC trigger nonce"));
    const pendingNonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
    if (plannedNonce !== pendingNonce) throw new Error("FDC trigger planned nonce is no longer safe");
    const existing = await client.getCode({ address: state.deployment.address });
    if (existing && existing !== "0x") throw new Error("untracked code exists at planned FDC trigger address");
    const wallet = createWalletClient({ account, chain: coston2, transport: http(COSTON2_RPC_URL, { timeout: 15_000, retryCount: 2 }) });
    state.deployment.transactionHash = await wallet.deployContract({
      account,
      chain: coston2,
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      args: [FLARE_CONTRACT_REGISTRY, ready.dependencies.fdcVerification, ready.dependencies.router, MAX_PROOF_AGE_SECONDS],
      nonce: plannedNonce,
    });
    await saveJson(FDC_TRIGGER_STATE_PATH, state);
  }
  await client.waitForTransactionReceipt({ hash: state.deployment.transactionHash, confirmations: 2, timeout: 180_000 });
  state = await verifyState(client, artifact, state);
  await saveJson(FDC_TRIGGER_STATE_PATH, state);
  await saveJson(FDC_TRIGGER_EVIDENCE_PATH, buildFdcTriggerDeploymentEvidence(state));
  return {
    status: state.status,
    sourceCommit: state.sourceCommit,
    trigger: state.deployment.address,
    transactionHash: state.deployment.transactionHash,
    observedBlock: state.observedBlock,
    evidence: "evidence/coston2/xrpl-fdc-trigger-deployment.json",
  };
}

export async function verifyFdcTriggerDeployment() {
  const state = await loadState();
  if (!state) throw new Error("local FDC trigger deployment state does not exist");
  const client = clientFor();
  const artifact = await readArtifact();
  const verified = await verifyState(client, artifact, state);
  await saveJson(FDC_TRIGGER_STATE_PATH, verified);
  await saveJson(FDC_TRIGGER_EVIDENCE_PATH, buildFdcTriggerDeploymentEvidence(verified));
  return { status: verified.status, trigger: verified.deployment.address, observedBlock: verified.observedBlock };
}

async function main() {
  const mode = process.argv[2] ?? "plan";
  let result;
  if (mode === "plan") result = await planFdcTriggerDeployment();
  else if (mode === "deploy") result = await deployFdcTrigger({ broadcast: process.argv.includes("--broadcast") });
  else if (mode === "verify") result = await verifyFdcTriggerDeployment();
  else throw new Error(`unknown FDC trigger deployment mode: ${mode}`);
  console.log(JSON.stringify(result));
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
