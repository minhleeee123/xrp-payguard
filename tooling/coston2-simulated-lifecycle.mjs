import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const DEFAULT_RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";
const DEPLOYMENT_EVIDENCE = resolve(root, "evidence/coston2/contracts-deployment.json");
export const SIMULATED_LIFECYCLE_EVIDENCE = resolve(
  root,
  "evidence/simulation/coston2-simulated-policy-lifecycle-2026-08-09.json",
);
const ARTIFACTS = {
  registry: resolve(root, "packages/contracts/out/PayGuardPolicyRegistry.sol/PayGuardPolicyRegistry.json"),
  vault: resolve(root, "packages/contracts/out/PayGuardVault.sol/PayGuardVault.json"),
  router: resolve(root, "packages/contracts/out/PayGuardActionRouter.sol/PayGuardActionRouter.json"),
};
const CHAIN_ID = 114;
const AMOUNT = 10_000n;
const CAP = 15_000n;
export const SIMULATED_SCHEDULE_INTERVAL_SECONDS = 30n;
export const SIMULATED_SCHEDULE_GRACE_SECONDS = 29n;
const MIN_NATIVE_BALANCE = 1_000_000_000_000_000_000n;
const FORBIDDEN_EVIDENCE_FIELD = /^(?:privateKey|private_key|secret|seed|ciphertext|policyPlaintext|credential|password|mnemonic|signature)$/iu;

export const coston2 = {
  id: CHAIN_ID,
  name: "Flare Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [DEFAULT_RPC_URL] } },
};

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function address(value, label) {
  if (!isAddress(value ?? "") || value === zeroAddress) throw new Error(`${label} must be a non-zero address`);
  return getAddress(value);
}

function bytes32(value, label) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value ?? "")) throw new Error(`${label} must be bytes32`);
  return value.toLowerCase();
}

function inspectPublic(value, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => inspectPublic(child, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_EVIDENCE_FIELD.test(key) && key !== "noPrivateKeyRecorded") {
      throw new Error(`${path} contains forbidden field ${key}`);
    }
    inspectPublic(child, `${path}.${key}`);
  }
}

export function parseSimulatedLifecycleCLI(argv) {
  if (argv.some((value) => /private|secret|seed|mnemonic|credential/i.test(value))) {
    throw new Error("credentials are accepted only through the local environment");
  }
  const mode = argv[0] ?? "plan";
  if (mode !== "plan" && mode !== "run") throw new Error(`unknown simulated lifecycle mode: ${mode}`);
  const broadcast = argv.includes("--broadcast");
  const confirmed = argv.includes("--confirm-simulated-tee-onchain");
  if (mode === "run" && (!broadcast || !confirmed)) {
    throw new Error("run requires --broadcast and --confirm-simulated-tee-onchain");
  }
  if (mode === "plan" && (broadcast || confirmed)) throw new Error("plan is read-only");
  const allowed = new Set([mode, "--broadcast", "--confirm-simulated-tee-onchain"]);
  for (const value of argv) if (!allowed.has(value)) throw new Error(`unknown argument: ${value}`);
  return { mode, broadcast, confirmed };
}

export async function compileProtocolRuntime(executor = execFileAsync) {
  const cache = resolve(root, ".cache");
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(join(cache, "payguard-protocol-runtime-"));
  const compiler = resolve(root, "node_modules/.bin/tsc");
  try {
    await executor(compiler, [
      "-p",
      resolve(root, "packages/protocol/tsconfig.runtime.json"),
      "--outDir",
      directory,
    ], { cwd: root, encoding: "utf8", timeout: 30_000 });
    const cacheBust = `?v=${Date.now()}`;
    const [codec, evaluator, constants, schedule] = await Promise.all([
      import(`${pathToFileURL(resolve(directory, "codec.js")).href}${cacheBust}`),
      import(`${pathToFileURL(resolve(directory, "evaluator.js")).href}${cacheBust}`),
      import(`${pathToFileURL(resolve(directory, "constants.js")).href}${cacheBust}`),
      import(`${pathToFileURL(resolve(directory, "schedule.js")).href}${cacheBust}`),
    ]);
    const runtime = { ...constants, ...codec, ...evaluator, ...schedule };
    for (const name of [
      "policyCommitment",
      "genesisSpendCheckpoint",
      "policyReceiptAttestationDigest",
      "evaluationAttestationDigest",
      "evaluatePolicy",
      "publicReasonCode",
    ]) {
      if (typeof runtime[name] !== "function") throw new Error(`compiled protocol runtime is missing ${name}`);
    }
    return { runtime, cleanup: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function json(path, label) {
  return record(JSON.parse(await readFile(path, "utf8")), label);
}

async function loadContext() {
  const deployment = await json(DEPLOYMENT_EVIDENCE, "deployment evidence");
  if (deployment.network?.name !== "flare-coston2" || deployment.network?.chainId !== CHAIN_ID) {
    throw new Error("deployment evidence is not Coston2");
  }
  const assertions = record(deployment.assertions, "deployment assertions");
  for (const required of [
    "chainIdVerified",
    "sourceCommitCleanAtBroadcast",
    "runtimeCodeVerified",
    "constructorBindingsVerified",
    "vaultRouterVerified",
    "supportedAssetVerified",
  ]) if (assertions[required] !== true) throw new Error(`deployment evidence is missing ${required}`);
  const identifiers = record(deployment.publicIdentifiers, "deployment identifiers");
  const contracts = record(identifiers.contracts, "deployment contracts");
  return {
    owner: address(identifiers.deployer, "deployment owner"),
    registry: address(contracts.registry?.address, "policy registry"),
    vault: address(contracts.vault?.address, "vault"),
    router: address(contracts.router?.address, "router"),
    asset: address(identifiers.fTestXrp, "FTestXRP"),
    deploymentSourceCommit: identifiers.sourceCommit,
  };
}

async function loadAbis() {
  return Object.fromEntries(await Promise.all(Object.entries(ARTIFACTS).map(async ([name, path]) => {
    const artifact = await json(path, `${name} artifact`);
    if (!Array.isArray(artifact.abi)) throw new Error(`${name} artifact ABI is missing`);
    return [name, artifact.abi];
  })));
}

function normalizeAccounting(value) {
  const entry = Array.isArray(value) ? value : [
    value.deposited,
    value.available,
    value.reserved,
    value.spent,
    value.withdrawn,
    value.refunded,
  ];
  if (entry.length !== 6 || entry.some((item) => typeof item !== "bigint")) throw new Error("invalid vault accounting tuple");
  return {
    deposited: entry[0],
    available: entry[1],
    reserved: entry[2],
    spent: entry[3],
    withdrawn: entry[4],
    refunded: entry[5],
  };
}

function publicAccounting(value) {
  return Object.fromEntries(Object.entries(value).map(([key, amount]) => [key, amount.toString()]));
}

function hash(label, nonce) {
  return keccak256(encodePacked(["string", "bytes32"], [label, nonce]));
}

function randomHash() {
  return `0x${randomBytes(32).toString("hex")}`;
}

function machineDescriptors(accounts, runNonce) {
  return accounts.map((account, index) => ({
    account,
    signer: getAddress(account.address),
    machineId: keccak256(encodePacked(["string", "uint8", "address", "bytes32"], [
      "PAYGUARD_SIMULATED_TEE_ONCHAIN_MACHINE_V1",
      index,
      account.address,
      runNonce,
    ])),
    keyFingerprint: keccak256(encodePacked(["string", "address", "bytes32"], [
      "PAYGUARD_SIMULATED_TEE_ONCHAIN_KEY_V1",
      account.address,
      runNonce,
    ])),
  }));
}

function contractBinding(binding) {
  return { ...binding };
}

function contractRequest(request) {
  return { ...request };
}

function contractResult(result, runtime) {
  return {
    request: contractRequest(result.request),
    decision: result.decision === "ALLOW" ? 1 : 0,
    publicReasonClass: runtime.publicReasonCode(result.publicReasonClass),
    reservedAmount: result.reservedAmount,
    resultingCheckpoint: result.resultingCheckpoint,
    resultNonce: result.resultNonce,
    attempt: result.attempt,
    issuedAt: result.issuedAt,
    expiry: result.expiry,
    machineId: result.machineId,
    keyFingerprint: result.keyFingerprint,
  };
}

function lifecyclePolicy(runtime, context, startAt, runNonce, submissionNonce) {
  return {
    schemaVersion: 1,
    chainId: BigInt(CHAIN_ID),
    registry: context.registry,
    vault: context.vault,
    router: context.router,
    owner: context.owner,
    policyId: hash("PAYGUARD_SIMULATED_TEE_ONCHAIN_POLICY_ID_V1", runNonce),
    policyVersion: 1,
    asset: context.asset,
    referenceCurrency: keccak256(stringToHex("USD")),
    maxPerAction: AMOUNT,
    dailyCap: CAP,
    rollingCap: CAP,
    rollingWindowSeconds: 86_400n,
    startAt,
    endAt: startAt + 3_600n,
    scheduleIntervalSeconds: SIMULATED_SCHEDULE_INTERVAL_SECONDS,
    scheduleGraceSeconds: SIMULATED_SCHEDULE_GRACE_SECONDS,
    cooldownSeconds: 0n,
    maxOccurrences: 5,
    allowTargets: [context.owner],
    denyTargets: [],
    allowRequesters: [],
    allowActionTypes: [runtime.ACTION_FTESTXRP_TRANSFER],
    requireFtso: false,
    ftsoFeedId: runtime.ZERO_BYTES32,
    maxPriceAgeSeconds: 0n,
    privateSalt: hash("PAYGUARD_SIMULATED_TEE_ONCHAIN_PRIVATE_SALT_V1", runNonce),
    submissionNonce,
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

function actionRequest(runtime, context, policy, commitment, {
  requestId,
  requestNonce,
  occurrence,
  spendCheckpoint,
  balanceCheckpoint: checkpoint,
  createdAt,
}) {
  const scheduleSlot = policy.startAt + BigInt(occurrence - 1) * policy.scheduleIntervalSeconds;
  const deadline = scheduleSlot + policy.scheduleGraceSeconds;
  return {
    chainId: BigInt(CHAIN_ID),
    registry: context.registry,
    vault: context.vault,
    router: context.router,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyCommitment: commitment,
    requestId,
    requestNonce,
    attempt: 0,
    requester: context.owner,
    target: context.owner,
    asset: context.asset,
    actionType: runtime.ACTION_FTESTXRP_TRANSFER,
    amount: AMOUNT,
    scheduleSlot,
    occurrence,
    spendCheckpoint,
    balanceCheckpoint: checkpoint,
    inputCommitment: runtime.ZERO_BYTES32,
    createdAt,
    graceDeadline: deadline,
    expiry: deadline,
  };
}

async function sourceState() {
  const [{ stdout: head }, { stdout: status }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }),
    execFileAsync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root, encoding: "utf8" }),
  ]);
  if (status.trim() !== "") throw new Error("broadcast requires a clean source tree");
  return head.trim();
}

async function chainTimestamp(client) {
  return (await client.getBlock({ blockTag: "latest" })).timestamp;
}

async function waitForChainTimestamp(client, target, { timeoutMs = 120_000, pollMs = 1_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const timestamp = await chainTimestamp(client);
    if (timestamp >= target) return timestamp;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, pollMs));
  }
  throw new Error("timed out waiting for the recurring schedule slot");
}

async function writeStep({ client, wallet, account, address: contractAddress, abi, functionName, args, eventName }) {
  const { request } = await client.simulateContract({
    account,
    address: contractAddress,
    abi,
    functionName,
    args,
  });
  const transactionHash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: transactionHash, confirmations: 1, timeout: 120_000 });
  if (receipt.status !== "success" || getAddress(receipt.from) !== getAddress(account.address)
    || getAddress(receipt.to) !== getAddress(contractAddress)) throw new Error(`${functionName} receipt mismatch`);
  const events = parseEventLogs({ abi, logs: receipt.logs, eventName, strict: true });
  if (events.length !== 1) throw new Error(`${functionName} expected one ${eventName} event`);
  return {
    transactionHash,
    blockNumber: receipt.blockNumber.toString(),
    receiptStatus: receipt.status,
    eventName,
    eventVerified: true,
  };
}

async function expectCreateRejected(client, context, abi, account, request, label) {
  try {
    await client.simulateContract({
      account,
      address: context.router,
      abi,
      functionName: "createRequest",
      args: [contractRequest(request)],
    });
  } catch {
    return true;
  }
  throw new Error(`${label} request did not fail closed`);
}

async function readSnapshot(client, context, abis) {
  const [chainId, blockNumber, ownerNative, registryAdmin, vaultAdmin, vaultRouter, supported, accounting] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getBalance({ address: context.owner }),
    client.readContract({ address: context.registry, abi: abis.registry, functionName: "admin" }),
    client.readContract({ address: context.vault, abi: abis.vault, functionName: "admin" }),
    client.readContract({ address: context.vault, abi: abis.vault, functionName: "router" }),
    client.readContract({ address: context.vault, abi: abis.vault, functionName: "supportedAsset", args: [context.asset] }),
    client.readContract({ address: context.vault, abi: abis.vault, functionName: "accounting", args: [context.owner, context.asset] }),
  ]);
  if (chainId !== CHAIN_ID) throw new Error("RPC returned the wrong chain");
  if (getAddress(registryAdmin) !== context.owner || getAddress(vaultAdmin) !== context.owner) throw new Error("deployment admin drifted");
  if (getAddress(vaultRouter) !== context.router || supported !== true) throw new Error("deployment wiring drifted");
  const normalized = normalizeAccounting(accounting);
  if (normalized.available < AMOUNT || normalized.reserved !== 0n) throw new Error("vault is not ready for the bounded lifecycle");
  if (ownerNative < MIN_NATIVE_BALANCE) throw new Error("deployer has insufficient C2FLR for the bounded lifecycle");
  return { blockNumber, ownerNative, accounting: normalized };
}

function configuredAccount() {
  const value = process.env.PAYGUARD_DEPLOYER_PRIVATE_KEY;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value ?? "")) throw new Error("PAYGUARD_DEPLOYER_PRIVATE_KEY is missing or malformed");
  const account = privateKeyToAccount(value);
  const expected = process.env.PAYGUARD_DEPLOYER_ADDRESS;
  if (expected && (!isAddress(expected) || getAddress(expected) !== getAddress(account.address))) {
    throw new Error("configured deployer address does not match the local key");
  }
  return account;
}

export function buildSimulatedLifecycleEvidence(observation) {
  const value = record(observation, "simulated lifecycle observation");
  if (value.chainId !== CHAIN_ID || value.mode !== "SIMULATED_TEE_ONCHAIN" || value.transactionCount < 1) {
    throw new Error("invalid simulated lifecycle observation");
  }
  const evidence = {
    schemaVersion: 1,
    suite: "payguard-coston2-simulated-tee-policy-lifecycle",
    status: "coston2-simulated-pass",
    recordedAt: value.recordedAt,
    sourceCommit: value.sourceCommit,
    mode: value.mode,
    network: {
      name: "flare-coston2",
      chainId: CHAIN_ID,
      publicChainConnected: true,
      observedBlock: value.observedBlock,
    },
    publicIdentifiers: value.publicIdentifiers,
    lifecycle: value.lifecycle,
    accounting: value.accounting,
    assertions: {
      simulationOnly: true,
      hardwareTeeVerified: false,
      registeredMachinesVerified: false,
      stableHttpsOriginsVerified: false,
      authenticatedIndexerVerified: false,
      payGuardLocalMachineEntriesVerified: true,
      onChainTransactionsVerified: true,
      threeSimulatedCustodyReceiptsVerified: true,
      twoMatchingAllowEvaluationsVerified: true,
      capDenialVerified: true,
      emergencyStopVerified: true,
      resumeVerified: true,
      revokeVerified: true,
      conservationVerified: true,
      sourceCommitCleanAtBroadcast: true,
      testnetOnly: true,
      noPrivateKeyRecorded: true,
      noCredentialRecorded: true,
      noPolicyPlaintextOrCiphertextRecorded: true,
      noLiveFccResultClaimed: true,
      noPayGuardReleaseClaimed: true,
    },
    blockers: [
      "HARDWARE_TEE_NOT_PRESENT",
      "STABLE_HTTPS_FCC_ORIGINS_NOT_DEPLOYED",
      "AUTHENTICATED_FCC_INDEXER_NOT_CONFIGURED",
      "OFFICIAL_FCC_MACHINES_NOT_REGISTERED",
      "LIVE_PRIVATE_POLICY_LIFECYCLE_NOT_VERIFIED",
    ],
    notes: [
      "This is a real Coston2 contract lifecycle driven by three ephemeral in-memory simulated signers; it is not a live FCC lifecycle.",
      "Machine entries exist only in PayGuardPolicyRegistry for this demonstration and do not prove registration in the official FCC machine manager.",
      "The in-memory private policy and all private keys were discarded; evidence contains only public commitments, identities, transaction identifiers, blocks, amounts, states, and assertion booleans.",
      "The lifecycle proves the solution-3 contract path for one recurring allow, deterministic cap denial, stop, resume, revoke, and vault conservation without upgrading any hardware confidentiality or release claim.",
    ],
  };
  inspectPublic(evidence);
  return evidence;
}

export async function planSimulatedLifecycle({ rpcUrl = DEFAULT_RPC_URL } = {}) {
  const [context, abis] = await Promise.all([loadContext(), loadAbis()]);
  const client = createPublicClient({ chain: coston2, transport: http(rpcUrl) });
  const snapshot = await readSnapshot(client, context, abis);
  const probe = randomHash();
  await client.simulateContract({
    account: context.owner,
    address: context.registry,
    abi: abis.registry,
    functionName: "registerMachine",
    args: [hash("PAYGUARD_SIMULATED_TEE_ONCHAIN_PLAN_MACHINE_V1", probe),
      hash("PAYGUARD_SIMULATED_TEE_ONCHAIN_PLAN_KEY_V1", probe), context.owner],
  });
  return {
    mode: "SIMULATED_TEE_ONCHAIN",
    broadcast: false,
    chainId: CHAIN_ID,
    owner: context.owner,
    contracts: { registry: context.registry, vault: context.vault, router: context.router },
    asset: context.asset,
    availableUBA: snapshot.accounting.available.toString(),
    boundedTransferUBA: AMOUNT.toString(),
    firstWriteSimulationVerified: true,
    sourceMustBeClean: true,
    hardwareTeeVerified: false,
    officialFccMachinesVerified: false,
  };
}

export async function runSimulatedLifecycle({ rpcUrl = DEFAULT_RPC_URL } = {}) {
  const sourceCommit = await sourceState();
  const account = configuredAccount();
  const [context, abis, compiled] = await Promise.all([loadContext(), loadAbis(), compileProtocolRuntime()]);
  try {
    if (getAddress(account.address) !== context.owner) throw new Error("lifecycle account is not the deployment owner");
    const client = createPublicClient({ chain: coston2, transport: http(rpcUrl) });
    const wallet = createWalletClient({ account, chain: coston2, transport: http(rpcUrl) });
    const before = await readSnapshot(client, context, abis);
    const runtime = compiled.runtime;
    const runNonce = randomHash();
    const submissionNonce = randomHash();
    const machines = machineDescriptors(Array.from({ length: 3 }, () => privateKeyToAccount(generatePrivateKey())), runNonce);
    const startAt = await chainTimestamp(client) + 10n;
    const policy = lifecyclePolicy(runtime, context, startAt, runNonce, submissionNonce);
    const commitment = runtime.policyCommitment(policy);
    const policyNonce = BigInt(`0x${runNonce.slice(2, 18)}`) || 1n;
    const binding = {
      chainId: BigInt(CHAIN_ID),
      registry: context.registry,
      vault: context.vault,
      router: context.router,
      owner: context.owner,
      policyId: policy.policyId,
      policyVersion: 1,
      policyCommitment: commitment,
      schema: runtime.POLICY_SCHEMA_V1,
      extensionId: hash("PAYGUARD_SIMULATED_TEE_ONCHAIN_EXTENSION_V1", runNonce),
      codeVersion: hash("PAYGUARD_SIMULATED_TEE_ONCHAIN_CODE_V1", runNonce),
      machineIds: machines.map((machine) => machine.machineId),
      keyFingerprints: machines.map((machine) => machine.keyFingerprint),
      custodyThreshold: 3,
      resultThreshold: 2,
      policyNonce,
    };
    const receiptIssuedAt = await chainTimestamp(client);
    const receiptExpiry = receiptIssuedAt + 14_400n;
    const receipts = await Promise.all(machines.map(async (machine) => {
      const body = {
        binding,
        machineId: machine.machineId,
        keyFingerprint: machine.keyFingerprint,
        submissionNonce,
        receiptNonce: policyNonce,
        issuedAt: receiptIssuedAt,
        expiry: receiptExpiry,
      };
      const signature = await machine.account.signMessage({ message: { raw: runtime.policyReceiptAttestationDigest(body) } });
      return {
        machineId: body.machineId,
        keyFingerprint: body.keyFingerprint,
        submissionNonce: body.submissionNonce,
        receiptNonce: body.receiptNonce,
        issuedAt: body.issuedAt,
        expiry: body.expiry,
        signature,
      };
    }));

    const machineTransactions = [];
    for (const machine of machines) {
      machineTransactions.push(await writeStep({
        client,
        wallet,
        account,
        address: context.registry,
        abi: abis.registry,
        functionName: "registerMachine",
        args: [machine.machineId, machine.keyFingerprint, machine.signer],
        eventName: "MachineRegistered",
      }));
      const registered = await client.readContract({
        address: context.registry,
        abi: abis.registry,
        functionName: "machine",
        args: [machine.machineId],
      });
      if (getAddress(registered[0]) !== machine.signer
        || bytes32(registered[1], "registered key fingerprint") !== machine.keyFingerprint
        || registered[2] !== true) throw new Error("simulated machine readback mismatch");
    }
    const policyTransaction = await writeStep({
      client,
      wallet,
      account,
      address: context.registry,
      abi: abis.registry,
      functionName: "registerPolicy",
      args: [contractBinding(binding), receipts],
      eventName: "PolicyRegistered",
    });
    if (await client.readContract({ address: context.registry, abi: abis.registry,
      functionName: "policyStatus", args: [commitment] }) !== 1) throw new Error("policy registration readback mismatch");

    const firstBlock = await client.getBlockNumber();
    const firstCreatedAt = await waitForChainTimestamp(client, policy.startAt);
    const firstRequest = actionRequest(runtime, context, policy, commitment, {
      requestId: hash("PAYGUARD_SIMULATED_TEE_ONCHAIN_ALLOW_REQUEST_V1", runNonce),
      requestNonce: BigInt(`0x${runNonce.slice(18, 34)}`) || 1n,
      occurrence: 1,
      spendCheckpoint: runtime.genesisSpendCheckpoint(commitment),
      balanceCheckpoint: balanceCheckpoint(context, before.accounting, firstBlock),
      createdAt: firstCreatedAt,
    });
    const firstState = {
      availableBalance: before.accounting.available,
      history: [],
      occurrenceCount: 0,
      lastAccountingAt: 0n,
      spendCheckpoint: firstRequest.spendCheckpoint,
      balanceCheckpoint: firstRequest.balanceCheckpoint,
      now: firstCreatedAt,
    };
    const firstBase = runtime.evaluatePolicy(policy, firstRequest, firstState);
    if (firstBase.decision !== "ALLOW" || firstBase.publicReasonClass !== "OK") throw new Error("canonical first evaluation did not allow");
    const allowResults = machines.slice(0, 2).map((machine) => ({
      ...firstBase,
      machineId: machine.machineId,
      keyFingerprint: machine.keyFingerprint,
    }));
    const allowSignatures = await Promise.all(allowResults.map((result, index) => machines[index].account.signMessage({
      message: { raw: runtime.evaluationAttestationDigest(result) },
    })));
    const firstRequestTransaction = await writeStep({ client, wallet, account, address: context.router, abi: abis.router,
      functionName: "createRequest", args: [contractRequest(firstRequest)], eventName: "RequestCreated" });
    const allowEvaluationTransactions = [];
    for (let index = 0; index < 2; index += 1) {
      allowEvaluationTransactions.push(await writeStep({ client, wallet, account, address: context.router, abi: abis.router,
        functionName: "submitEvaluation", args: [contractResult(allowResults[index], runtime), allowSignatures[index]], eventName: "EvaluationAccepted" }));
    }
    const executeTransaction = await writeStep({ client, wallet, account, address: context.router, abi: abis.router,
      functionName: "execute", args: [firstRequest.requestId], eventName: "RequestExecuted" });
    const executedRequest = await client.readContract({ address: context.router, abi: abis.router,
      functionName: "getRequest", args: [firstRequest.requestId] });
    if (executedRequest.status !== 4) throw new Error("allow request did not finish executed");
    const afterAllow = normalizeAccounting(await client.readContract({
      address: context.vault,
      abi: abis.vault,
      functionName: "accounting",
      args: [context.owner, context.asset],
    }));

    const secondBlock = await client.getBlockNumber();
    const secondCreatedAt = await waitForChainTimestamp(
      client,
      policy.startAt + SIMULATED_SCHEDULE_INTERVAL_SECONDS,
    );
    const secondRequest = actionRequest(runtime, context, policy, commitment, {
      requestId: hash("PAYGUARD_SIMULATED_TEE_ONCHAIN_DENY_REQUEST_V1", runNonce),
      requestNonce: BigInt(`0x${runNonce.slice(34, 50)}`) || 2n,
      occurrence: 2,
      spendCheckpoint: firstBase.resultingCheckpoint,
      balanceCheckpoint: balanceCheckpoint(context, afterAllow, secondBlock),
      createdAt: secondCreatedAt,
    });
    const secondState = {
      availableBalance: afterAllow.available,
      history: [{ request: firstRequest, accountedAt: firstBase.issuedAt }],
      occurrenceCount: 1,
      lastAccountingAt: firstBase.issuedAt,
      spendCheckpoint: firstBase.resultingCheckpoint,
      balanceCheckpoint: secondRequest.balanceCheckpoint,
      now: secondCreatedAt,
    };
    const secondBase = runtime.evaluatePolicy(policy, secondRequest, secondState);
    if (secondBase.decision !== "DENY" || secondBase.publicReasonClass !== "CAP_EXCEEDED") {
      throw new Error("canonical second evaluation did not produce cap denial");
    }
    const denyResults = machines.slice(0, 2).map((machine) => ({
      ...secondBase,
      machineId: machine.machineId,
      keyFingerprint: machine.keyFingerprint,
    }));
    const denySignatures = await Promise.all(denyResults.map((result, index) => machines[index].account.signMessage({
      message: { raw: runtime.evaluationAttestationDigest(result) },
    })));
    const secondRequestTransaction = await writeStep({ client, wallet, account, address: context.router, abi: abis.router,
      functionName: "createRequest", args: [contractRequest(secondRequest)], eventName: "RequestCreated" });
    const denyEvaluationTransactions = [];
    for (let index = 0; index < 2; index += 1) {
      denyEvaluationTransactions.push(await writeStep({ client, wallet, account, address: context.router, abi: abis.router,
        functionName: "submitEvaluation", args: [contractResult(denyResults[index], runtime), denySignatures[index]], eventName: "EvaluationAccepted" }));
    }
    const deniedRequest = await client.readContract({ address: context.router, abi: abis.router,
      functionName: "getRequest", args: [secondRequest.requestId] });
    if (deniedRequest.status !== 3) throw new Error("cap request did not finish denied");
    const afterDeny = normalizeAccounting(await client.readContract({
      address: context.vault,
      abi: abis.vault,
      functionName: "accounting",
      args: [context.owner, context.asset],
    }));
    const stoppedRequest = { ...secondRequest, requestId: hash("PAYGUARD_STOPPED_PROBE_V1", runNonce), requestNonce: secondRequest.requestNonce + 1n };
    const revokedRequest = { ...secondRequest, requestId: hash("PAYGUARD_REVOKED_PROBE_V1", runNonce), requestNonce: secondRequest.requestNonce + 2n };
    const stopTransaction = await writeStep({ client, wallet, account, address: context.registry, abi: abis.registry,
      functionName: "stopPolicy", args: [commitment], eventName: "PolicyStopped" });
    if (await client.readContract({ address: context.registry, abi: abis.registry,
      functionName: "policyStatus", args: [commitment] }) !== 2) throw new Error("policy stop readback mismatch");
    const stoppedRequestRejected = await expectCreateRejected(client, context, abis.router, account, stoppedRequest, "stopped policy");
    const resumeTransaction = await writeStep({ client, wallet, account, address: context.registry, abi: abis.registry,
      functionName: "resumePolicy", args: [commitment], eventName: "PolicyResumed" });
    if (await client.readContract({ address: context.registry, abi: abis.registry,
      functionName: "policyStatus", args: [commitment] }) !== 1) throw new Error("policy resume readback mismatch");
    const revokeTransaction = await writeStep({ client, wallet, account, address: context.registry, abi: abis.registry,
      functionName: "revokePolicy", args: [commitment], eventName: "PolicyRevoked" });
    const revokedRequestRejected = await expectCreateRejected(client, context, abis.router, account, revokedRequest, "revoked policy");
    const finalStatus = await client.readContract({ address: context.registry, abi: abis.registry, functionName: "policyStatus", args: [commitment] });
    if (finalStatus !== 3) throw new Error("policy did not finish revoked");
    if (afterAllow.deposited !== before.accounting.deposited || afterAllow.available !== before.accounting.available - AMOUNT
      || afterAllow.reserved !== 0n || afterAllow.spent !== before.accounting.spent + AMOUNT
      || JSON.stringify(publicAccounting(afterAllow)) !== JSON.stringify(publicAccounting(afterDeny))) {
      throw new Error("vault conservation or cap-denial accounting drifted");
    }
    const allTransactions = [
      ...machineTransactions,
      policyTransaction,
      firstRequestTransaction,
      ...allowEvaluationTransactions,
      executeTransaction,
      secondRequestTransaction,
      ...denyEvaluationTransactions,
      stopTransaction,
      resumeTransaction,
      revokeTransaction,
    ];
    const observedBlock = (await client.getBlockNumber()).toString();
    const observation = {
      chainId: CHAIN_ID,
      mode: "SIMULATED_TEE_ONCHAIN",
      recordedAt: new Date().toISOString(),
      sourceCommit,
      observedBlock,
      transactionCount: allTransactions.length,
      publicIdentifiers: {
        owner: context.owner,
        asset: context.asset,
        contracts: { registry: context.registry, vault: context.vault, router: context.router },
        deploymentSourceCommit: context.deploymentSourceCommit,
        policyId: policy.policyId,
        policyCommitment: commitment,
        extensionId: binding.extensionId,
        codeVersion: binding.codeVersion,
        machines: machines.map((machine) => ({ machineId: machine.machineId, keyFingerprint: machine.keyFingerprint, signer: machine.signer })),
      },
      lifecycle: {
        machineRegistrations: machineTransactions,
        policyRegistration: policyTransaction,
        recurringAllow: {
          requestId: firstRequest.requestId,
          amountUBA: AMOUNT.toString(),
          publicReasonClass: "OK",
          request: firstRequestTransaction,
          evaluations: allowEvaluationTransactions,
          execution: executeTransaction,
        },
        capDenial: {
          requestId: secondRequest.requestId,
          amountUBA: AMOUNT.toString(),
          publicReasonClass: "CAP_EXCEEDED",
          request: secondRequestTransaction,
          evaluations: denyEvaluationTransactions,
        },
        emergencyStop: { ...stopTransaction, stoppedRequestRejected },
        resume: resumeTransaction,
        revoke: { ...revokeTransaction, revokedRequestRejected },
      },
      accounting: {
        before: publicAccounting(before.accounting),
        afterAllow: publicAccounting(afterAllow),
        afterDeny: publicAccounting(afterDeny),
        executedAmountUBA: AMOUNT.toString(),
      },
    };
    const evidence = buildSimulatedLifecycleEvidence(observation);
    await writeFile(SIMULATED_LIFECYCLE_EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
    return { status: evidence.status, transactionCount: allTransactions.length, observedBlock, evidence: "evidence/simulation/coston2-simulated-policy-lifecycle-2026-08-09.json" };
  } finally {
    await compiled.cleanup();
  }
}

async function main() {
  const options = parseSimulatedLifecycleCLI(process.argv.slice(2));
  const result = options.mode === "plan" ? await planSimulatedLifecycle() : await runSimulatedLifecycle();
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
