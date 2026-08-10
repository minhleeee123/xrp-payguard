import { spawn } from "node:child_process";
import { appendFile, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  encodePacked,
  getAddress,
  http,
  isAddress,
  keccak256,
  stringToHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const root = resolve(import.meta.dirname, "..");
const RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";
const PRODUCTION_ORIGIN = "https://xrp-payguard.vercel.app";
const LOCAL_ENV = resolve(root, ".env.local");
const LOCAL_STATE = resolve(root, "evidence/local/coston2-interactive-demo-deployment.json");
export const INTERACTIVE_DEMO_EVIDENCE = resolve(root, "evidence/simulation/coston2-interactive-demo-deployment-2026-08-10.json");
const DEPLOYMENT_EVIDENCE = resolve(root, "evidence/coston2/contracts-deployment.json");
const ARTIFACTS = {
  registry: resolve(root, "packages/contracts/out/PayGuardPolicyRegistry.sol/PayGuardPolicyRegistry.json"),
  vault: resolve(root, "packages/contracts/out/PayGuardVault.sol/PayGuardVault.json"),
  router: resolve(root, "packages/contracts/out/PayGuardActionRouter.sol/PayGuardActionRouter.json"),
};
const CONTRACT_NAMES = {
  registry: "PayGuardPolicyRegistry",
  vault: "PayGuardVault",
  router: "PayGuardActionRouter",
};
const ACTOR_ENV_NAMES = [
  "PAYGUARD_DEMO_ACTOR_1_PRIVATE_KEY",
  "PAYGUARD_DEMO_ACTOR_2_PRIVATE_KEY",
  "PAYGUARD_DEMO_ACTOR_3_PRIVATE_KEY",
];
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;
const FORBIDDEN_PUBLIC_FIELD = /^(?:privateKey|secret|seed|ciphertext|signature|credential|password|mnemonic)$/iu;
const DEMO_EXTENSION_ID = keccak256(stringToHex("PAYGUARD_INTERACTIVE_DEMO_EXTENSION_V1"));
const DEMO_CODE_VERSION = keccak256(stringToHex("PAYGUARD_INTERACTIVE_DEMO_CODE_V1"));

const coston2 = {
  id: 114,
  name: "Flare Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

export function parseInteractiveDemoBootstrapCLI(argv) {
  const mode = argv[0] ?? "plan";
  if (mode !== "plan" && mode !== "deploy") throw new Error(`unknown interactive demo bootstrap mode: ${mode}`);
  const broadcast = argv.includes("--broadcast");
  const confirmed = argv.includes("--confirm-simulated-fcc");
  const configureVercel = argv.includes("--configure-vercel");
  const allowed = new Set([mode, "--broadcast", "--confirm-simulated-fcc", "--configure-vercel"]);
  for (const value of argv) if (!allowed.has(value)) throw new Error(`unknown argument: ${value}`);
  if (mode === "plan" && (broadcast || confirmed || configureVercel)) throw new Error("plan is read-only");
  if (mode === "deploy" && (!broadcast || !confirmed || !configureVercel)) {
    throw new Error("deploy requires --broadcast --confirm-simulated-fcc --configure-vercel");
  }
  return { mode, broadcast, confirmed, configureVercel };
}

export function actorDescriptor(privateKey, actor, origin = PRODUCTION_ORIGIN) {
  if (!PRIVATE_KEY.test(privateKey ?? "")) throw new Error(`demo actor ${actor} key is missing or malformed`);
  if (![1, 2, 3].includes(actor)) throw new Error("demo actor index must be 1, 2, or 3");
  const account = privateKeyToAccount(privateKey);
  const publicKey = account.publicKey;
  if (!/^0x04[0-9a-fA-F]{128}$/.test(publicKey)) throw new Error("demo actor public key is malformed");
  const x = `0x${publicKey.slice(4, 68)}`;
  const y = `0x${publicKey.slice(68, 132)}`;
  const keyFingerprint = keccak256(`0x${publicKey.slice(4)}`);
  const machineId = keccak256(encodePacked(
    ["string", "uint8", "address", "bytes32"],
    ["PAYGUARD_INTERACTIVE_DEMO_MACHINE_V1", actor, account.address, keyFingerprint],
  ));
  return {
    actor,
    machineId,
    keyFingerprint,
    signer: account.address,
    publicKey: { x, y },
    endpoint: `${origin}/api/demo/machine-${actor}`,
  };
}

export function buildInteractiveDemoConfig({ contracts, asset, deploymentBlock, actors }) {
  if (!contracts || !actors || actors.length !== 3 || BigInt(deploymentBlock) <= 0n) throw new Error("interactive demo config input is incomplete");
  const config = {
    mode: "SIMULATED_FCC_COSTON2_TESTNET_V1",
    chainId: 114,
    registry: address(contracts.registry, "registry"),
    vault: address(contracts.vault, "vault"),
    router: address(contracts.router, "router"),
    asset: address(asset, "asset"),
    deploymentBlock: String(deploymentBlock),
    extensionId: DEMO_EXTENSION_ID,
    codeVersion: DEMO_CODE_VERSION,
    actors,
    assertions: falseAssertions(),
  };
  inspectPublic(config);
  return config;
}

export function buildInteractiveDemoEvidence({ sourceCommit, deployer, config, transactions, verifiedAt }) {
  const evidence = {
    schemaVersion: 1,
    status: "simulation-only",
    mode: config.mode,
    label: "SIMULATED FCC · COSTON2 TESTNET · NOT PRODUCTION TEE",
    sourceCommit,
    network: { name: "flare-coston2", chainId: 114 },
    deployer: address(deployer, "deployer"),
    contracts: { registry: config.registry, vault: config.vault, router: config.router },
    asset: config.asset,
    deploymentBlock: config.deploymentBlock,
    extensionId: config.extensionId,
    codeVersion: config.codeVersion,
    actors: config.actors.map(({ publicKey: _publicKey, endpoint, ...actor }) => ({ ...actor, endpoint })),
    transactions,
    verifiedAt,
    assertions: {
      separateDemoContractNamespaceVerified: true,
      threeDistinctActorDescriptorsVerified: true,
      runtimeAndWiringVerified: true,
      actorRegistrationReadbackVerified: true,
      noPrivateKeyRecorded: true,
      ...falseAssertions(),
    },
    limitations: [
      "Three actors share one Vercel project and operator trust domain.",
      "Actors are stateless serverless simulations, not hardware TEEs or production FCC machines.",
      "This deployment is excluded from PayGuard release manifests and production FCC claims.",
    ],
  };
  inspectPublic(evidence);
  return evidence;
}

export async function ensureLocalActorKeys({ envPath = LOCAL_ENV, environment = process.env } = {}) {
  let source = "";
  try { source = await readFile(envPath, "utf8"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const keys = [];
  const additions = [];
  for (const name of ACTOR_ENV_NAMES) {
    const match = source.match(new RegExp(`^${name}=(.*)$`, "m"));
    const value = environment[name] || match?.[1] || generatePrivateKey();
    if (!PRIVATE_KEY.test(value)) throw new Error(`${name} is malformed`);
    if (!match) additions.push(`${name}=${value}`);
    keys.push(value);
    environment[name] = value;
  }
  if (new Set(keys.map((value) => privateKeyToAccount(value).address.toLowerCase())).size !== 3) throw new Error("demo actor keys must be distinct");
  if (additions.length > 0) {
    await appendFile(envPath, `${source.endsWith("\n") || source.length === 0 ? "" : "\n"}\n# Interactive demo actor keys. Vercel/serverless simulation only.\n${additions.join("\n")}\n`, { mode: 0o600 });
  }
  await chmod(envPath, 0o600);
  return keys;
}

export async function configureVercelEnvironment(values, executor = setVercelEnvironmentVariable) {
  for (const [name, value, sensitive] of values) await executor(name, value, sensitive);
}

async function setVercelEnvironmentVariable(name, value, sensitive) {
  if (!/^[A-Z0-9_]+$/.test(name) || typeof value !== "string" || value.length === 0) throw new Error("invalid Vercel environment input");
  await new Promise((resolvePromise, reject) => {
    const args = ["env", "add", name, "production", "--force", sensitive ? "--sensitive" : "--no-sensitive", "--yes"];
    const child = spawn("vercel", args, { cwd: root, env: process.env, stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", () => reject(new Error(`failed to start Vercel CLI for ${name}`)));
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`Vercel environment update failed for ${name}`)));
    child.stdin.end(`${value}\n`);
  });
}

async function deployInteractiveDemo() {
  const sourceCommit = await cleanSourceCommit();
  loadLocalEnvironment();
  const deployerKey = process.env.PAYGUARD_DEPLOYER_PRIVATE_KEY;
  if (!PRIVATE_KEY.test(deployerKey ?? "")) throw new Error("PAYGUARD_DEPLOYER_PRIVATE_KEY is missing or malformed");
  const account = privateKeyToAccount(deployerKey);
  if (process.env.PAYGUARD_DEPLOYER_ADDRESS && getAddress(process.env.PAYGUARD_DEPLOYER_ADDRESS) !== account.address) {
    throw new Error("configured PayGuard deployer does not match the local key");
  }
  const actorKeys = await ensureLocalActorKeys();
  const actors = actorKeys.map((key, index) => actorDescriptor(key, index + 1));
  await configureVercelEnvironment(ACTOR_ENV_NAMES.map((name, index) => [name, actorKeys[index], true]));

  const [deployment, artifacts] = await Promise.all([readJson(DEPLOYMENT_EVIDENCE), readArtifacts()]);
  const asset = address(deployment.publicIdentifiers?.fTestXrp, "verified PayGuard FTestXRP");
  if (deployment.assertions?.runtimeCodeVerified !== true || deployment.assertions?.supportedAssetVerified !== true) {
    throw new Error("verified PayGuard deployment evidence is incomplete");
  }
  const client = createPublicClient({ chain: coston2, transport: http(RPC_URL, { timeout: 15_000, retryCount: 2 }) });
  const wallet = createWalletClient({ account, chain: coston2, transport: http(RPC_URL, { timeout: 15_000, retryCount: 2 }) });
  if (await client.getChainId() !== 114) throw new Error("interactive demo bootstrap is not connected to Coston2");
  const balance = await client.getBalance({ address: account.address });
  if (balance < 100_000_000_000_000_000n) throw new Error("PayGuard deployer lacks the bounded C2FLR gas budget");

  let state = await readOptionalJson(LOCAL_STATE) ?? {
    schemaVersion: 1,
    status: "in-progress",
    sourceCommit,
    deployer: account.address,
    asset,
    actors: actors.map(({ publicKey: _publicKey, ...actor }) => actor),
    contracts: {},
    transactions: {},
  };
  if (state.sourceCommit !== sourceCommit || getAddress(state.deployer) !== account.address || getAddress(state.asset) !== asset) {
    throw new Error("interactive demo resume state does not match source, deployer, or asset");
  }
  if (JSON.stringify(state.actors) !== JSON.stringify(actors.map(({ publicKey: _publicKey, ...actor }) => actor))) {
    throw new Error("interactive demo resume actor descriptors changed");
  }
  await saveState(state);

  for (const key of ["registry", "vault", "router"]) {
    if (state.contracts[key]) continue;
    const args = key === "router" ? [state.contracts.registry.address, state.contracts.vault.address] : [account.address];
    const hash = await wallet.deployContract({ abi: artifacts[key].abi, bytecode: artifacts[key].bytecode, args });
    const receipt = await successfulReceipt(client, hash);
    if (!receipt.contractAddress) throw new Error(`${key} deployment receipt has no contract address`);
    state.contracts[key] = { address: receipt.contractAddress, transactionHash: hash, blockNumber: String(receipt.blockNumber) };
    state.transactions[`deploy${capitalized(key)}`] = transactionRecord(hash, receipt);
    await saveState(state);
  }

  await writeIfNeeded({
    state, key: "supportAsset", client, wallet, address: state.contracts.vault.address,
    abi: artifacts.vault.abi, read: ["supportedAsset", [asset]], expected: true,
    write: ["setSupportedAsset", [asset, true]],
  });
  await writeIfNeeded({
    state, key: "wireRouter", client, wallet, address: state.contracts.vault.address,
    abi: artifacts.vault.abi, read: ["router", []], expected: state.contracts.router.address,
    write: ["setRouter", [state.contracts.router.address]],
  });
  for (const actor of actors) {
    const registered = await client.readContract({ address: state.contracts.registry.address, abi: artifacts.registry.abi, functionName: "machine", args: [actor.machineId] });
    if (registered[2] !== true) {
      const hash = await wallet.writeContract({ address: state.contracts.registry.address, abi: artifacts.registry.abi, functionName: "registerMachine", args: [actor.machineId, actor.keyFingerprint, actor.signer] });
      const receipt = await successfulReceipt(client, hash);
      state.transactions[`registerActor${actor.actor}`] = transactionRecord(hash, receipt);
      await saveState(state);
    }
  }

  const codes = await Promise.all(["registry", "vault", "router"].map((key) => client.getCode({ address: state.contracts[key].address })));
  if (codes.some((code) => !code || code === "0x")) throw new Error("interactive demo contract runtime verification failed");
  const [registryAdmin, vaultAdmin, routerRegistry, routerVault, wiredRouter, supported] = await Promise.all([
    client.readContract({ address: state.contracts.registry.address, abi: artifacts.registry.abi, functionName: "admin" }),
    client.readContract({ address: state.contracts.vault.address, abi: artifacts.vault.abi, functionName: "admin" }),
    client.readContract({ address: state.contracts.router.address, abi: artifacts.router.abi, functionName: "registry" }),
    client.readContract({ address: state.contracts.router.address, abi: artifacts.router.abi, functionName: "vault" }),
    client.readContract({ address: state.contracts.vault.address, abi: artifacts.vault.abi, functionName: "router" }),
    client.readContract({ address: state.contracts.vault.address, abi: artifacts.vault.abi, functionName: "supportedAsset", args: [asset] }),
  ]);
  if (getAddress(registryAdmin) !== account.address || getAddress(vaultAdmin) !== account.address
    || getAddress(routerRegistry) !== getAddress(state.contracts.registry.address)
    || getAddress(routerVault) !== getAddress(state.contracts.vault.address)
    || getAddress(wiredRouter) !== getAddress(state.contracts.router.address) || supported !== true) {
    throw new Error("interactive demo constructor or wiring readback failed");
  }
  for (const actor of actors) {
    const registered = await client.readContract({ address: state.contracts.registry.address, abi: artifacts.registry.abi, functionName: "machine", args: [actor.machineId] });
    if (getAddress(registered[0]) !== getAddress(actor.signer) || registered[1].toLowerCase() !== actor.keyFingerprint.toLowerCase() || registered[2] !== true) {
      throw new Error(`interactive demo actor ${actor.actor} readback failed`);
    }
  }

  const deploymentBlock = Object.values(state.transactions).reduce((minimum, entry) => {
    const block = BigInt(entry.blockNumber); return minimum === 0n || block < minimum ? block : minimum;
  }, 0n);
  const config = buildInteractiveDemoConfig({
    contracts: Object.fromEntries(Object.entries(state.contracts).map(([key, value]) => [key, value.address])),
    asset,
    deploymentBlock,
    actors,
  });
  const verifiedAt = new Date().toISOString();
  const evidence = buildInteractiveDemoEvidence({ sourceCommit, deployer: account.address, config, transactions: state.transactions, verifiedAt });
  await mkdir(resolve(root, "evidence/simulation"), { recursive: true });
  await writeFile(INTERACTIVE_DEMO_EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
  await configureVercelEnvironment([["PAYGUARD_INTERACTIVE_DEMO_CONFIG", JSON.stringify(config), false]]);
  state.status = "verified-simulation";
  state.verifiedAt = verifiedAt;
  await saveState(state);
  return {
    status: state.status,
    mode: config.mode,
    sourceCommit,
    contracts: config.registry && { registry: config.registry, vault: config.vault, router: config.router },
    actorCount: actors.length,
    evidence: "evidence/simulation/coston2-interactive-demo-deployment-2026-08-10.json",
    assertions: falseAssertions(),
  };
}

async function writeIfNeeded({ state, key, client, wallet, address: contract, abi, read, expected, write }) {
  const current = await client.readContract({ address: contract, abi, functionName: read[0], args: read[1] });
  const matches = typeof expected === "string" ? getAddress(current) === getAddress(expected) : current === expected;
  if (matches) {
    if (!state.transactions[key]) throw new Error(`${key} already applied without a resume transaction`);
    return;
  }
  const hash = await wallet.writeContract({ address: contract, abi, functionName: write[0], args: write[1] });
  const receipt = await successfulReceipt(client, hash);
  state.transactions[key] = transactionRecord(hash, receipt);
  await saveState(state);
}

async function successfulReceipt(client, hash) {
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error(`Coston2 transaction ${hash} reverted`);
  return receipt;
}

function transactionRecord(hash, receipt) {
  return { transactionHash: hash, blockNumber: String(receipt.blockNumber), status: receipt.status };
}

async function readArtifacts() {
  return Object.fromEntries(await Promise.all(Object.entries(ARTIFACTS).map(async ([key, path]) => {
    const artifact = await readJson(path);
    const bytecode = artifact.bytecode?.object;
    if (!Array.isArray(artifact.abi) || !/^0x[0-9a-fA-F]+$/.test(bytecode ?? "")) throw new Error(`${CONTRACT_NAMES[key]} artifact is unavailable; run forge build`);
    return [key, { abi: artifact.abi, bytecode }];
  })));
}

async function cleanSourceCommit() {
  const { execFile } = await import("node:child_process");
  const output = await new Promise((resolvePromise, reject) => execFile("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf8" }, (error, stdout) => error ? reject(error) : resolvePromise(stdout)));
  if (output.trim()) throw new Error("interactive demo deployment requires a clean source tree");
  return new Promise((resolvePromise, reject) => execFile("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }, (error, stdout) => error ? reject(error) : resolvePromise(stdout.trim())));
}

function loadLocalEnvironment() {
  try { process.loadEnvFile(LOCAL_ENV); } catch (error) { if (error?.code !== "ENOENT") throw error; }
}

async function saveState(state) {
  await mkdir(resolve(root, "evidence/local"), { recursive: true });
  await writeFile(LOCAL_STATE, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function readOptionalJson(path) { try { return await readJson(path); } catch (error) { if (error?.code === "ENOENT") return null; throw error; } }
function address(value, label) { if (!isAddress(value ?? "")) throw new Error(`${label} must be an address`); return getAddress(value); }
function capitalized(value) { return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`; }
function falseAssertions() {
  return {
    hardwareTeeVerified: false,
    registeredProductionMachinesVerified: false,
    independentOperatorsVerified: false,
    sealedPersistenceVerified: false,
    productionFccReleaseVerified: false,
  };
}
function inspectPublic(value, path = "evidence") {
  if (Array.isArray(value)) return value.forEach((item, index) => inspectPublic(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_PUBLIC_FIELD.test(key)) throw new Error(`${path} contains forbidden field ${key}`);
    inspectPublic(item, `${path}.${key}`);
  }
}

export async function planInteractiveDemoBootstrap() {
  const deployment = await readJson(DEPLOYMENT_EVIDENCE);
  return {
    status: "planned",
    mode: "SIMULATED_FCC_COSTON2_TESTNET_V1",
    network: { name: "flare-coston2", chainId: 114, rpcUrl: RPC_URL },
    verifiedAssetReference: address(deployment.publicIdentifiers?.fTestXrp, "verified PayGuard FTestXRP"),
    targetOrigin: PRODUCTION_ORIGIN,
    writes: ["3 Vercel actor secrets", "3 contracts", "2 wiring transactions", "3 machine registrations", "1 public Vercel config"],
    note: "Read-only plan. No key was generated, transaction signed, environment changed, or evidence written.",
    assertions: falseAssertions(),
  };
}

async function main() {
  const cli = parseInteractiveDemoBootstrapCLI(process.argv.slice(2));
  const result = cli.mode === "plan" ? await planInteractiveDemoBootstrap() : await deployInteractiveDemo();
  console.log(JSON.stringify(result));
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
