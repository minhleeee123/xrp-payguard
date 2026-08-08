import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
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

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");

export const COSTON2_CHAIN_ID = 114;
export const COSTON2_RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";
export const FLARE_CONTRACT_REGISTRY = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";
export const DEPLOYMENT_STATE_PATH = resolve(root, "evidence/local/coston2-contract-deployment.json");
export const DEPLOYMENT_EVIDENCE_PATH = resolve(root, "evidence/coston2/contracts-deployment.json");

const coston2 = {
  id: COSTON2_CHAIN_ID,
  name: "Flare Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [COSTON2_RPC_URL] } },
};

const artifactPaths = {
  registry: "packages/contracts/out/PayGuardPolicyRegistry.sol/PayGuardPolicyRegistry.json",
  vault: "packages/contracts/out/PayGuardVault.sol/PayGuardVault.json",
  router: "packages/contracts/out/PayGuardActionRouter.sol/PayGuardActionRouter.json",
};

const contractNames = {
  registry: "PayGuardPolicyRegistry",
  vault: "PayGuardVault",
  router: "PayGuardActionRouter",
};

const flareRegistryAbi = [{
  type: "function",
  name: "getContractAddressByName",
  stateMutability: "view",
  inputs: [{ name: "_name", type: "string" }],
  outputs: [{ name: "", type: "address" }],
}];

const assetManagerAbi = [{
  type: "function",
  name: "fAsset",
  stateMutability: "view",
  inputs: [],
  outputs: [{ name: "", type: "address" }],
}];

const tokenAbi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
];

const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const hashPattern = /^0x[0-9a-fA-F]{64}$/;
const commitPattern = /^[0-9a-f]{40}$/;
const decimalPattern = /^(0|[1-9][0-9]*)$/;
const privateFieldPattern = /^(?:privateKey|private_key|secret|seed|ciphertext|policyPlaintext|credential|password|mnemonic|signature)$/i;

function requireRecord(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function inspectPublicOnly(value, label = "deployment state") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => inspectPublicOnly(child, `${label}[${index}]`));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (privateFieldPattern.test(key)) throw new Error(`${label} contains forbidden field ${key}`);
    inspectPublicOnly(child, `${label}.${key}`);
  }
}

function requireAddress(value, label) {
  if (typeof value !== "string" || !addressPattern.test(value) || value.toLowerCase() === zeroAddress) {
    throw new Error(`${label} must be a non-zero address`);
  }
  return getAddress(value);
}

function requireHash(value, label) {
  if (typeof value !== "string" || !hashPattern.test(value) || /^0x0{64}$/i.test(value)) throw new Error(`${label} must be non-zero bytes32`);
  return value.toLowerCase();
}

function requireDecimal(value, label) {
  if (typeof value !== "string" || !decimalPattern.test(value)) throw new Error(`${label} must be a quoted decimal`);
  return value;
}

export function validateDeploymentState(value, { requireComplete = false } = {}) {
  const state = requireRecord(value, "deployment state");
  inspectPublicOnly(state);
  if (state.schemaVersion !== 1) throw new Error("unsupported deployment state schema");
  if (state.status !== "in-progress" && state.status !== "verified") throw new Error("invalid deployment state status");
  if (!commitPattern.test(state.sourceCommit ?? "")) throw new Error("deployment sourceCommit must be 40 lowercase hex characters");
  requireAddress(state.deployer, "deployment deployer");
  const network = requireRecord(state.network, "deployment network");
  if (network.name !== "flare-coston2" || network.chainId !== COSTON2_CHAIN_ID || network.rpcUrl !== COSTON2_RPC_URL) {
    throw new Error("deployment state must target the pinned Coston2 network");
  }
  const dependencies = requireRecord(state.dependencies, "deployment dependencies");
  if (requireAddress(dependencies.flareContractRegistry, "Flare contract registry") !== getAddress(FLARE_CONTRACT_REGISTRY)) {
    throw new Error("deployment state has an unexpected Flare Contract Registry");
  }
  requireAddress(dependencies.assetManagerFxrp, "AssetManagerFXRP");
  requireAddress(dependencies.fTestXrp, "FTestXRP");
  if (dependencies.symbol !== "FTestXRP" || dependencies.decimals !== 6) throw new Error("unexpected FTestXRP metadata");
  const contracts = requireRecord(state.contracts, "deployment contracts");
  for (const key of Object.keys(contractNames)) {
    const entry = contracts[key];
    if (!entry) {
      if (requireComplete) throw new Error(`${contractNames[key]} deployment is missing`);
      continue;
    }
    if (entry.name !== contractNames[key]) throw new Error(`${contractNames[key]} name mismatch`);
    requireAddress(entry.address, `${contractNames[key]} address`);
    requireDecimal(entry.nonce, `${contractNames[key]} nonce`);
    requireHash(entry.creationCodeHash, `${contractNames[key]} creation code hash`);
    if (entry.transactionHash !== undefined) requireHash(entry.transactionHash, `${contractNames[key]} transaction hash`);
    if (entry.blockNumber !== undefined) requireDecimal(entry.blockNumber, `${contractNames[key]} block number`);
    if (entry.runtimeCodeHash !== undefined) requireHash(entry.runtimeCodeHash, `${contractNames[key]} runtime code hash`);
    if (requireComplete && (entry.runtimeVerified !== true || entry.receiptStatus !== "success" || !entry.transactionHash || !entry.blockNumber || !entry.runtimeCodeHash || !Number.isInteger(entry.runtimeBytes) || entry.runtimeBytes <= 0)) {
      throw new Error(`${contractNames[key]} deployment is incomplete`);
    }
  }
  if (requireComplete) {
    const wiring = requireRecord(state.wiring, "deployment wiring");
    for (const key of ["vaultRouter", "supportedFTestXrp"]) {
      const entry = requireRecord(wiring[key], `deployment wiring ${key}`);
      requireDecimal(entry.nonce, `${key} nonce`);
      requireHash(entry.transactionHash, `${key} transaction hash`);
      requireDecimal(entry.blockNumber, `${key} block number`);
      if (entry.verified !== true || entry.receiptStatus !== "success") throw new Error(`${key} wiring is incomplete`);
    }
    const assertions = requireRecord(state.assertions, "deployment assertions");
    if (Object.values(assertions).some((result) => result !== true)) throw new Error("all deployment assertions must be true");
    if (state.status !== "verified" || typeof state.verifiedAt !== "string") throw new Error("deployment state is not verified");
    requireDecimal(state.observedBlock, "deployment observed block");
  }
  return state;
}

function hexBytes(value, label) {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) throw new Error(`${label} must be byte-aligned hex`);
  return Uint8Array.from(Buffer.from(value.slice(2), "hex"));
}

export function verifyRuntimeBytecode(actualCode, artifactRuntimeCode, immutableReferences = {}) {
  const actual = hexBytes(actualCode, "actual runtime code");
  const expected = hexBytes(artifactRuntimeCode, "artifact runtime code");
  if (actual.length === 0 || actual.length !== expected.length) throw new Error("runtime bytecode length mismatch");
  const immutable = new Uint8Array(expected.length);
  for (const references of Object.values(immutableReferences ?? {})) {
    if (!Array.isArray(references)) throw new Error("malformed artifact immutable references");
    for (const reference of references) {
      const start = reference?.start;
      const length = reference?.length;
      if (!Number.isInteger(start) || !Number.isInteger(length) || start < 0 || length <= 0 || start + length > expected.length) {
        throw new Error("malformed artifact immutable range");
      }
      immutable.fill(1, start, start + length);
    }
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (immutable[index] === 0 && actual[index] !== expected[index]) {
      throw new Error(`runtime bytecode mismatch outside immutable range at byte ${index}`);
    }
  }
  return { runtimeCodeHash: keccak256(actualCode), runtimeBytes: actual.length };
}

export function buildDeploymentEvidence(state) {
  validateDeploymentState(state, { requireComplete: true });
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-contract-deployment",
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
      assetManagerFxrp: state.dependencies.assetManagerFxrp,
      fTestXrp: state.dependencies.fTestXrp,
      contracts: Object.fromEntries(Object.entries(state.contracts).map(([key, entry]) => [key, {
        name: entry.name,
        address: entry.address,
        transactionHash: entry.transactionHash,
        blockNumber: entry.blockNumber,
        runtimeCodeHash: entry.runtimeCodeHash,
      }])),
      wiring: state.wiring,
    },
    assertions: {
      chainIdVerified: true,
      officialAssetResolutionVerified: true,
      sourceCommitCleanAtBroadcast: true,
      deploymentReceiptsSuccessful: true,
      runtimeCodeVerified: true,
      constructorBindingsVerified: true,
      vaultRouterVerified: true,
      supportedAssetVerified: true,
      testnetOnly: true,
      noPrivateKeyRecorded: true,
      noFccReleaseClaimed: true,
    },
    notes: [
      "This proves the three PayGuard contracts and their vault wiring on Coston2.",
      "It does not prove FCC registration, custody, evaluation, FDC, Smart Account, FAssets mint, XRP movement, or a complete PayGuard release.",
    ],
  };
}

async function readArtifact(relativePath) {
  const artifact = JSON.parse(await readFile(resolve(root, relativePath), "utf8"));
  const withHexPrefix = (value) => typeof value === "string" && value.startsWith("0x") ? value : `0x${value ?? ""}`;
  const bytecode = withHexPrefix(artifact.bytecode?.object);
  const runtimeCode = withHexPrefix(artifact.deployedBytecode?.object);
  if (!Array.isArray(artifact.abi) || bytecode === "0x" || runtimeCode === "0x") throw new Error(`incomplete Foundry artifact ${relativePath}`);
  hexBytes(bytecode, `${relativePath} creation bytecode`);
  hexBytes(runtimeCode, `${relativePath} runtime bytecode`);
  return {
    abi: artifact.abi,
    bytecode,
    runtimeCode,
    immutableReferences: artifact.deployedBytecode?.immutableReferences ?? {},
    creationCodeHash: keccak256(bytecode),
  };
}

async function readArtifacts() {
  return Object.fromEntries(await Promise.all(Object.entries(artifactPaths).map(async ([key, path]) => [key, await readArtifact(path)])));
}

async function git(args) {
  const result = await execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  return result.stdout.trim();
}

async function sourceCommit({ requireClean }) {
  const commit = await git(["rev-parse", "HEAD"]);
  if (!commitPattern.test(commit)) throw new Error("unable to resolve the source commit");
  if (requireClean) {
    const status = await git(["status", "--porcelain=v1", "--untracked-files=all"]);
    if (status !== "") throw new Error("broadcast requires a clean worktree committed at sourceCommit");
  }
  return commit;
}

async function saveJson(path, value) {
  inspectPublicOnly(value);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}

async function loadState() {
  try {
    return validateDeploymentState(JSON.parse(await readFile(DEPLOYMENT_STATE_PATH, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function resolveDependencies(client) {
  const registryCode = await client.getBytecode({ address: FLARE_CONTRACT_REGISTRY });
  if (!registryCode || registryCode === "0x") throw new Error("Flare Contract Registry has no Coston2 runtime code");
  const assetManagerFxrp = requireAddress(await client.readContract({
    address: FLARE_CONTRACT_REGISTRY,
    abi: flareRegistryAbi,
    functionName: "getContractAddressByName",
    args: ["AssetManagerFXRP"],
  }), "resolved AssetManagerFXRP");
  const assetManagerCode = await client.getBytecode({ address: assetManagerFxrp });
  if (!assetManagerCode || assetManagerCode === "0x") throw new Error("resolved AssetManagerFXRP has no runtime code");
  const fTestXrp = requireAddress(await client.readContract({
    address: assetManagerFxrp,
    abi: assetManagerAbi,
    functionName: "fAsset",
  }), "resolved FTestXRP");
  const tokenCode = await client.getBytecode({ address: fTestXrp });
  if (!tokenCode || tokenCode === "0x") throw new Error("resolved FTestXRP has no runtime code");
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: fTestXrp, abi: tokenAbi, functionName: "symbol" }),
    client.readContract({ address: fTestXrp, abi: tokenAbi, functionName: "decimals" }),
  ]);
  if (symbol !== "FTestXRP" || decimals !== 6) throw new Error("resolved FTestXRP metadata mismatch");
  return {
    flareContractRegistry: getAddress(FLARE_CONTRACT_REGISTRY),
    assetManagerFxrp,
    fTestXrp,
    symbol,
    decimals,
  };
}

function clientFor(rpcUrl) {
  return createPublicClient({ chain: coston2, transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }) });
}

function artifactArgs(key, state) {
  if (key === "registry" || key === "vault") return [state.deployer];
  return [state.contracts.registry.address, state.contracts.vault.address];
}

async function verifyContractRuntime(client, key, entry, artifact) {
  const actualCode = await client.getBytecode({ address: entry.address });
  if (!actualCode || actualCode === "0x") throw new Error(`${contractNames[key]} has no deployed runtime code`);
  return verifyRuntimeBytecode(actualCode, artifact.runtimeCode, artifact.immutableReferences);
}

async function verifyReceipt(client, entry, label) {
  if (!entry.transactionHash) throw new Error(`${label} transaction hash is missing`);
  const receipt = await client.getTransactionReceipt({ hash: entry.transactionHash });
  if (receipt.status !== "success") throw new Error(`${label} transaction reverted`);
  return receipt;
}

async function deployContractStep({ client, wallet, account, artifacts, state, key }) {
  const artifact = artifacts[key];
  let entry = state.contracts[key];
  if (!entry) {
    const nonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
    entry = {
      name: contractNames[key],
      address: getContractAddress({ from: account.address, nonce: BigInt(nonce) }),
      nonce: String(nonce),
      creationCodeHash: artifact.creationCodeHash,
    };
    state.contracts[key] = entry;
    await saveJson(DEPLOYMENT_STATE_PATH, state);
  }
  if (entry.creationCodeHash !== artifact.creationCodeHash) throw new Error(`${contractNames[key]} artifact changed during resume`);
  const existingCode = await client.getBytecode({ address: entry.address });
  if (!existingCode || existingCode === "0x") {
    const nonce = Number(requireDecimal(entry.nonce, `${contractNames[key]} nonce`));
    const pendingNonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
    if (pendingNonce !== nonce) throw new Error(`${contractNames[key]} planned nonce is no longer safe to broadcast`);
    const args = artifactArgs(key, state);
    const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args });
    await client.estimateGas({ account: account.address, data, nonce });
    const transactionHash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args, account, chain: coston2, nonce });
    entry.transactionHash = transactionHash;
    await saveJson(DEPLOYMENT_STATE_PATH, state);
  }
  const receipt = entry.transactionHash
    ? await client.waitForTransactionReceipt({ hash: entry.transactionHash, confirmations: 2, timeout: 180_000 })
    : undefined;
  if (!receipt || receipt.status !== "success" || !receipt.contractAddress || getAddress(receipt.contractAddress) !== getAddress(entry.address)) {
    throw new Error(`${contractNames[key]} deployment receipt mismatch`);
  }
  const runtime = await verifyContractRuntime(client, key, entry, artifact);
  Object.assign(entry, {
    address: getAddress(entry.address),
    blockNumber: String(receipt.blockNumber),
    receiptStatus: receipt.status,
    runtimeCodeHash: runtime.runtimeCodeHash,
    runtimeBytes: runtime.runtimeBytes,
    runtimeVerified: true,
  });
  await saveJson(DEPLOYMENT_STATE_PATH, state);
}

async function writeStep({ client, wallet, account, state, key, address, abi, functionName, args }) {
  let entry = state.wiring[key];
  if (!entry) {
    const nonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
    entry = { nonce: String(nonce), functionName };
    state.wiring[key] = entry;
    await saveJson(DEPLOYMENT_STATE_PATH, state);
  }
  if (!entry.transactionHash) {
    const nonce = Number(requireDecimal(entry.nonce, `${key} nonce`));
    const pendingNonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
    if (pendingNonce !== nonce) throw new Error(`${key} planned nonce is no longer safe to broadcast`);
    const simulation = await client.simulateContract({ address, abi, functionName, args, account: account.address, nonce });
    entry.transactionHash = await wallet.writeContract({ ...simulation.request, account, chain: coston2, nonce });
    await saveJson(DEPLOYMENT_STATE_PATH, state);
  }
  const receipt = await client.waitForTransactionReceipt({ hash: entry.transactionHash, confirmations: 2, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error(`${key} wiring transaction reverted`);
  Object.assign(entry, { blockNumber: String(receipt.blockNumber), receiptStatus: receipt.status });
  await saveJson(DEPLOYMENT_STATE_PATH, state);
}

async function verifyDeployment(client, artifacts, state) {
  validateDeploymentState(state);
  if (await client.getChainId() !== COSTON2_CHAIN_ID) throw new Error("connected chain is not Coston2");
  const resolved = await resolveDependencies(client);
  if (JSON.stringify(resolved) !== JSON.stringify(state.dependencies)) throw new Error("official dependency resolution drifted");
  for (const key of Object.keys(contractNames)) {
    const entry = state.contracts[key];
    if (!entry) throw new Error(`${contractNames[key]} deployment is missing`);
    const receipt = await verifyReceipt(client, entry, contractNames[key]);
    if (receipt.contractAddress && getAddress(receipt.contractAddress) !== getAddress(entry.address)) throw new Error(`${contractNames[key]} receipt address mismatch`);
    const runtime = await verifyContractRuntime(client, key, entry, artifacts[key]);
    if (entry.runtimeCodeHash && runtime.runtimeCodeHash !== entry.runtimeCodeHash) throw new Error(`${contractNames[key]} runtime hash drifted`);
    Object.assign(entry, {
      blockNumber: String(receipt.blockNumber),
      receiptStatus: receipt.status,
      runtimeCodeHash: runtime.runtimeCodeHash,
      runtimeBytes: runtime.runtimeBytes,
      runtimeVerified: true,
    });
  }
  const registry = state.contracts.registry;
  const vault = state.contracts.vault;
  const router = state.contracts.router;
  const [registryAdmin, vaultAdmin, routerRegistry, routerVault, wiredRouter, supported] = await Promise.all([
    client.readContract({ address: registry.address, abi: artifacts.registry.abi, functionName: "admin" }),
    client.readContract({ address: vault.address, abi: artifacts.vault.abi, functionName: "admin" }),
    client.readContract({ address: router.address, abi: artifacts.router.abi, functionName: "registry" }),
    client.readContract({ address: router.address, abi: artifacts.router.abi, functionName: "vault" }),
    client.readContract({ address: vault.address, abi: artifacts.vault.abi, functionName: "router" }),
    client.readContract({ address: vault.address, abi: artifacts.vault.abi, functionName: "supportedAsset", args: [state.dependencies.fTestXrp] }),
  ]);
  if ([registryAdmin, vaultAdmin].some((value) => getAddress(value) !== getAddress(state.deployer))) throw new Error("admin constructor binding mismatch");
  if (getAddress(routerRegistry) !== getAddress(registry.address) || getAddress(routerVault) !== getAddress(vault.address)) throw new Error("router constructor binding mismatch");
  if (getAddress(wiredRouter) !== getAddress(router.address)) throw new Error("vault router wiring mismatch");
  if (supported !== true) throw new Error("FTestXRP support is not enabled");
  for (const key of ["vaultRouter", "supportedFTestXrp"]) {
    const receipt = await verifyReceipt(client, state.wiring[key] ?? {}, key);
    Object.assign(state.wiring[key], { blockNumber: String(receipt.blockNumber), receiptStatus: receipt.status, verified: true });
  }
  state.status = "verified";
  state.verifiedAt = new Date().toISOString();
  state.observedBlock = String(await client.getBlockNumber());
  state.assertions = {
    chainIdVerified: true,
    officialAssetResolutionVerified: true,
    sourceCommitCleanAtBroadcast: true,
    deploymentReceiptsSuccessful: true,
    runtimeCodeVerified: true,
    constructorBindingsVerified: true,
    vaultRouterVerified: true,
    supportedAssetVerified: true,
  };
  validateDeploymentState(state, { requireComplete: true });
  return state;
}

function loadDeployer() {
  try {
    process.loadEnvFile(resolve(root, ".env.local"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const value = process.env.PAYGUARD_DEPLOYER_PRIVATE_KEY;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value ?? "")) throw new Error("PAYGUARD_DEPLOYER_PRIVATE_KEY is missing or malformed");
  const account = privateKeyToAccount(value);
  const expected = process.env.PAYGUARD_DEPLOYER_ADDRESS;
  if (expected && (!isAddress(expected) || getAddress(expected) !== account.address)) throw new Error("configured deployer address does not match the local key");
  return account;
}

export async function planCoston2Deployment({ rpcUrl = COSTON2_RPC_URL } = {}) {
  if (rpcUrl !== COSTON2_RPC_URL) throw new Error("only the pinned credential-free Coston2 RPC is accepted");
  const client = clientFor(rpcUrl);
  const [chainId, blockNumber, dependencies, artifacts, commit] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    resolveDependencies(client),
    readArtifacts(),
    sourceCommit({ requireClean: false }),
  ]);
  if (chainId !== COSTON2_CHAIN_ID) throw new Error("connected chain is not Coston2");
  return {
    status: "planned",
    sourceCommit: commit,
    network: { name: "flare-coston2", chainId, rpcUrl, observedBlock: String(blockNumber) },
    dependencies,
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([key, artifact]) => [key, { name: contractNames[key], creationCodeHash: artifact.creationCodeHash }])),
    note: "Read-only plan only; no transaction was signed or broadcast.",
  };
}

export async function deployCoston2({ broadcast = false, rpcUrl = COSTON2_RPC_URL } = {}) {
  if (!broadcast) throw new Error("deployment requires the explicit --broadcast flag");
  if (rpcUrl !== COSTON2_RPC_URL) throw new Error("only the pinned credential-free Coston2 RPC is accepted");
  const commit = await sourceCommit({ requireClean: true });
  const account = loadDeployer();
  const client = clientFor(rpcUrl);
  if (await client.getChainId() !== COSTON2_CHAIN_ID) throw new Error("connected chain is not Coston2");
  const [dependencies, artifacts] = await Promise.all([resolveDependencies(client), readArtifacts()]);
  let state = await loadState();
  if (!state) {
    state = {
      schemaVersion: 1,
      status: "in-progress",
      sourceCommit: commit,
      deployer: account.address,
      network: { name: "flare-coston2", chainId: COSTON2_CHAIN_ID, rpcUrl },
      dependencies,
      contracts: {},
      wiring: {},
      assertions: {},
    };
    await saveJson(DEPLOYMENT_STATE_PATH, state);
  }
  if (state.sourceCommit !== commit || getAddress(state.deployer) !== account.address) throw new Error("deployment resume source/deployer mismatch");
  if (JSON.stringify(state.dependencies) !== JSON.stringify(dependencies)) throw new Error("deployment resume dependency mismatch");
  const wallet = createWalletClient({ account, chain: coston2, transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }) });
  for (const key of ["registry", "vault", "router"]) {
    await deployContractStep({ client, wallet, account, artifacts, state, key });
  }
  const currentRouter = await client.readContract({ address: state.contracts.vault.address, abi: artifacts.vault.abi, functionName: "router" });
  if (currentRouter === zeroAddress) {
    await writeStep({ client, wallet, account, state, key: "vaultRouter", address: state.contracts.vault.address, abi: artifacts.vault.abi, functionName: "setRouter", args: [state.contracts.router.address] });
  } else if (getAddress(currentRouter) !== getAddress(state.contracts.router.address)) {
    throw new Error("vault is already wired to an unexpected router");
  } else if (!state.wiring.vaultRouter?.transactionHash) {
    throw new Error("vault router is wired but its deployment transaction is missing from resume state");
  }
  const supported = await client.readContract({ address: state.contracts.vault.address, abi: artifacts.vault.abi, functionName: "supportedAsset", args: [dependencies.fTestXrp] });
  if (!supported) {
    await writeStep({ client, wallet, account, state, key: "supportedFTestXrp", address: state.contracts.vault.address, abi: artifacts.vault.abi, functionName: "setSupportedAsset", args: [dependencies.fTestXrp, true] });
  } else if (!state.wiring.supportedFTestXrp?.transactionHash) {
    throw new Error("FTestXRP is enabled but its transaction is missing from resume state");
  }
  state = await verifyDeployment(client, artifacts, state);
  await saveJson(DEPLOYMENT_STATE_PATH, state);
  await saveJson(DEPLOYMENT_EVIDENCE_PATH, buildDeploymentEvidence(state));
  return {
    status: state.status,
    sourceCommit: state.sourceCommit,
    deployer: state.deployer,
    contracts: Object.fromEntries(Object.entries(state.contracts).map(([key, entry]) => [key, entry.address])),
    observedBlock: state.observedBlock,
    evidence: "evidence/coston2/contracts-deployment.json",
  };
}

export async function verifyCoston2Deployment({ rpcUrl = COSTON2_RPC_URL } = {}) {
  if (rpcUrl !== COSTON2_RPC_URL) throw new Error("only the pinned credential-free Coston2 RPC is accepted");
  const state = await loadState();
  if (!state) throw new Error("local Coston2 deployment state does not exist");
  const client = clientFor(rpcUrl);
  const artifacts = await readArtifacts();
  const verified = await verifyDeployment(client, artifacts, state);
  await saveJson(DEPLOYMENT_STATE_PATH, verified);
  const evidence = buildDeploymentEvidence(verified);
  await saveJson(DEPLOYMENT_EVIDENCE_PATH, evidence);
  return {
    status: verified.status,
    sourceCommit: verified.sourceCommit,
    contracts: Object.fromEntries(Object.entries(verified.contracts).map(([key, entry]) => [key, entry.address])),
    observedBlock: verified.observedBlock,
  };
}

async function main() {
  const mode = process.argv[2] ?? "plan";
  let result;
  if (mode === "plan") result = await planCoston2Deployment();
  else if (mode === "deploy") result = await deployCoston2({ broadcast: process.argv.includes("--broadcast") });
  else if (mode === "verify") result = await verifyCoston2Deployment();
  else throw new Error(`unknown deployment mode: ${mode}`);
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
