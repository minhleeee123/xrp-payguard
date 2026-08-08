import { execFile } from "node:child_process";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  parseEventLogs,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  PAYGUARD_EXTENSION_ID,
  PAYGUARD_EXTENSION_OWNER,
  PAYGUARD_FOUNDATION_SENDER,
  PAYGUARD_TEE_VERSION,
  PAYGUARD_TEE_VERSION_BYTES32,
  evaluateCodeVersionPlan,
  normalizeExpectedImageID,
  validateMachineAdmission,
} from "./fcc-code-version.mjs";
import {
  COSTON2_CHAIN_ID,
  COSTON2_RPC_URL,
  FCC_DEPLOYMENTS_SHA256,
  FCC_DEPLOYMENTS_URL,
  FCC_TEE_MANAGER,
  resolveOfficialTeeManager,
  teeManagerRegistrationAbi,
} from "./fcc-foundation-registration.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const extensionRoot = resolve(root, "apps/fcc-extension");
const evidencePath = resolve(root, "evidence/coston2/fcc-code-version-allowance.json");
const registrationBlock = 33795055n;
const minimumGasBalance = 50_000_000_000_000_000n;

const coston2 = {
  id: COSTON2_CHAIN_ID,
  name: "Flare Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [COSTON2_RPC_URL] } },
};

export function parseCodeVersionCLI(argv) {
  const [mode, ...tokens] = argv;
  if (!new Set(["plan", "deploy", "verify"]).has(mode)) throw new Error("mode must be plan, deploy, or verify");
  const options = { mode, broadcast: false };
  const valueFlags = new Map([
    ["--url", "url"],
    ["--image-id", "imageId"],
    ["--leaf-crl", "leafCRL"],
    ["--intermediate-crl", "intermediateCRL"],
  ]);
  const seen = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--broadcast") {
      if (seen.has(token)) throw new Error("duplicate --broadcast");
      seen.add(token);
      options.broadcast = true;
      continue;
    }
    const property = valueFlags.get(token);
    if (!property || seen.has(token) || index + 1 >= tokens.length) throw new Error(`invalid or duplicate argument ${token}`);
    seen.add(token);
    options[property] = tokens[index + 1];
    index += 1;
  }
  if (!options.url || !options.imageId) throw new Error("--url and --image-id are required");
  if (mode !== "deploy" && options.broadcast) throw new Error("--broadcast is accepted only in deploy mode");
  if (mode === "deploy" && !options.broadcast) throw new Error("deploy mode requires explicit --broadcast");
  options.expectedCodeHash = normalizeExpectedImageID(options.imageId);
  return options;
}

export function machinePreflightArgs(options) {
  const args = ["run", "./cmd/machine-preflight", "-url", options.url, "-image-id", options.imageId];
  if (options.leafCRL) args.push("-leaf-crl", options.leafCRL);
  if (options.intermediateCRL) args.push("-intermediate-crl", options.intermediateCRL);
  return args;
}

export async function runMachineAdmission(options, executor = execFileAsync) {
  const version = await executor("go", ["version"], { cwd: extensionRoot, encoding: "utf8", timeout: 15_000 });
  if (!/^go version go1\.25\.12\b/.test(version.stdout.trim())) throw new Error("machine admission requires pinned Go 1.25.12");
  const result = await executor("go", machinePreflightArgs(options), {
    cwd: extensionRoot,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 512 * 1024,
  });
  let parsed;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error("machine admission did not return one JSON result", { cause: error });
  }
  return validateMachineAdmission(parsed, { expectedCodeHash: options.expectedCodeHash });
}

function clientFor() {
  return createPublicClient({ chain: coston2, transport: http(COSTON2_RPC_URL, { timeout: 15_000, retryCount: 2 }) });
}

async function officialManager(fetcher = fetch) {
  const response = await fetcher(FCC_DEPLOYMENTS_URL, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`official FCC deployment source returned HTTP ${response.status}`);
  const resolved = resolveOfficialTeeManager(await response.arrayBuffer());
  if (resolved.address !== FCC_TEE_MANAGER || resolved.sha256 !== FCC_DEPLOYMENTS_SHA256) {
    throw new Error("official FCC manager pin mismatch");
  }
  return resolved;
}

export async function readCodeVersionSnapshot(client, admission) {
  const [
    chainId,
    blockNumber,
    managerCode,
    extensionOwner,
    foundationSender,
    stateVerifier,
    systemPlatforms,
    supportedCodeHashes,
    codeHashPlatformDisabled,
    codeHashPlatformSupported,
  ] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getCode({ address: FCC_TEE_MANAGER }),
    client.readContract({ address: FCC_TEE_MANAGER, abi: teeManagerRegistrationAbi, functionName: "getExtensionOwner", args: [PAYGUARD_EXTENSION_ID] }),
    client.readContract({ address: FCC_TEE_MANAGER, abi: teeManagerRegistrationAbi, functionName: "getTeeExtensionInstructionsSender", args: [PAYGUARD_EXTENSION_ID] }),
    client.readContract({ address: FCC_TEE_MANAGER, abi: teeManagerRegistrationAbi, functionName: "getTeeExtensionStateVerifier", args: [PAYGUARD_EXTENSION_ID] }),
    client.readContract({ address: FCC_TEE_MANAGER, abi: teeManagerRegistrationAbi, functionName: "getSystemSupportedPlatforms" }),
    client.readContract({ address: FCC_TEE_MANAGER, abi: teeManagerRegistrationAbi, functionName: "getSupportedCodeHashes", args: [PAYGUARD_EXTENSION_ID] }),
    client.readContract({ address: FCC_TEE_MANAGER, abi: teeManagerRegistrationAbi, functionName: "isCodeHashPlatformDisabled", args: [PAYGUARD_EXTENSION_ID, admission.codeHash, admission.platform] }),
    client.readContract({ address: FCC_TEE_MANAGER, abi: teeManagerRegistrationAbi, functionName: "isCodeHashPlatformSupported", args: [PAYGUARD_EXTENSION_ID, admission.codeHash, admission.platform] }),
  ]);
  const codeHashKnown = supportedCodeHashes.some((entry) => entry.toLowerCase() === admission.codeHash);
  let registeredVersion;
  let registeredPlatforms = [];
  if (codeHashKnown) {
    const info = await client.readContract({
      address: FCC_TEE_MANAGER,
      abi: teeManagerRegistrationAbi,
      functionName: "getCodeHashInfo",
      args: [PAYGUARD_EXTENSION_ID, admission.codeHash],
    });
    [registeredVersion, registeredPlatforms] = info;
  }
  return {
    chainId,
    blockNumber,
    manager: FCC_TEE_MANAGER,
    managerRuntimePresent: Boolean(managerCode && managerCode !== "0x"),
    extensionOwner: getAddress(extensionOwner),
    foundationSender: getAddress(foundationSender),
    stateVerifier: getAddress(stateVerifier),
    systemPlatforms,
    supportedCodeHashes,
    codeHashPlatformDisabled,
    codeHashPlatformSupported,
    registeredVersion,
    registeredPlatforms,
  };
}

async function createOperationalPlan(options, { client = clientFor(), executor = execFileAsync, fetcher = fetch } = {}) {
  const admission = await runMachineAdmission(options, executor);
  await officialManager(fetcher);
  const snapshot = await readCodeVersionSnapshot(client, admission);
  const result = evaluateCodeVersionPlan({
    admission,
    expectedCodeHash: options.expectedCodeHash,
    nowSeconds: Math.floor(Date.now() / 1000),
    ...snapshot,
  });
  if (result.status !== "ready") throw new Error("FCC code-version plan failed closed");
  return { admission, snapshot, result, client };
}

async function git(args) {
  const result = await execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  return result.stdout.trim();
}

async function cleanSourceCommit() {
  const commit = await git(["rev-parse", "HEAD"]);
  const status = await git(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (!/^[0-9a-f]{40}$/.test(commit) || status !== "") throw new Error("FCC code-version broadcast requires a clean committed worktree");
  return commit;
}

function loadAccount() {
  try {
    process.loadEnvFile(resolve(root, ".env.local"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const configured = process.env.PAYGUARD_DEPLOYER_ADDRESS;
  const key = process.env.PAYGUARD_DEPLOYER_PRIVATE_KEY;
  if (!isAddress(configured ?? "") || !/^0x[0-9a-fA-F]{64}$/.test(key ?? "")) {
    throw new Error("dedicated PayGuard deployer configuration is missing or malformed");
  }
  const account = privateKeyToAccount(key);
  if (account.address !== getAddress(configured) || account.address !== PAYGUARD_EXTENSION_OWNER) {
    throw new Error("configured signer is not the verified PayGuard extension owner");
  }
  return account;
}

function sameAdmissionIdentity(first, second) {
  for (const key of ["teeId", "proxyId", "machineId", "keyFingerprint", "codeHash", "platform", "governanceHash"]) {
    if (first[key] !== second[key]) return false;
  }
  return true;
}

function exactVersionEvent(event, admission) {
  return event.address?.toLowerCase() === FCC_TEE_MANAGER.toLowerCase()
    && event.args?.extensionId === PAYGUARD_EXTENSION_ID
    && event.args?.codeHash?.toLowerCase() === admission.codeHash
    && event.args?.version?.toLowerCase() === PAYGUARD_TEE_VERSION_BYTES32.toLowerCase()
    && event.args?.platforms?.length === 1
    && event.args.platforms[0].toLowerCase() === admission.platform;
}

async function resolveVersionEvent(client, admission, receipt) {
  let events;
  if (receipt) {
    events = parseEventLogs({
      abi: teeManagerRegistrationAbi,
      logs: receipt.logs,
      eventName: "TeeVersionAdded",
      strict: true,
    });
  } else {
    events = await client.getContractEvents({
      address: FCC_TEE_MANAGER,
      abi: teeManagerRegistrationAbi,
      eventName: "TeeVersionAdded",
      args: { extensionId: PAYGUARD_EXTENSION_ID, codeHash: admission.codeHash },
      fromBlock: registrationBlock,
      toBlock: "latest",
      strict: true,
    });
  }
  const exact = events.filter((event) => exactVersionEvent(event, admission));
  if (exact.length !== 1) throw new Error("expected exactly one matching TeeVersionAdded event");
  return exact[0];
}

export function buildCodeVersionEvidence({ sourceCommit, officialSourceVerified, admission, snapshot, event, transaction, receipt }) {
  const plan = evaluateCodeVersionPlan({
    admission,
    expectedCodeHash: admission.codeHash,
    nowSeconds: admission.teeTimestamp,
    ...snapshot,
  });
  if (
    !/^[0-9a-f]{40}$/.test(sourceCommit) || officialSourceVerified !== true
      || plan.status !== "ready" || plan.action !== "already-supported" || !exactVersionEvent(event, admission)
      || snapshot.blockNumber < event.blockNumber + 1n
  ) throw new Error("code-version evidence input mismatch");
  if (
    receipt.status !== "success" || receipt.transactionHash !== event.transactionHash
      || transaction.hash !== event.transactionHash || getAddress(transaction.from) !== PAYGUARD_EXTENSION_OWNER
      || getAddress(transaction.to) !== FCC_TEE_MANAGER
  ) throw new Error("code-version transaction evidence mismatch");
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-fcc-code-version-allowance",
    status: "code-version-allowed-production-machine-unregistered",
    recordedAt: new Date().toISOString(),
    network: { name: "flare-coston2", chainId: COSTON2_CHAIN_ID, observedBlock: String(snapshot.blockNumber) },
    publicIdentifiers: {
      verificationSourceCommit: sourceCommit,
      manager: FCC_TEE_MANAGER,
      extensionId: PAYGUARD_EXTENSION_ID.toString(),
      version: PAYGUARD_TEE_VERSION,
      versionBytes32: PAYGUARD_TEE_VERSION_BYTES32.toLowerCase(),
      codeHash: admission.codeHash,
      platform: admission.platform,
      candidateTeeId: admission.teeId,
      candidateProxyId: admission.proxyId,
      candidateMachineId: admission.machineId,
      candidateKeyFingerprint: admission.keyFingerprint,
      governanceHash: admission.governanceHash,
      transactionHash: event.transactionHash,
      blockNumber: String(event.blockNumber),
    },
    assertions: {
      ...plan.assertions,
      officialManagerVerified: true,
      productionAdmissionReverified: true,
      exactVersionEventVerified: true,
      transactionSenderVerified: true,
      transactionReceiptSuccessful: true,
      codeHashPlatformReadbackVerified: true,
      twoConfirmationsObserved: true,
      testnetOnly: true,
      noPrivateKeyRecorded: true,
      noMachineRegistrationClaimed: true,
      noFccResultClaimed: true,
    },
    blockers: ["PRODUCTION_MACHINE_NOT_REGISTERED", "LIVE_FCC_FOUNDATION_RESULT_NOT_VERIFIED"],
    notes: [
      "This proves only the production-attested code-hash/platform allowance for the registered PayGuard extension.",
      "Candidate machine identifiers are not machine-registration, availability, custody, evaluation, or payment evidence.",
    ],
  };
}

async function saveEvidence(value) {
  await mkdir(dirname(evidencePath), { recursive: true });
  const temporary = `${evidencePath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
  await chmod(temporary, 0o644);
  await rename(temporary, evidencePath);
  await chmod(evidencePath, 0o644);
}

async function deploy(options) {
  if (process.versions.node !== "24.19.0") throw new Error("FCC code-version broadcast requires pinned Node 24.19.0");
  const sourceCommit = await cleanSourceCommit();
  const account = loadAccount();
  let operational = await createOperationalPlan(options);
  let receipt;
  if (operational.result.action === "add-version") {
    const [gas, gasPrice, balance] = await Promise.all([
      operational.client.estimateContractGas({
        account: account.address,
        address: FCC_TEE_MANAGER,
        abi: teeManagerRegistrationAbi,
        functionName: "addTeeVersion",
        args: [PAYGUARD_EXTENSION_ID, PAYGUARD_TEE_VERSION_BYTES32, operational.admission.codeHash, [operational.admission.platform]],
      }),
      operational.client.getGasPrice(),
      operational.client.getBalance({ address: account.address }),
    ]);
    const estimated = gas * gasPrice * 5n;
    if (balance < (estimated > minimumGasBalance ? estimated : minimumGasBalance)) throw new Error("PayGuard deployer lacks the conservative code-version gas buffer");
    const simulation = await operational.client.simulateContract({
      account: account.address,
      address: FCC_TEE_MANAGER,
      abi: teeManagerRegistrationAbi,
      functionName: "addTeeVersion",
      args: [PAYGUARD_EXTENSION_ID, PAYGUARD_TEE_VERSION_BYTES32, operational.admission.codeHash, [operational.admission.platform]],
    });
    if (await cleanSourceCommit() !== sourceCommit) throw new Error("source commit changed during FCC code-version preflight");
    const wallet = createWalletClient({ account, chain: coston2, transport: http(COSTON2_RPC_URL, { timeout: 15_000 }) });
    const transactionHash = await wallet.writeContract({ ...simulation.request, account, chain: coston2 });
    receipt = await operational.client.waitForTransactionReceipt({ hash: transactionHash, confirmations: 2, timeout: 180_000 });
    if (receipt.status !== "success") throw new Error("FCC code-version transaction reverted");
  }
  const freshAdmission = await runMachineAdmission(options);
  if (!sameAdmissionIdentity(operational.admission, freshAdmission)) throw new Error("machine identity changed during code-version allowance");
  const snapshot = await readCodeVersionSnapshot(operational.client, freshAdmission);
  const verified = evaluateCodeVersionPlan({
    admission: freshAdmission,
    expectedCodeHash: options.expectedCodeHash,
    nowSeconds: Math.floor(Date.now() / 1000),
    ...snapshot,
  });
  if (verified.status !== "ready" || verified.action !== "already-supported") throw new Error("code-version allowance readback failed");
  const event = await resolveVersionEvent(operational.client, freshAdmission, receipt);
  const transactionHash = event.transactionHash ?? receipt?.transactionHash;
  const [transaction, finalReceipt] = await Promise.all([
    operational.client.getTransaction({ hash: transactionHash }),
    receipt ? Promise.resolve(receipt) : operational.client.getTransactionReceipt({ hash: transactionHash }),
  ]);
  if (await cleanSourceCommit() !== sourceCommit) throw new Error("source commit changed during FCC code-version verification");
  const evidence = buildCodeVersionEvidence({
    sourceCommit,
    officialSourceVerified: true,
    admission: freshAdmission,
    snapshot,
    event: { ...event, transactionHash },
    transaction,
    receipt: finalReceipt,
  });
  await saveEvidence(evidence);
  return evidence;
}

async function main() {
  const options = parseCodeVersionCLI(process.argv.slice(2));
  if (options.mode === "deploy") {
    console.log(JSON.stringify(await deploy(options)));
    return;
  }
  const operational = await createOperationalPlan(options);
  if (options.mode === "verify" && operational.result.action !== "already-supported") {
    throw new Error("FCC code version is not allowed on-chain");
  }
  console.log(JSON.stringify({
    ...operational.result,
    network: { name: "flare-coston2", chainId: COSTON2_CHAIN_ID, observedBlock: String(operational.snapshot.blockNumber) },
    note: options.mode === "plan" ? "Read-only plan; no transaction was signed or broadcast." : "Live readback only; no transaction was signed or broadcast.",
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`FCC code-version command failed: ${error.message}`);
    process.exitCode = 1;
  });
}
