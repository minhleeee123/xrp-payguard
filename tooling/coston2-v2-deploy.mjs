import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  getAddress,
  getContractAddress,
  http,
  isAddress,
  keccak256,
  padHex,
  parseAbi,
  stringToHex,
  toHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { COSTON2_CHAIN_ID, COSTON2_RPC_URL, FLARE_CONTRACT_REGISTRY, verifyRuntimeBytecode } from "./coston2-deploy.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
export const V2_STATE_PATH = resolve(root, ".local/deployments/coston2-v2.json");
export const V2_EVIDENCE_PATH = resolve(root, "evidence/coston2/contracts-v2-simulated.json");
export const TEE_MANAGER = getAddress("0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE");
export const EXTENSION_ID = 66_037n;
export const CODE_HASH = "0x194844cf417dde867073e5ab7199fa4d21fd82b5dbe2bdea8b3d7fc18d10fdc2";
export const SIMULATED_PLATFORM = padHex(stringToHex("TEST_PLATFORM"), { size: 32, dir: "right" });
export const MACHINE_SIGNERS = [
  getAddress("0x1C911D007f8203484eD4099bC11849d7e9691044"),
  getAddress("0xff49A99535b8c52345D3c0b76bCf60194De7C29b"),
  getAddress("0xd871bc2044a75e8cc2CF06aCdeaDC4CBbEef349A"),
];

const chain = {
  id: COSTON2_CHAIN_ID,
  name: "Flare Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [COSTON2_RPC_URL] } },
};
const artifacts = {
  registry: { name: "PayGuardPolicyRegistryV2", path: "packages/contracts/out/PayGuardPolicyRegistryV2.sol/PayGuardPolicyRegistryV2.json" },
  vault: { name: "PayGuardVault", path: "packages/contracts/out/PayGuardVault.sol/PayGuardVault.json" },
  router: { name: "PayGuardActionRouter", path: "packages/contracts/out/PayGuardActionRouter.sol/PayGuardActionRouter.json" },
};
const registryLookupAbi = parseAbi(["function getContractAddressByName(string) view returns (address)"]);
const assetManagerAbi = parseAbi(["function fAsset() view returns (address)"]);
const tokenAbi = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);
const managerAbi = parseAbi([
  "function getTeeMachine(address) view returns ((address teeId,address teeProxyId,string url))",
  "function getTeeMachineWithAttestationData(address) view returns ((address teeId,address initialTeeId,string url,bytes32 codeHash,bytes32 platform))",
  "function getTeeMachineStatus(address) view returns (uint8)",
  "function getExtensionId(address) view returns (uint256)",
  "function isCodeHashPlatformSupported(uint256,bytes32,bytes32) view returns (bool)",
  "function isCodeHashPlatformDisabled(uint256,bytes32,bytes32) view returns (bool)",
]);
const commitPattern = /^[0-9a-f]{40}$/;
const hashPattern = /^0x[0-9a-f]{64}$/;
const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const forbiddenKey = /^(?:privateKey|private_key|secret|seed|ciphertext|policyPlaintext|credential|password|mnemonic|signature)$/i;

function inspectPublicOnly(value, label = "V2 deployment") {
  if (Array.isArray(value)) return value.forEach((item, index) => inspectPublicOnly(item, `${label}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKey.test(key)) throw new Error(`${label} contains forbidden field ${key}`);
    inspectPublicOnly(child, `${label}.${key}`);
  }
}

export function validateV2DeploymentEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("V2 evidence must be an object");
  inspectPublicOnly(value);
  if (value.schemaVersion !== 1 || value.suite !== "payguard-coston2-v2-simulated-deployment") throw new Error("unexpected V2 evidence schema");
  if (value.status !== "live-candidate" || value.verifiedRelease !== false || value.hardwareTeeVerified !== false || value.simulatedTee !== true) {
    throw new Error("V2 evidence must retain simulated candidate boundaries");
  }
  if (value.network?.chainId !== COSTON2_CHAIN_ID || value.profile !== "COSTON2_SIMULATED_V2") throw new Error("V2 evidence must bind Coston2 simulated profile");
  if (!commitPattern.test(value.sourceCommit ?? "")) throw new Error("V2 evidence source commit is invalid");
  if (getAddress(value.teeManager) !== TEE_MANAGER || value.extensionId !== String(EXTENSION_ID) || value.codeHash !== CODE_HASH) throw new Error("V2 FCC bindings are invalid");
  for (const key of Object.keys(artifacts)) {
    const entry = value.contracts?.[key];
    if (!entry || entry.name !== artifacts[key].name || !addressPattern.test(entry.address ?? "") || !hashPattern.test(entry.transactionHash ?? "") || !hashPattern.test(entry.runtimeCodeHash ?? "")) {
      throw new Error(`V2 ${key} evidence is incomplete`);
    }
  }
  if (!Array.isArray(value.machines) || value.machines.length !== 3 || value.machines.some((machine) => machine.status !== 2 || machine.simulated !== true)) {
    throw new Error("V2 evidence requires three live simulated production machines");
  }
  if (!value.assertions || Object.values(value.assertions).some((assertion) => assertion !== true)) throw new Error("all V2 deployment assertions must be true");
  return value;
}

async function artifact(path) {
  const value = JSON.parse(await readFile(resolve(root, path), "utf8"));
  const prefix = (hex) => hex?.startsWith("0x") ? hex : `0x${hex ?? ""}`;
  const bytecode = prefix(value.bytecode?.object);
  const runtime = prefix(value.deployedBytecode?.object);
  if (!Array.isArray(value.abi) || bytecode === "0x" || runtime === "0x") throw new Error(`incomplete artifact ${path}`);
  return { abi: value.abi, bytecode, runtime, immutables: value.deployedBytecode?.immutableReferences ?? {}, creationCodeHash: keccak256(bytecode) };
}

async function readArtifacts() {
  return Object.fromEntries(await Promise.all(Object.entries(artifacts).map(async ([key, entry]) => [key, await artifact(entry.path)])));
}

function client() {
  return createPublicClient({ chain, transport: http(COSTON2_RPC_URL, { timeout: 15_000, retryCount: 2 }) });
}

async function sourceCommit(requireClean) {
  const [{ stdout: commit }, { stdout: status }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }),
    execFileAsync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root, encoding: "utf8" }),
  ]);
  const value = commit.trim();
  if (!commitPattern.test(value)) throw new Error("source commit is unavailable");
  if (requireClean && status.trim()) throw new Error("V2 broadcast requires a clean committed worktree");
  return value;
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
    return JSON.parse(await readFile(V2_STATE_PATH, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function account() {
  try { process.loadEnvFile(resolve(root, ".env.local")); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const key = process.env.PAYGUARD_DEPLOYER_PRIVATE_KEY;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? "")) throw new Error("PAYGUARD_DEPLOYER_PRIVATE_KEY is missing or malformed");
  const value = privateKeyToAccount(key);
  if (process.env.PAYGUARD_DEPLOYER_ADDRESS && (!isAddress(process.env.PAYGUARD_DEPLOYER_ADDRESS) || getAddress(process.env.PAYGUARD_DEPLOYER_ADDRESS) !== value.address)) {
    throw new Error("deployer address does not match local key");
  }
  return value;
}

async function dependencies(publicClient) {
  const assetManager = getAddress(await publicClient.readContract({ address: FLARE_CONTRACT_REGISTRY, abi: registryLookupAbi, functionName: "getContractAddressByName", args: ["AssetManagerFXRP"] }));
  const fTestXrp = getAddress(await publicClient.readContract({ address: assetManager, abi: assetManagerAbi, functionName: "fAsset" }));
  const [symbol, decimals] = await Promise.all([
    publicClient.readContract({ address: fTestXrp, abi: tokenAbi, functionName: "symbol" }),
    publicClient.readContract({ address: fTestXrp, abi: tokenAbi, functionName: "decimals" }),
  ]);
  if (symbol !== "FTestXRP" || decimals !== 6) throw new Error("official FTestXRP resolution failed");
  return { flareContractRegistry: getAddress(FLARE_CONTRACT_REGISTRY), assetManager, fTestXrp, symbol, decimals };
}

function constructorArgs(key, state) {
  if (key === "registry") return [state.deployer, TEE_MANAGER, EXTENSION_ID, CODE_HASH, true];
  if (key === "vault") return [state.deployer];
  return [state.contracts.registry.address, state.contracts.vault.address];
}

async function deployOne({ publicClient, wallet, signer, compiled, state, key }) {
  let entry = state.contracts[key];
  if (!entry) {
    const nonce = await publicClient.getTransactionCount({ address: signer.address, blockTag: "pending" });
    entry = { name: artifacts[key].name, nonce: String(nonce), address: getContractAddress({ from: signer.address, nonce: BigInt(nonce) }), creationCodeHash: compiled[key].creationCodeHash };
    state.contracts[key] = entry;
    await saveJson(V2_STATE_PATH, state);
  }
  if (entry.creationCodeHash !== compiled[key].creationCodeHash) throw new Error(`${key} artifact changed during deployment`);
  const existing = await publicClient.getBytecode({ address: entry.address });
  if (!existing || existing === "0x") {
    const nonce = Number(entry.nonce);
    if (await publicClient.getTransactionCount({ address: signer.address, blockTag: "pending" }) !== nonce) throw new Error(`${key} nonce is no longer safe`);
    const args = constructorArgs(key, state);
    const data = encodeDeployData({ abi: compiled[key].abi, bytecode: compiled[key].bytecode, args });
    await publicClient.estimateGas({ account: signer.address, data, nonce });
    entry.transactionHash = await wallet.deployContract({ abi: compiled[key].abi, bytecode: compiled[key].bytecode, args, account: signer, chain, nonce });
    await saveJson(V2_STATE_PATH, state);
  }
  const receipt = await publicClient.waitForTransactionReceipt({ hash: entry.transactionHash, confirmations: 2, timeout: 180_000 });
  if (receipt.status !== "success" || getAddress(receipt.contractAddress) !== getAddress(entry.address)) throw new Error(`${key} deployment failed`);
  const code = await publicClient.getBytecode({ address: entry.address });
  const runtime = verifyRuntimeBytecode(code, compiled[key].runtime, compiled[key].immutables);
  Object.assign(entry, { blockNumber: String(receipt.blockNumber), runtimeCodeHash: runtime.runtimeCodeHash, runtimeBytes: runtime.runtimeBytes, verified: true });
  await saveJson(V2_STATE_PATH, state);
}

async function writeOnce({ publicClient, wallet, signer, state, key, address, abi, functionName, args }) {
  if (!state.wiring[key]) {
    const simulation = await publicClient.simulateContract({ address, abi, functionName, args, account: signer.address });
    const transactionHash = await wallet.writeContract({ ...simulation.request, account: signer, chain });
    state.wiring[key] = { functionName, transactionHash };
    await saveJson(V2_STATE_PATH, state);
  }
  const receipt = await publicClient.waitForTransactionReceipt({ hash: state.wiring[key].transactionHash, confirmations: 2, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error(`${key} failed`);
  Object.assign(state.wiring[key], { blockNumber: String(receipt.blockNumber), verified: true });
}

async function verifyMachines(publicClient) {
  return Promise.all(MACHINE_SIGNERS.map(async (signer) => {
    const [machine, attestation, status, extensionId, supported, disabled] = await Promise.all([
      publicClient.readContract({ address: TEE_MANAGER, abi: managerAbi, functionName: "getTeeMachine", args: [signer] }),
      publicClient.readContract({ address: TEE_MANAGER, abi: managerAbi, functionName: "getTeeMachineWithAttestationData", args: [signer] }),
      publicClient.readContract({ address: TEE_MANAGER, abi: managerAbi, functionName: "getTeeMachineStatus", args: [signer] }),
      publicClient.readContract({ address: TEE_MANAGER, abi: managerAbi, functionName: "getExtensionId", args: [signer] }),
      publicClient.readContract({ address: TEE_MANAGER, abi: managerAbi, functionName: "isCodeHashPlatformSupported", args: [EXTENSION_ID, CODE_HASH, SIMULATED_PLATFORM] }),
      publicClient.readContract({ address: TEE_MANAGER, abi: managerAbi, functionName: "isCodeHashPlatformDisabled", args: [EXTENSION_ID, CODE_HASH, SIMULATED_PLATFORM] }),
    ]);
    const origin = new URL(machine.url);
    if (status !== 2 || extensionId !== EXTENSION_ID || getAddress(machine.teeId) !== signer || machine.teeProxyId === zeroAddress || origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error(`machine ${signer} is unavailable`);
    if (getAddress(attestation.teeId) !== signer || getAddress(attestation.initialTeeId) !== zeroAddress || attestation.url !== machine.url || attestation.codeHash.toLowerCase() !== CODE_HASH || attestation.platform.toLowerCase() !== SIMULATED_PLATFORM.toLowerCase() || !supported || disabled) throw new Error(`machine ${signer} attestation is incompatible`);
    return { signer, machineId: padHex(toHex(BigInt(signer)), { size: 32 }), origin: origin.origin, status, simulated: true };
  }));
}

async function verify({ publicClient, compiled, state }) {
  if (await publicClient.getChainId() !== COSTON2_CHAIN_ID) throw new Error("connected chain is not Coston2");
  for (const key of Object.keys(artifacts)) {
    const code = await publicClient.getBytecode({ address: state.contracts[key].address });
    const runtime = verifyRuntimeBytecode(code, compiled[key].runtime, compiled[key].immutables);
    if (runtime.runtimeCodeHash !== state.contracts[key].runtimeCodeHash) throw new Error(`${key} runtime drifted`);
  }
  const [registryAdmin, manager, extensionId, codeHash, allowSimulated, vaultAdmin, routerRegistry, routerVault, vaultRouter, supportedAsset, machines] = await Promise.all([
    publicClient.readContract({ address: state.contracts.registry.address, abi: compiled.registry.abi, functionName: "admin" }),
    publicClient.readContract({ address: state.contracts.registry.address, abi: compiled.registry.abi, functionName: "teeManager" }),
    publicClient.readContract({ address: state.contracts.registry.address, abi: compiled.registry.abi, functionName: "expectedExtensionId" }),
    publicClient.readContract({ address: state.contracts.registry.address, abi: compiled.registry.abi, functionName: "expectedCodeHash" }),
    publicClient.readContract({ address: state.contracts.registry.address, abi: compiled.registry.abi, functionName: "allowSimulatedTee" }),
    publicClient.readContract({ address: state.contracts.vault.address, abi: compiled.vault.abi, functionName: "admin" }),
    publicClient.readContract({ address: state.contracts.router.address, abi: compiled.router.abi, functionName: "registry" }),
    publicClient.readContract({ address: state.contracts.router.address, abi: compiled.router.abi, functionName: "vault" }),
    publicClient.readContract({ address: state.contracts.vault.address, abi: compiled.vault.abi, functionName: "router" }),
    publicClient.readContract({ address: state.contracts.vault.address, abi: compiled.vault.abi, functionName: "supportedAsset", args: [state.dependencies.fTestXrp] }),
    verifyMachines(publicClient),
  ]);
  if (getAddress(registryAdmin) !== getAddress(state.deployer) || getAddress(vaultAdmin) !== getAddress(state.deployer)) throw new Error("V2 admin binding mismatch");
  if (getAddress(manager) !== TEE_MANAGER || extensionId !== EXTENSION_ID || codeHash.toLowerCase() !== CODE_HASH || allowSimulated !== true) throw new Error("V2 FCC constructor binding mismatch");
  if (getAddress(routerRegistry) !== getAddress(state.contracts.registry.address) || getAddress(routerVault) !== getAddress(state.contracts.vault.address) || getAddress(vaultRouter) !== getAddress(state.contracts.router.address) || !supportedAsset) throw new Error("V2 vault/router wiring mismatch");
  state.status = "live-candidate";
  state.observedBlock = String(await publicClient.getBlockNumber());
  state.verifiedAt = new Date().toISOString();
  state.machines = machines;
  return state;
}

export function buildV2DeploymentEvidence(state) {
  return validateV2DeploymentEvidence({
    schemaVersion: 1,
    suite: "payguard-coston2-v2-simulated-deployment",
    status: "live-candidate",
    verifiedRelease: false,
    hardwareTeeVerified: false,
    simulatedTee: true,
    profile: "COSTON2_SIMULATED_V2",
    recordedAt: state.verifiedAt,
    sourceCommit: state.sourceCommit,
    network: { name: "flare-coston2", chainId: COSTON2_CHAIN_ID, observedBlock: state.observedBlock },
    teeManager: TEE_MANAGER,
    extensionId: String(EXTENSION_ID),
    codeHash: CODE_HASH,
    contracts: Object.fromEntries(Object.entries(state.contracts).map(([key, entry]) => [key, { name: entry.name, address: entry.address, transactionHash: entry.transactionHash, blockNumber: entry.blockNumber, runtimeCodeHash: entry.runtimeCodeHash }])),
    asset: state.dependencies.fTestXrp,
    wiring: state.wiring,
    machines: state.machines,
    assertions: {
      sourceCommitCleanAtBroadcast: true,
      runtimeCodeVerified: true,
      constructorBindingsVerified: true,
      officialManagerRechecked: true,
      threeProductionMachinesRechecked: true,
      simulatedProfileChainLocked: true,
      vaultRouterVerified: true,
      supportedAssetVerified: true,
      noHardwareAttestationClaimed: true,
      noVerifiedReleaseClaimed: true,
      publicOnly: true,
    },
    notes: [
      "This is a live Coston2 V2 simulated-TEE candidate deployed in parallel with V1.",
      "It is not the non-simulated hardware-attested PayGuard release manifest.",
    ],
  });
}

export async function planV2Deployment() {
  const publicClient = client();
  const [chainId, blockNumber, resolved, compiled, commit] = await Promise.all([publicClient.getChainId(), publicClient.getBlockNumber(), dependencies(publicClient), readArtifacts(), sourceCommit(false)]);
  if (chainId !== COSTON2_CHAIN_ID) throw new Error("connected chain is not Coston2");
  return { status: "planned", profile: "COSTON2_SIMULATED_V2", verifiedRelease: false, sourceCommit: commit, network: { chainId, observedBlock: String(blockNumber) }, dependencies: resolved, teeManager: TEE_MANAGER, extensionId: String(EXTENSION_ID), codeHash: CODE_HASH, artifacts: Object.fromEntries(Object.entries(compiled).map(([key, value]) => [key, { name: artifacts[key].name, creationCodeHash: value.creationCodeHash }])) };
}

export async function deployV2({ broadcast = false } = {}) {
  if (!broadcast) throw new Error("V2 deployment requires --broadcast");
  const commit = await sourceCommit(true);
  const signer = account();
  const publicClient = client();
  const [resolved, compiled] = await Promise.all([dependencies(publicClient), readArtifacts()]);
  let state = await loadState();
  if (!state) {
    state = { schemaVersion: 1, status: "in-progress", sourceCommit: commit, deployer: signer.address, profile: "COSTON2_SIMULATED_V2", network: { name: "flare-coston2", chainId: COSTON2_CHAIN_ID, rpcUrl: COSTON2_RPC_URL }, dependencies: resolved, contracts: {}, wiring: {} };
    await saveJson(V2_STATE_PATH, state);
  }
  if (state.sourceCommit !== commit || getAddress(state.deployer) !== signer.address || state.profile !== "COSTON2_SIMULATED_V2") throw new Error("V2 deployment resume mismatch");
  const wallet = createWalletClient({ account: signer, chain, transport: http(COSTON2_RPC_URL, { timeout: 15_000, retryCount: 2 }) });
  for (const key of ["registry", "vault", "router"]) await deployOne({ publicClient, wallet, signer, compiled, state, key });
  const currentRouter = await publicClient.readContract({ address: state.contracts.vault.address, abi: compiled.vault.abi, functionName: "router" });
  if (currentRouter === zeroAddress) await writeOnce({ publicClient, wallet, signer, state, key: "vaultRouter", address: state.contracts.vault.address, abi: compiled.vault.abi, functionName: "setRouter", args: [state.contracts.router.address] });
  else if (getAddress(currentRouter) !== getAddress(state.contracts.router.address)) throw new Error("V2 vault is wired to an unexpected router");
  const supported = await publicClient.readContract({ address: state.contracts.vault.address, abi: compiled.vault.abi, functionName: "supportedAsset", args: [resolved.fTestXrp] });
  if (!supported) await writeOnce({ publicClient, wallet, signer, state, key: "supportedFTestXrp", address: state.contracts.vault.address, abi: compiled.vault.abi, functionName: "setSupportedAsset", args: [resolved.fTestXrp, true] });
  state = await verify({ publicClient, compiled, state });
  await saveJson(V2_STATE_PATH, state);
  const evidence = buildV2DeploymentEvidence(state);
  await saveJson(V2_EVIDENCE_PATH, evidence);
  return { status: state.status, verifiedRelease: false, sourceCommit: state.sourceCommit, contracts: Object.fromEntries(Object.entries(state.contracts).map(([key, entry]) => [key, entry.address])), observedBlock: state.observedBlock, evidence: "evidence/coston2/contracts-v2-simulated.json" };
}

export async function verifyV2Deployment() {
  const state = await loadState();
  if (!state) throw new Error("local V2 deployment state is missing");
  const publicClient = client();
  const compiled = await readArtifacts();
  const verified = await verify({ publicClient, compiled, state });
  await saveJson(V2_STATE_PATH, verified);
  await saveJson(V2_EVIDENCE_PATH, buildV2DeploymentEvidence(verified));
  return { status: verified.status, verifiedRelease: false, contracts: Object.fromEntries(Object.entries(verified.contracts).map(([key, entry]) => [key, entry.address])), observedBlock: verified.observedBlock };
}

async function main() {
  const mode = process.argv[2] ?? "plan";
  if (mode === "plan") return planV2Deployment();
  if (mode === "deploy") return deployV2({ broadcast: process.argv.includes("--broadcast") });
  if (mode === "verify") return verifyV2Deployment();
  throw new Error("usage: plan | deploy --broadcast | verify");
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await main())); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
