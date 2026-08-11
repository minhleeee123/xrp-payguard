import { execFile } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseAbi,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { FCC_TEE_MANAGER } from "./fcc-foundation-registration.mjs";
import { PAYGUARD_EXTENSION_ID, PAYGUARD_FOUNDATION_SENDER } from "./fcc-code-version.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const artifactPath = resolve(root, "packages/contracts/out/PayGuardFccDispatcher.sol/PayGuardFccDispatcher.json");
const evidencePath = resolve(root, "evidence/coston2/fcc-live-dispatcher.json");
const rpc = "https://coston2-api.flare.network/ext/C/rpc";
const managerAbi = parseAbi([
  "function getExtensionOwner(uint256 extensionId) view returns (address)",
  "function getTeeExtensionStateVerifier(uint256 extensionId) view returns (address)",
  "function getTeeExtensionInstructionsSender(uint256 extensionId) view returns (address)",
  "function setExtensionContracts(uint256 extensionId,address teeExtensionStateVerifier,address teeExtensionInstructionsSender)",
]);
const dispatcherAbi = parseAbi([
  "function owner() view returns (address)",
  "function teeExtensionRegistry() view returns (address)",
  "function teeMachineRegistry() view returns (address)",
  "function getExtensionId() view returns (uint256)",
  "function setExtensionIdExplicit(uint256 candidate)",
  "function sendFoundationPing(bytes32 requestNonce,bytes32 payloadHash) payable returns (bytes32 instructionId)",
  "function sendEvaluation(address[3] teeIds,bytes message) payable returns (bytes32 instructionId)",
]);
const chain = {
  id: 114,
  name: "Flare Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
};

export function parseDispatcherCLI(argv) {
  const [mode, ...tokens] = argv;
  if (mode !== "plan" && mode !== "deploy" && mode !== "verify") throw new Error("mode must be plan, deploy, or verify");
  let broadcast = false;
  const options = { mode, broadcast, dispatcher: undefined, deploymentTransaction: undefined, managerUpdateTransaction: undefined, extensionBindingTransaction: undefined, deploymentSourceCommit: undefined };
  const fields = new Map([
    ["--dispatcher", "dispatcher"],
    ["--deployment-tx", "deploymentTransaction"],
    ["--manager-tx", "managerUpdateTransaction"],
    ["--binding-tx", "extensionBindingTransaction"],
    ["--deployment-source-commit", "deploymentSourceCommit"],
  ]);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--broadcast") {
      if (broadcast) throw new Error("duplicate --broadcast");
      broadcast = true;
      continue;
    }
    const field = fields.get(token);
    if (!field || options[field] !== undefined || index + 1 >= tokens.length) throw new Error(`invalid or duplicate argument ${token}`);
    options[field] = tokens[index + 1];
    index += 1;
  }
  if (mode === "deploy" && !broadcast) throw new Error("deploy requires --broadcast");
  if (mode !== "deploy" && broadcast) throw new Error(`${mode} cannot broadcast`);
  const verifyFields = ["dispatcher", "deploymentTransaction", "managerUpdateTransaction", "extensionBindingTransaction", "deploymentSourceCommit"];
  if (mode === "verify" && verifyFields.some((field) => options[field] === undefined)) throw new Error("verify requires dispatcher, three transaction hashes, and deployment source commit");
  if (mode !== "verify" && verifyFields.some((field) => options[field] !== undefined)) throw new Error("deployment recovery arguments are accepted only in verify mode");
  return { ...options, broadcast };
}

export function buildDispatcherEvidence(input) {
  if (!/^[0-9a-f]{40}$/.test(input.sourceCommit)) throw new Error("source commit must be a full git hash");
  for (const [key, value] of Object.entries({
    dispatcher: input.dispatcher,
    deploymentTransaction: input.deploymentTransaction,
    managerUpdateTransaction: input.managerUpdateTransaction,
    extensionBindingTransaction: input.extensionBindingTransaction,
  })) {
    const pattern = key === "dispatcher" ? /^0x[0-9a-fA-F]{40}$/ : /^0x[0-9a-fA-F]{64}$/;
    if (!pattern.test(value)) throw new Error(`${key} is malformed`);
  }
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-live-fcc-dispatcher",
    status: "verified-live-simulated-fcc-dispatcher",
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    network: { name: "flare-coston2", chainId: 114, observedBlock: input.observedBlock.toString() },
    publicIdentifiers: {
      verificationSourceCommit: input.sourceCommit,
      deploymentSourceCommit: input.deploymentSourceCommit ?? input.sourceCommit,
      manager: FCC_TEE_MANAGER,
      extensionId: PAYGUARD_EXTENSION_ID.toString(),
      dispatcher: getAddress(input.dispatcher),
      runtimeHash: input.runtimeHash,
      runtimeTemplateHash: input.runtimeTemplateHash,
      deploymentTransaction: input.deploymentTransaction,
      managerUpdateTransaction: input.managerUpdateTransaction,
      extensionBindingTransaction: input.extensionBindingTransaction,
    },
    assertions: {
      chainIdVerified: true,
      ownerVerified: true,
      managerRuntimeVerified: true,
      priorFoundationSenderVerified: true,
      dispatcherRuntimeVerified: true,
      managerSenderUpdatedVerified: true,
      extensionBindingVerified: true,
      foundationPingSurfacePreserved: true,
      evaluationSurfaceVerified: true,
      clientDecisionFieldAbsent: true,
      simulatedTee: true,
      hardwareAttestationVerified: false,
      liveThresholdEvaluationVerified: false,
      noPrivateKeyRecorded: true,
      noCredentialRecorded: true,
      noPolicyRecorded: true,
      noCiphertextRecorded: true,
      noSignatureRecorded: true,
      testnetOnly: true,
    },
    blockers: ["LIVE_TWO_OF_THREE_EVALUATION_NOT_YET_VERIFIED", "V2_RELEASE_NOT_VERIFIED", "HARDWARE_ATTESTATION_NOT_VERIFIED"],
    notes: [
      "The dispatcher accepts only public request/state bytes and never accepts an ALLOW/DENY decision.",
      "This Coston2 deployment supports an explicitly simulated FCC lifecycle and is not a verified V2 or hardware release.",
    ],
  };
}

async function sourceCommit(requireClean) {
  const [{ stdout: commit }, { stdout: status }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root }),
    execFileAsync("git", ["status", "--porcelain=v1"], { cwd: root }),
  ]);
  if (requireClean && status.trim()) throw new Error("dispatcher deployment requires a clean source commit");
  if (!/^[0-9a-f]{40}$/.test(commit.trim())) throw new Error("unable to resolve source commit");
  return commit.trim();
}

async function artifact() {
  const parsed = JSON.parse(await readFile(artifactPath, "utf8"));
  const bytecode = parsed?.bytecode?.object;
  const deployedBytecode = parsed?.deployedBytecode?.object;
  if (!/^0x[0-9a-fA-F]+$/.test(bytecode) || !/^0x[0-9a-fA-F]+$/.test(deployedBytecode)) throw new Error("dispatcher artifact is missing bytecode");
  return { abi: parsed.abi, bytecode, deployedBytecode, immutableReferences: parsed.deployedBytecode.immutableReferences ?? {}, runtimeTemplateHash: keccak256(deployedBytecode) };
}

function normalizedRuntime(code, immutableReferences) {
  const bytes = Buffer.from(code.slice(2), "hex");
  for (const ranges of Object.values(immutableReferences)) {
    for (const range of ranges) bytes.fill(0, range.start, range.start + range.length);
  }
  return `0x${bytes.toString("hex")}`;
}

function verifyRuntime(code, compiled) {
  if (!code || code === "0x" || code.length !== compiled.deployedBytecode.length) throw new Error("dispatcher runtime length mismatch");
  if (keccak256(normalizedRuntime(code, compiled.immutableReferences)) !== keccak256(normalizedRuntime(compiled.deployedBytecode, compiled.immutableReferences))) {
    throw new Error("dispatcher runtime differs outside constructor immutables");
  }
  return keccak256(code);
}

function account() {
  try { process.loadEnvFile(resolve(root, ".env.local")); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const key = process.env.PAYGUARD_DEPLOYER_PRIVATE_KEY;
  const configured = process.env.PAYGUARD_DEPLOYER_ADDRESS;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? "") || !isAddress(configured ?? "")) throw new Error("dedicated PayGuard deployer configuration is missing");
  const signer = privateKeyToAccount(key);
  if (signer.address !== getAddress(configured)) throw new Error("configured deployer address does not match its key");
  return signer;
}

async function write(client, wallet, signer, address, abi, functionName, args) {
  const simulation = await client.simulateContract({ account: signer.address, address, abi, functionName, args });
  const transaction = await wallet.writeContract({ ...simulation.request, account: signer, chain });
  const receipt = await client.waitForTransactionReceipt({ hash: transaction, confirmations: 2, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  return { transaction, receipt };
}

async function preflight(options) {
  const signer = account();
  const compiled = await artifact();
  const client = createPublicClient({ chain, transport: http(rpc, { timeout: 15_000, retryCount: 2 }) });
  const [chainId, managerCode, owner, stateVerifier, currentSender, balance, blockNumber] = await Promise.all([
    client.getChainId(),
    client.getCode({ address: FCC_TEE_MANAGER }),
    client.readContract({ address: FCC_TEE_MANAGER, abi: managerAbi, functionName: "getExtensionOwner", args: [PAYGUARD_EXTENSION_ID] }),
    client.readContract({ address: FCC_TEE_MANAGER, abi: managerAbi, functionName: "getTeeExtensionStateVerifier", args: [PAYGUARD_EXTENSION_ID] }),
    client.readContract({ address: FCC_TEE_MANAGER, abi: managerAbi, functionName: "getTeeExtensionInstructionsSender", args: [PAYGUARD_EXTENSION_ID] }),
    client.getBalance({ address: signer.address }),
    client.getBlockNumber(),
  ]);
  const expectedSender = options.mode === "verify" ? getAddress(options.dispatcher) : PAYGUARD_FOUNDATION_SENDER;
  if (chainId !== 114 || !managerCode || managerCode === "0x" || getAddress(owner) !== signer.address
    || getAddress(stateVerifier) !== zeroAddress || getAddress(currentSender) !== expectedSender
    || balance < 50_000_000_000_000_000n) throw new Error("dispatcher preflight failed closed");
  return { signer, compiled, client, blockNumber, currentSender: getAddress(currentSender) };
}

async function saveEvidence(value) {
  const temporary = `${evidencePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, evidencePath);
}

async function main() {
  const options = parseDispatcherCLI(process.argv.slice(2));
  const plan = await preflight(options);
  if (options.mode === "plan") {
    console.log(JSON.stringify({
      status: "ready",
      network: "flare-coston2",
      extensionId: PAYGUARD_EXTENSION_ID.toString(),
      currentSender: plan.currentSender,
      creationCodeHash: keccak256(plan.compiled.bytecode),
      runtimeTemplateHash: plan.compiled.runtimeTemplateHash,
      transactions: ["deploy dispatcher", "set extension contracts", "bind extension ID"],
      note: "Read-only plan; no transaction was signed or broadcast.",
    }, null, 2));
    return;
  }
  const commit = await sourceCommit(true);
  if (options.mode === "verify") {
    const dispatcher = getAddress(options.dispatcher);
    const [code, owner, extensionRegistry, machineRegistry, boundExtension, deploymentReceipt, managerReceipt, bindingReceipt, observedBlock] = await Promise.all([
      plan.client.getCode({ address: dispatcher }),
      plan.client.readContract({ address: dispatcher, abi: dispatcherAbi, functionName: "owner" }),
      plan.client.readContract({ address: dispatcher, abi: dispatcherAbi, functionName: "teeExtensionRegistry" }),
      plan.client.readContract({ address: dispatcher, abi: dispatcherAbi, functionName: "teeMachineRegistry" }),
      plan.client.readContract({ address: dispatcher, abi: dispatcherAbi, functionName: "getExtensionId" }),
      plan.client.getTransactionReceipt({ hash: options.deploymentTransaction }),
      plan.client.getTransactionReceipt({ hash: options.managerUpdateTransaction }),
      plan.client.getTransactionReceipt({ hash: options.extensionBindingTransaction }),
      plan.client.getBlockNumber(),
    ]);
    const runtimeHash = verifyRuntime(code, plan.compiled);
    if (getAddress(owner) !== plan.signer.address || getAddress(extensionRegistry) !== FCC_TEE_MANAGER
      || getAddress(machineRegistry) !== FCC_TEE_MANAGER || boundExtension !== PAYGUARD_EXTENSION_ID
      || deploymentReceipt.status !== "success" || getAddress(deploymentReceipt.contractAddress) !== dispatcher
      || managerReceipt.status !== "success" || bindingReceipt.status !== "success"
      || deploymentReceipt.blockNumber > managerReceipt.blockNumber || managerReceipt.blockNumber > bindingReceipt.blockNumber) throw new Error("dispatcher recovery readback mismatch");
    const evidence = buildDispatcherEvidence({
      sourceCommit: commit,
      deploymentSourceCommit: options.deploymentSourceCommit,
      observedBlock,
      dispatcher,
      runtimeHash,
      runtimeTemplateHash: plan.compiled.runtimeTemplateHash,
      deploymentTransaction: options.deploymentTransaction,
      managerUpdateTransaction: options.managerUpdateTransaction,
      extensionBindingTransaction: options.extensionBindingTransaction,
    });
    await saveEvidence(evidence);
    console.log(JSON.stringify({ status: evidence.status, dispatcher, recovered: true, evidencePath }));
    return;
  }
  const wallet = createWalletClient({ account: plan.signer, chain, transport: http(rpc, { timeout: 15_000, retryCount: 2 }) });
  const deploymentTransaction = await wallet.deployContract({
    account: plan.signer,
    chain,
    abi: plan.compiled.abi,
    bytecode: plan.compiled.bytecode,
    args: [FCC_TEE_MANAGER, FCC_TEE_MANAGER],
  });
  const deploymentReceipt = await plan.client.waitForTransactionReceipt({ hash: deploymentTransaction, confirmations: 2, timeout: 180_000 });
  if (deploymentReceipt.status !== "success" || !deploymentReceipt.contractAddress) throw new Error("dispatcher deployment failed");
  const dispatcher = getAddress(deploymentReceipt.contractAddress);
  const managerUpdate = await write(plan.client, wallet, plan.signer, FCC_TEE_MANAGER, managerAbi, "setExtensionContracts", [PAYGUARD_EXTENSION_ID, zeroAddress, dispatcher]);
  let extensionBinding;
  try {
    extensionBinding = await write(plan.client, wallet, plan.signer, dispatcher, dispatcherAbi, "setExtensionIdExplicit", [PAYGUARD_EXTENSION_ID]);
  } catch (error) {
    await write(plan.client, wallet, plan.signer, FCC_TEE_MANAGER, managerAbi, "setExtensionContracts", [PAYGUARD_EXTENSION_ID, zeroAddress, PAYGUARD_FOUNDATION_SENDER]);
    throw error;
  }
  const [code, owner, extensionRegistry, machineRegistry, boundExtension, currentSender, observedBlock] = await Promise.all([
    plan.client.getCode({ address: dispatcher }),
    plan.client.readContract({ address: dispatcher, abi: dispatcherAbi, functionName: "owner" }),
    plan.client.readContract({ address: dispatcher, abi: dispatcherAbi, functionName: "teeExtensionRegistry" }),
    plan.client.readContract({ address: dispatcher, abi: dispatcherAbi, functionName: "teeMachineRegistry" }),
    plan.client.readContract({ address: dispatcher, abi: dispatcherAbi, functionName: "getExtensionId" }),
    plan.client.readContract({ address: FCC_TEE_MANAGER, abi: managerAbi, functionName: "getTeeExtensionInstructionsSender", args: [PAYGUARD_EXTENSION_ID] }),
    plan.client.getBlockNumber(),
  ]);
  const runtimeHash = verifyRuntime(code, plan.compiled);
  if (getAddress(owner) !== plan.signer.address || getAddress(extensionRegistry) !== FCC_TEE_MANAGER
    || getAddress(machineRegistry) !== FCC_TEE_MANAGER || boundExtension !== PAYGUARD_EXTENSION_ID
    || getAddress(currentSender) !== dispatcher) throw new Error("dispatcher deployment readback mismatch");
  const evidence = buildDispatcherEvidence({
    sourceCommit: commit,
    observedBlock,
    dispatcher,
    runtimeHash,
    runtimeTemplateHash: plan.compiled.runtimeTemplateHash,
    deploymentTransaction,
    managerUpdateTransaction: managerUpdate.transaction,
    extensionBindingTransaction: extensionBinding.transaction,
  });
  await saveEvidence(evidence);
  console.log(JSON.stringify({ status: evidence.status, dispatcher, extensionId: PAYGUARD_EXTENSION_ID.toString(), evidencePath }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : "dispatcher deployment failed"); process.exitCode = 1; });
}
