import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  createPublicClient,
  createWalletClient,
  decodeDeployData,
  encodeDeployData,
  getAddress,
  getContractAddress,
  http,
  isAddress,
  keccak256,
  parseEventLogs,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { verifyRuntimeBytecode } from "./coston2-deploy.mjs";
import {
  buildFoundationRegistrationEvidence,
  COSTON2_CHAIN_ID,
  COSTON2_RPC_URL,
  EVM_KEY_TYPE,
  evaluateFoundationRegistration,
  FCC_DEPLOYMENTS_PATH,
  FCC_DEPLOYMENTS_SHA256,
  FCC_DEPLOYMENTS_URL,
  FCC_SCAFFOLD_COMMIT,
  FCC_SCAFFOLD_REPOSITORY,
  resolveOfficialTeeManager,
  teeManagerRegistrationAbi,
  validateFoundationRegistrationState,
} from "./fcc-foundation-registration.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const statePath = resolve(root, "evidence/local/coston2-fcc-foundation-registration.json");
const evidencePath = resolve(root, "evidence/coston2/fcc-foundation-registration.json");
const artifactPath = resolve(
  root,
  "packages/contracts/out/PayGuardFoundationSender.sol/PayGuardFoundationSender.json",
);
const minimumGasBalance = 50_000_000_000_000_000n;

const coston2 = {
  id: COSTON2_CHAIN_ID,
  name: "Flare Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [COSTON2_RPC_URL] } },
};

function withHex(value) {
  return typeof value === "string" && value.startsWith("0x") ? value : `0x${value ?? ""}`;
}

async function readArtifact() {
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  const bytecode = withHex(artifact.bytecode?.object);
  const runtimeCode = withHex(artifact.deployedBytecode?.object);
  if (!Array.isArray(artifact.abi) || !/^0x[0-9a-fA-F]+$/.test(bytecode) || !/^0x[0-9a-fA-F]+$/.test(runtimeCode)) {
    throw new Error("PayGuardFoundationSender artifact is missing or incomplete");
  }
  const constructor = artifact.abi.find((entry) => entry.type === "constructor");
  const version = artifact.abi.find((entry) => entry.type === "function" && entry.name === "FOUNDATION_SENDER_VERSION");
  if (
    constructor?.inputs?.length !== 2 || constructor.inputs.some((entry) => entry.type !== "address")
      || version?.outputs?.length !== 1 || version.outputs[0].type !== "uint16"
  ) throw new Error("PayGuardFoundationSender artifact surface mismatch");
  return {
    abi: artifact.abi,
    bytecode,
    runtimeCode,
    immutableReferences: artifact.deployedBytecode?.immutableReferences ?? {},
    creationCodeHash: keccak256(bytecode),
  };
}

async function git(args) {
  const result = await execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  return result.stdout.trim();
}

async function sourceCommit({ requireClean }) {
  const commit = await git(["rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("unable to resolve source commit");
  const status = await git(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (requireClean && status !== "") throw new Error("FCC broadcast requires a clean committed worktree");
  return { commit, clean: status === "" };
}

function loadLocalEnvironment() {
  try {
    process.loadEnvFile(resolve(root, ".env.local"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function configuredDeployer() {
  loadLocalEnvironment();
  const value = process.env.PAYGUARD_DEPLOYER_ADDRESS;
  if (!isAddress(value ?? "") || value.toLowerCase() === zeroAddress) {
    throw new Error("PAYGUARD_DEPLOYER_ADDRESS is missing or malformed");
  }
  return getAddress(value);
}

function loadDeployerAccount() {
  const configured = configuredDeployer();
  const privateKey = process.env.PAYGUARD_DEPLOYER_PRIVATE_KEY;
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey ?? "")) {
    throw new Error("PAYGUARD_DEPLOYER_PRIVATE_KEY is missing or malformed");
  }
  const account = privateKeyToAccount(privateKey);
  if (account.address !== configured) throw new Error("configured deployer address does not match local key");
  return account;
}

function rpcUrl() {
  loadLocalEnvironment();
  const configured = process.env.COSTON2_RPC_URL?.trim() || COSTON2_RPC_URL;
  if (configured !== COSTON2_RPC_URL) throw new Error("only the pinned credential-free Coston2 RPC is accepted");
  return configured;
}

async function officialManager() {
  const response = await fetch(FCC_DEPLOYMENTS_URL, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`official FCC deployment source returned HTTP ${response.status}`);
  return resolveOfficialTeeManager(await response.arrayBuffer());
}

function clientFor(url) {
  return createPublicClient({ chain: coston2, transport: http(url, { timeout: 15_000, retryCount: 2 }) });
}

async function preflight() {
  const url = rpcUrl();
  const deployer = configuredDeployer();
  const client = clientFor(url);
  const [{ commit, clean }, artifact, official] = await Promise.all([
    sourceCommit({ requireClean: false }),
    readArtifact(),
    officialManager(),
  ]);
  const manager = official.address;
  const deploymentData = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [manager, manager],
  });
  const [chainId, blockNumber, balance, managerCode, nextPublicExtensionId, allOwnersAllowed, ownerAllowed, gasPrice, deploymentGas] =
    await Promise.all([
      client.getChainId(),
      client.getBlockNumber(),
      client.getBalance({ address: deployer }),
      client.getCode({ address: manager }),
      client.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "nextPublicExtensionId" }),
      client.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "allExtensionOwnersAllowed" }),
      client.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isAllowedExtensionOwner", args: [deployer] }),
      client.getGasPrice(),
      client.estimateGas({ account: deployer, data: deploymentData }),
    ]);
  const estimatedBuffer = deploymentGas * gasPrice * 10n;
  const requiredBalance = estimatedBuffer > minimumGasBalance ? estimatedBuffer : minimumGasBalance;
  const checks = {
    chainIdMatches: chainId === COSTON2_CHAIN_ID,
    officialSourceDigestMatches: official.sha256 === FCC_DEPLOYMENTS_SHA256,
    managerRuntimePresent: Boolean(managerCode && managerCode !== "0x"),
    publicExtensionRangeActive: nextPublicExtensionId >= 0x10000n,
    deployerMayRegisterExtension: allOwnersAllowed || ownerAllowed,
    deployerHasGasBuffer: balance >= requiredBalance,
  };
  if (!Object.values(checks).every(Boolean)) throw new Error("FCC foundation preflight failed closed");
  return {
    status: "ready",
    sourceCommit: commit,
    worktreeClean: clean,
    network: { name: "flare-coston2", chainId, rpcUrl: url, observedBlock: String(blockNumber) },
    officialSource: {
      repository: FCC_SCAFFOLD_REPOSITORY,
      commit: FCC_SCAFFOLD_COMMIT,
      path: FCC_DEPLOYMENTS_PATH,
      url: FCC_DEPLOYMENTS_URL,
      sha256: official.sha256,
      manager,
    },
    deployer,
    deployerBalanceWei: balance.toString(),
    requiredGasBufferWei: requiredBalance.toString(),
    nextPublicExtensionId: nextPublicExtensionId.toString(),
    artifact: { contractName: "PayGuardFoundationSender", creationCodeHash: artifact.creationCodeHash },
    checks,
    note: "Read-only preflight; no transaction was signed or broadcast.",
  };
}

async function saveJson(path, value, mode = 0o600) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
  await chmod(temporary, mode);
  await rename(temporary, path);
  await chmod(path, mode);
}

async function loadState() {
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8"));
    return validateFoundationRegistrationState(parsed).state;
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function wait(client, transactionHash) {
  const receipt = await client.waitForTransactionReceipt({
    hash: transactionHash,
    confirmations: 2,
    timeout: 180_000,
  });
  if (receipt.status !== "success") throw new Error(`FCC transaction ${transactionHash} reverted`);
  return receipt;
}

async function writeContract({ client, wallet, account, address, abi, functionName, args }) {
  const simulation = await client.simulateContract({
    account: account.address,
    address,
    abi,
    functionName,
    args,
  });
  return wallet.writeContract({ ...simulation.request, account, chain: coston2 });
}

async function configureManagerFlag({ state, key, read, write }) {
  const current = await read();
  if (current) {
    if (!state.configuration[key]) {
      state.configuration[key] = {
        source: "already-configured",
        observedBlock: String(await state.client.getBlockNumber()),
        receiptStatus: "not-required",
      };
      await saveJson(statePath, state.serializable);
    }
    return;
  }
  let entry = state.configuration[key];
  if (!entry?.transactionHash) {
    const transactionHash = await write();
    entry = { source: "transaction", transactionHash };
    state.configuration[key] = entry;
    await saveJson(statePath, state.serializable);
  }
  const receipt = await wait(state.client, entry.transactionHash);
  Object.assign(entry, { blockNumber: String(receipt.blockNumber), receiptStatus: receipt.status });
  await saveJson(statePath, state.serializable);
  if (!(await read())) throw new Error(`${key} configuration did not become effective`);
}

async function verifyOnChain(client, artifact, state) {
  const manager = getAddress(state.officialSource.manager);
  const deployer = getAddress(state.deployer);
  const sender = getAddress(state.sender.address);
  const extensionId = BigInt(state.registration.extensionId);
  const [
    chainId,
    observedBlock,
    managerCode,
    senderCode,
    deploymentReceipt,
    deploymentTransaction,
    registrationReceipt,
    nextPublicExtensionId,
    registeredSender,
    registeredStateVerifier,
    senderChainId,
    senderVersion,
    senderOwner,
    senderRegistry,
    senderMachineRegistry,
    senderExtensionId,
    machineOwnerAllowed,
    walletProjectOwnerAllowed,
    evmKeyTypeSupported,
  ] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getCode({ address: manager }),
    client.getCode({ address: sender }),
    client.getTransactionReceipt({ hash: state.sender.transactionHash }),
    client.getTransaction({ hash: state.sender.transactionHash }),
    client.getTransactionReceipt({ hash: state.registration.transactionHash }),
    client.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "nextPublicExtensionId" }),
    client.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "getTeeExtensionInstructionsSender", args: [extensionId] }),
    client.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "getTeeExtensionStateVerifier", args: [extensionId] }),
    client.readContract({ address: sender, abi: artifact.abi, functionName: "COSTON2_CHAIN_ID" }),
    client.readContract({ address: sender, abi: artifact.abi, functionName: "FOUNDATION_SENDER_VERSION" }),
    client.readContract({ address: sender, abi: artifact.abi, functionName: "owner" }),
    client.readContract({ address: sender, abi: artifact.abi, functionName: "teeExtensionRegistry" }),
    client.readContract({ address: sender, abi: artifact.abi, functionName: "teeMachineRegistry" }),
    client.readContract({ address: sender, abi: artifact.abi, functionName: "getExtensionId" }),
    client.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isAllowedTeeMachineOwner", args: [extensionId, deployer] }),
    client.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isAllowedTeeWalletProjectOwner", args: [extensionId, deployer] }),
    client.readContract({ address: manager, abi: teeManagerRegistrationAbi, functionName: "isKeyTypeSupported", args: [extensionId, EVM_KEY_TYPE] }),
  ]);
  if (!senderCode || senderCode === "0x") throw new Error("foundation sender runtime is missing");
  const runtime = verifyRuntimeBytecode(senderCode, artifact.runtimeCode, artifact.immutableReferences);
  const decoded = decodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    data: deploymentTransaction.input,
  });
  const constructorManagerBindingsVerified =
    decoded.args?.length === 2 && decoded.args.every((value) => getAddress(value) === manager);
  const events = parseEventLogs({
    abi: teeManagerRegistrationAbi,
    logs: registrationReceipt.logs,
    eventName: "TeeExtensionRegistered",
    strict: true,
  });
  const registered = events.find((event) => event.args.extensionId === extensionId);
  const result = evaluateFoundationRegistration({
    chainId,
    officialSourceVerified: state.officialSource.sha256 === FCC_DEPLOYMENTS_SHA256,
    managerRuntimePresent: Boolean(managerCode && managerCode !== "0x"),
    deployerMatchesConfiguredAddress: deployer === configuredDeployer(),
    deployerHadRegistrationPermission: state.preflight.deployerMayRegisterExtension === true,
    senderDeploymentStatus: deploymentReceipt.status,
    senderAddress: sender,
    senderReceiptAddress: getAddress(deploymentReceipt.contractAddress),
    senderRuntimeVerified: runtime.runtimeBytes > 0,
    constructorManagerBindingsVerified,
    registrationStatus: registrationReceipt.status,
    extensionId,
    nextPublicExtensionId,
    extensionOwner: registered ? getAddress(registered.args.owner) : undefined,
    deployer,
    registeredSender: getAddress(registeredSender),
    registeredStateVerifier: getAddress(registeredStateVerifier),
    senderChainId,
    senderVersion,
    senderOwner: getAddress(senderOwner),
    senderRegistry: getAddress(senderRegistry),
    senderMachineRegistry: getAddress(senderMachineRegistry),
    senderExtensionId,
    manager,
    machineOwnerAllowed,
    walletProjectOwnerAllowed,
    evmKeyTypeSupported,
  });
  if (result.status !== "verified") throw new Error("FCC foundation registration verification failed");
  Object.assign(state.sender, {
    blockNumber: String(deploymentReceipt.blockNumber),
    receiptStatus: deploymentReceipt.status,
    runtimeCodeHash: runtime.runtimeCodeHash,
    runtimeBytes: runtime.runtimeBytes,
    runtimeVerified: true,
  });
  Object.assign(state.registration, {
    blockNumber: String(registrationReceipt.blockNumber),
    receiptStatus: registrationReceipt.status,
  });
  Object.assign(state, {
    status: "verified",
    assertions: result.assertions,
    observedBlock: String(observedBlock),
    verifiedAt: new Date().toISOString(),
  });
  validateFoundationRegistrationState(state, { requireComplete: true });
  return state;
}

export async function planFoundationRegistration() {
  return preflight();
}

export async function deployFoundationRegistration({ broadcast = false } = {}) {
  if (!broadcast) throw new Error("FCC foundation deployment requires explicit --broadcast");
  const ready = await preflight();
  const { commit } = await sourceCommit({ requireClean: true });
  if (ready.sourceCommit !== commit) throw new Error("source commit changed after preflight");
  const account = loadDeployerAccount();
  const artifact = await readArtifact();
  const client = clientFor(ready.network.rpcUrl);
  const wallet = createWalletClient({ account, chain: coston2, transport: http(ready.network.rpcUrl, { timeout: 15_000, retryCount: 2 }) });
  let state = await loadState();
  if (!state) {
    state = {
      schemaVersion: 1,
      status: "in-progress",
      sourceCommit: commit,
      deployer: account.address,
      network: ready.network,
      officialSource: ready.officialSource,
      artifact: ready.artifact,
      preflight: ready.checks,
      configuration: {},
    };
    await saveJson(statePath, state);
  }
  const validated = validateFoundationRegistrationState(state);
  if (
    state.sourceCommit !== commit || validated.deployer !== account.address
      || validated.manager !== ready.officialSource.manager
      || state.artifact.creationCodeHash !== artifact.creationCodeHash
  ) throw new Error("FCC foundation resume state mismatch");

  if (!state.sender) {
    const nonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
    state.sender = {
      address: getContractAddress({ from: account.address, nonce: BigInt(nonce) }),
      nonce: String(nonce),
    };
    await saveJson(statePath, state);
  }
  if (!state.sender.transactionHash) {
    const plannedNonce = Number(state.sender.nonce);
    const pendingNonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
    if (pendingNonce !== plannedNonce) throw new Error("foundation deployment nonce is no longer safe");
    const existing = await client.getCode({ address: state.sender.address });
    if (existing && existing !== "0x") throw new Error("untracked code exists at planned foundation sender address");
    state.sender.transactionHash = await wallet.deployContract({
      account,
      chain: coston2,
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      args: [validated.manager, validated.manager],
      nonce: plannedNonce,
    });
    await saveJson(statePath, state);
  }
  const deploymentReceipt = await wait(client, state.sender.transactionHash);
  if (!deploymentReceipt.contractAddress || getAddress(deploymentReceipt.contractAddress) !== getAddress(state.sender.address)) {
    throw new Error("foundation sender deployment receipt address mismatch");
  }
  state.sender.blockNumber = String(deploymentReceipt.blockNumber);
  state.sender.receiptStatus = deploymentReceipt.status;
  await saveJson(statePath, state);

  let registrationReceipt;
  if (!state.registration) {
    let transactionHash = state.registrationTransaction;
    if (!transactionHash) {
      const recovered = await client.getContractEvents({
        address: validated.manager,
        abi: teeManagerRegistrationAbi,
        eventName: "TeeExtensionContractsSet",
        args: { teeExtensionInstructionsSender: state.sender.address },
        fromBlock: deploymentReceipt.blockNumber,
        toBlock: "latest",
        strict: true,
      });
      if (recovered.length > 1) throw new Error("foundation sender has multiple extension registrations");
      transactionHash = recovered[0]?.transactionHash;
    }
    if (!transactionHash) {
      const expected = await client.readContract({
        address: validated.manager,
        abi: teeManagerRegistrationAbi,
        functionName: "nextPublicExtensionId",
      });
      state.plannedExtensionId = expected.toString();
      await saveJson(statePath, state);
      transactionHash = await writeContract({
        client,
        wallet,
        account,
        address: validated.manager,
        abi: teeManagerRegistrationAbi,
        functionName: "register",
        args: [zeroAddress, state.sender.address],
      });
    }
    state.registrationTransaction = transactionHash;
    await saveJson(statePath, state);
    registrationReceipt = await wait(client, transactionHash);
    const events = parseEventLogs({
      abi: teeManagerRegistrationAbi,
      logs: registrationReceipt.logs,
      eventName: "TeeExtensionRegistered",
      strict: true,
    });
    const owned = events.filter((entry) => getAddress(entry.args.owner) === account.address);
    if (owned.length !== 1) throw new Error("foundation registration event mismatch");
    const extensionId = owned[0].args.extensionId;
    state.registration = {
      extensionId: extensionId.toString(),
      transactionHash,
      blockNumber: String(registrationReceipt.blockNumber),
      receiptStatus: registrationReceipt.status,
    };
    await saveJson(statePath, state);
  } else {
    registrationReceipt = await wait(client, state.registration.transactionHash);
  }
  const extensionId = BigInt(state.registration.extensionId);

  if (!state.configuration.binding) {
    const bound = await client.readContract({ address: state.sender.address, abi: artifact.abi, functionName: "getExtensionId" });
    if (bound === 0n) {
      const transactionHash = await writeContract({
        client,
        wallet,
        account,
        address: state.sender.address,
        abi: artifact.abi,
        functionName: "setExtensionIdExplicit",
        args: [extensionId],
      });
      const receipt = await wait(client, transactionHash);
      state.configuration.binding = {
        source: "transaction",
        transactionHash,
        blockNumber: String(receipt.blockNumber),
        receiptStatus: receipt.status,
      };
    } else if (bound === extensionId) {
      const events = await client.getContractEvents({
        address: state.sender.address,
        abi: artifact.abi,
        eventName: "ExtensionIdConfigured",
        args: { extensionId },
        fromBlock: deploymentReceipt.blockNumber,
        toBlock: "latest",
        strict: true,
      });
      const recovered = events[0];
      if (!recovered?.transactionHash) throw new Error("unable to recover foundation binding transaction");
      const receipt = await wait(client, recovered.transactionHash);
      state.configuration.binding = {
        source: "transaction",
        transactionHash: recovered.transactionHash,
        blockNumber: String(receipt.blockNumber),
        receiptStatus: receipt.status,
      };
    } else {
      throw new Error("foundation sender is bound to an unexpected extension ID");
    }
    await saveJson(statePath, state);
  }

  const runtimeState = { ...state, client, serializable: state };
  await configureManagerFlag({
    state: runtimeState,
    key: "machineOwner",
    read: () => client.readContract({ address: validated.manager, abi: teeManagerRegistrationAbi, functionName: "isAllowedTeeMachineOwner", args: [extensionId, account.address] }),
    write: () => writeContract({ client, wallet, account, address: validated.manager, abi: teeManagerRegistrationAbi, functionName: "addAllowedTeeMachineOwners", args: [extensionId, [account.address]] }),
  });
  await configureManagerFlag({
    state: runtimeState,
    key: "walletProjectOwner",
    read: () => client.readContract({ address: validated.manager, abi: teeManagerRegistrationAbi, functionName: "isAllowedTeeWalletProjectOwner", args: [extensionId, account.address] }),
    write: () => writeContract({ client, wallet, account, address: validated.manager, abi: teeManagerRegistrationAbi, functionName: "addAllowedTeeWalletProjectOwners", args: [extensionId, [account.address]] }),
  });
  await configureManagerFlag({
    state: runtimeState,
    key: "evmKeyType",
    read: () => client.readContract({ address: validated.manager, abi: teeManagerRegistrationAbi, functionName: "isKeyTypeSupported", args: [extensionId, EVM_KEY_TYPE] }),
    write: () => writeContract({ client, wallet, account, address: validated.manager, abi: teeManagerRegistrationAbi, functionName: "addSupportedKeyTypes", args: [extensionId, [EVM_KEY_TYPE]] }),
  });

  state = await verifyOnChain(client, artifact, state);
  await saveJson(statePath, state);
  await saveJson(evidencePath, buildFoundationRegistrationEvidence(state), 0o644);
  return {
    status: state.status,
    sourceCommit: state.sourceCommit,
    manager: state.officialSource.manager,
    foundationSender: state.sender.address,
    extensionId: state.registration.extensionId,
    observedBlock: state.observedBlock,
    evidence: "evidence/coston2/fcc-foundation-registration.json",
  };
}

export async function verifyFoundationRegistration() {
  const state = await loadState();
  if (!state) throw new Error("local FCC foundation registration state does not exist");
  const official = await officialManager();
  if (official.address !== getAddress(state.officialSource.manager) || official.sha256 !== state.officialSource.sha256) {
    throw new Error("official FCC foundation source drifted");
  }
  const artifact = await readArtifact();
  if (artifact.creationCodeHash !== state.artifact.creationCodeHash) throw new Error("foundation artifact drifted");
  const verified = await verifyOnChain(clientFor(rpcUrl()), artifact, state);
  await saveJson(statePath, verified);
  const evidence = buildFoundationRegistrationEvidence(verified);
  await saveJson(evidencePath, evidence, 0o644);
  return {
    status: verified.status,
    sourceCommit: verified.sourceCommit,
    foundationSender: verified.sender.address,
    extensionId: verified.registration.extensionId,
    observedBlock: verified.observedBlock,
  };
}

async function main() {
  const mode = process.argv[2] ?? "plan";
  let result;
  if (mode === "plan") result = await planFoundationRegistration();
  else if (mode === "deploy") {
    result = await deployFoundationRegistration({ broadcast: process.argv.includes("--broadcast") });
  } else if (mode === "verify") result = await verifyFoundationRegistration();
  else throw new Error(`unknown FCC foundation mode: ${mode}`);
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
