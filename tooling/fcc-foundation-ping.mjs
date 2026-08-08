import { execFile } from "node:child_process";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseAbi,
  parseEventLogs,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { createOperationalPlan } from "./fcc-code-version-deploy.mjs";
import { evaluateMachineRegistration, readMachineSnapshot } from "./fcc-machine-registration.mjs";
import { pollAndVerifyFoundationResult } from "./fcc-foundation-result.mjs";
import {
  COSTON2_CHAIN_ID,
  COSTON2_RPC_URL,
  FCC_TEE_MANAGER,
} from "./fcc-foundation-registration.mjs";
import { normalizeExpectedImageID, PAYGUARD_EXTENSION_ID, PAYGUARD_EXTENSION_OWNER, PAYGUARD_FOUNDATION_SENDER } from "./fcc-code-version.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const evidencePath = resolve(root, "evidence/coston2/fcc-foundation-ping.json");
const minimumGasBalance = 50_000_000_000_000_000n;
const instructionFee = 1_000_000n;
const senderAbi = parseAbi([
  "function owner() view returns (address)",
  "function getExtensionId() view returns (uint256)",
  "function sendFoundationPing(bytes32 requestNonce, bytes32 payloadHash) payable returns (bytes32 instructionId)",
  "event FoundationPingDispatched(bytes32 indexed instructionId, bytes32 indexed requestNonce, bytes32 indexed bindingHash, address teeId)",
]);

const coston2 = {
  id: COSTON2_CHAIN_ID,
  name: "Flare Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [COSTON2_RPC_URL] } },
};

export function parseFoundationPingCLI(argv) {
  const [mode, ...tokens] = argv;
  if (!new Set(["plan", "send"]).has(mode)) throw new Error("mode must be plan or send");
  const options = { mode, broadcast: false };
  const flags = new Map([["--url", "url"], ["--image-id", "imageId"], ["--leaf-crl", "leafCRL"], ["--intermediate-crl", "intermediateCRL"]]);
  const seen = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--broadcast") {
      if (seen.has(token)) throw new Error("duplicate --broadcast");
      seen.add(token); options.broadcast = true; continue;
    }
    const field = flags.get(token);
    if (!field || seen.has(token) || index + 1 >= tokens.length) throw new Error(`invalid or duplicate argument ${token}`);
    seen.add(token); options[field] = tokens[index + 1]; index += 1;
  }
  if (!options.url || !options.imageId) throw new Error("--url and --image-id are required");
  if (mode === "plan" && options.broadcast) throw new Error("--broadcast is accepted only in send mode");
  if (mode === "send" && !options.broadcast) throw new Error("send mode requires explicit --broadcast");
  options.expectedCodeHash = normalizeExpectedImageID(options.imageId);
  return options;
}

export function buildFoundationPingPayload({ instructionId, transactionHash, requestNonce, payloadHash, bindingHash, teeId, proxyId, resultHash, sourceCommit, blockNumber }) {
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-fcc-foundation-ping",
    status: "verified-production-ping",
    recordedAt: new Date().toISOString(),
    network: { name: "flare-coston2", chainId: COSTON2_CHAIN_ID, observedBlock: blockNumber.toString() },
    publicIdentifiers: {
      sourceCommit, sender: PAYGUARD_FOUNDATION_SENDER, manager: FCC_TEE_MANAGER,
      extensionId: PAYGUARD_EXTENSION_ID.toString(), instructionId, transactionHash,
      requestNonce, payloadHash, bindingHash, teeId, proxyId, resultHash,
    },
    assertions: {
      chainIdVerified: true, senderRuntimeVerified: true, extensionVerified: true,
      productionMachineVerified: true, codeVersionVerified: true, resultVerified: true,
      teeSignerVerified: true, proxySignerVerified: true, noPrivateKeyRecorded: true,
      noCredentialRecorded: true, noPolicyRecorded: true, testnetOnly: true,
    },
    blockers: ["THREE_MACHINE_CUSTODY_NOT_VERIFIED", "THRESHOLD_EVALUATION_NOT_VERIFIED"],
  };
}

function clientFor() { return createPublicClient({ chain: coston2, transport: http(COSTON2_RPC_URL, { timeout: 15_000, retryCount: 2 }) }); }

function loadAccount() {
  try { process.loadEnvFile(resolve(root, ".env.local")); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const key = process.env.PAYGUARD_DEPLOYER_PRIVATE_KEY;
  const configured = process.env.PAYGUARD_DEPLOYER_ADDRESS;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? "") || !isAddress(configured ?? "")) throw new Error("dedicated PayGuard deployer configuration is missing or malformed");
  const account = privateKeyToAccount(key);
  if (account.address !== getAddress(configured) || account.address !== PAYGUARD_EXTENSION_OWNER) throw new Error("configured signer is not the verified PayGuard extension owner");
  return { account, key };
}

async function prepare(options, client = clientFor()) {
  const plan = await createOperationalPlan(options, { client });
  if (plan.result.action !== "already-supported") throw new Error("exact FCC code version is not already supported");
  const machine = await readMachineSnapshot(client, plan.admission);
  const machineEvaluation = evaluateMachineRegistration({ admission: plan.admission, snapshot: machine, url: options.url, codeVersionAction: plan.result.action });
  if (machineEvaluation.status !== "verified") throw new Error("production machine readback is not verified");
  const [senderCode, senderOwner, senderExtension] = await Promise.all([
    client.getCode({ address: PAYGUARD_FOUNDATION_SENDER }),
    client.readContract({ address: PAYGUARD_FOUNDATION_SENDER, abi: senderAbi, functionName: "owner" }),
    client.readContract({ address: PAYGUARD_FOUNDATION_SENDER, abi: senderAbi, functionName: "getExtensionId" }),
  ]);
  if (!senderCode || senderCode === "0x" || getAddress(senderOwner) !== PAYGUARD_EXTENSION_OWNER || senderExtension !== PAYGUARD_EXTENSION_ID) throw new Error("foundation sender readback is not verified");
  return { client, plan, machine, machineEvaluation };
}

async function cleanSourceCommit() {
  const commit = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" })).stdout.trim();
  const status = (await execFileAsync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root, encoding: "utf8" })).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(commit) || status !== "") throw new Error("foundation ping requires a clean committed PayGuard worktree");
  return commit;
}

async function send(options, prepared) {
  const sourceCommit = await cleanSourceCommit();
  const { account } = loadAccount();
  if (await prepared.client.getBalance({ address: account.address }) < minimumGasBalance) throw new Error("PayGuard deployer gas balance is below the foundation ping safety buffer");
  const wallet = createWalletClient({ account, chain: coston2, transport: http(COSTON2_RPC_URL, { timeout: 15_000 }) });
  const requestNonce = keccak256(stringToHex(`${sourceCommit}:${Date.now()}`));
  const payloadHash = keccak256(stringToHex("PAYGUARD_FOUNDATION_PING_V1"));
  const simulation = await wallet.simulateContract({ address: PAYGUARD_FOUNDATION_SENDER, abi: senderAbi, functionName: "sendFoundationPing", args: [requestNonce, payloadHash], value: instructionFee, account });
  const txHash = await wallet.writeContract(simulation.request);
  const receipt = await prepared.client.waitForTransactionReceipt({ hash: txHash, confirmations: 2 });
  if (receipt.status !== "success") throw new Error("foundation ping transaction reverted");
  const events = parseEventLogs({ abi: senderAbi, logs: receipt.logs, eventName: "FoundationPingDispatched", strict: true });
  if (events.length !== 1 || getAddress(events[0].args.teeId) !== prepared.plan.admission.teeId || events[0].args.requestNonce.toLowerCase() !== requestNonce) throw new Error("foundation ping dispatch event mismatch");
  const result = await pollAndVerifyFoundationResult({ origin: options.url, expected: { instructionId: events[0].args.instructionId, requestNonce, payloadHash, teeId: prepared.plan.admission.teeId, proxyId: prepared.plan.admission.proxyId } });
  const evidence = buildFoundationPingPayload({
    instructionId: events[0].args.instructionId.toLowerCase(), transactionHash: txHash, requestNonce,
    payloadHash, bindingHash: events[0].args.bindingHash, teeId: prepared.plan.admission.teeId,
    proxyId: prepared.plan.admission.proxyId, resultHash: result.resultHash, sourceCommit,
    blockNumber: receipt.blockNumber,
  });
  await mkdir(resolve(evidencePath, ".."), { recursive: true });
  const temporary = `${evidencePath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
  await rename(temporary, evidencePath);
  return evidence;
}

async function main() {
  const options = parseFoundationPingCLI(process.argv.slice(2));
  const prepared = await prepare(options);
  if (options.mode === "plan") {
    process.stdout.write(`${JSON.stringify({ status: "ready", action: "send-foundation-ping", sender: PAYGUARD_FOUNDATION_SENDER, teeId: prepared.plan.admission.teeId, proxyId: prepared.plan.admission.proxyId }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(await send(options, prepared), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main().catch((error) => { process.stderr.write(`FCC foundation ping failed: ${error.message}\n`); process.exitCode = 1; });
