import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createPublicClient, getAddress, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { createOperationalPlan, runMachineAdmission } from "./fcc-code-version-deploy.mjs";
import {
  COSTON2_CHAIN_ID,
  COSTON2_RPC_URL,
  FCC_SCAFFOLD_COMMIT,
  FCC_SCAFFOLD_REPOSITORY,
  FCC_TEE_MANAGER,
  teeManagerRegistrationAbi,
} from "./fcc-foundation-registration.mjs";
import { PAYGUARD_EXTENSION_ID, PAYGUARD_EXTENSION_OWNER } from "./fcc-code-version.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const scaffoldRoot = resolve(root, ".local/fce-extension-scaffold");
const scaffoldToolsRoot = resolve(scaffoldRoot, "tools");
const localEvidenceRoot = resolve(root, "evidence/local/fcc-machine-registration");
const evidencePath = resolve(root, "evidence/coston2/fcc-production-machine.json");
const foundationRegistrationBlock = 33795055n;
const minimumGasBalance = 50_000_000_000_000_000n;

export const PRODUCTION_MACHINE_STATUS = 2;
export const OFFICIAL_REGISTRATION_FILES = new Map([
  ["config/coston2/deployed-addresses.json", "c158350ea5a9bbba8c6485a680252b8f401bc2e25ea10830101eb6d0b40b022e"],
  ["tools/go.mod", "9a9f12d8980e936fcb9da147468dd4952173bf948391ef7ddcb04ec281e861eb"],
  ["tools/go.sum", "ef649e4f7309507bc8d44f803f6605d9fa05e0d91ac5e824577c0684803ca002"],
  ["tools/cmd/register-tee/main.go", "2500f473e2a3ed950bef13cf0df501143c18c1e5333725552b82e15225e44802"],
  ["tools/pkg/fccutils/common.go", "2905f3382eb367b84496bfb93e93abb78b142b777bcc4a77ef5083ec97684e88"],
  ["tools/pkg/fccutils/registration.go", "fd59af105e3cecbe1157d96d49183c341ebab9739e06ff17a7776e943556c707"],
  ["tools/pkg/fccutils/tee_calls.go", "859fb22d9e2c69a9cd204a570f91ba12d0d0b3a75487cd39a3343362d796c52f"],
]);

const coston2 = {
  id: COSTON2_CHAIN_ID,
  name: "Flare Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [COSTON2_RPC_URL] } },
};

function publicHttpsOrigin(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTPS origin`);
  }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash
      || parsed.pathname !== "/" || parsed.port || isIP(parsed.hostname) !== 0
      || parsed.hostname === "localhost" || !parsed.hostname.includes(".")
  ) throw new Error(`${label} must be a credential-free public HTTPS origin with no path or port`);
  return parsed.origin;
}

export function parseMachineRegistrationCLI(argv) {
  const [mode, ...tokens] = argv;
  if (!new Set(["plan", "register", "verify"]).has(mode)) throw new Error("mode must be plan, register, or verify");
  const options = { mode, broadcast: false };
  const flags = new Map([
    ["--url", "url"], ["--image-id", "imageId"], ["--ftdc-url", "ftdcUrl"],
    ["--leaf-crl", "leafCRL"], ["--intermediate-crl", "intermediateCRL"],
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
    const field = flags.get(token);
    if (!field || seen.has(token) || index + 1 >= tokens.length) throw new Error(`invalid or duplicate argument ${token}`);
    seen.add(token);
    options[field] = tokens[index + 1];
    index += 1;
  }
  if (!options.url || !options.imageId || !options.ftdcUrl) {
    throw new Error("--url, --image-id, and --ftdc-url are required");
  }
  options.url = publicHttpsOrigin(options.url, "machine URL");
  options.ftdcUrl = publicHttpsOrigin(options.ftdcUrl, "FTDC URL");
  if (options.url === options.ftdcUrl) throw new Error("machine and FTDC origins must be distinct");
  if (mode !== "register" && options.broadcast) throw new Error("--broadcast is accepted only in register mode");
  if (mode === "register" && !options.broadcast) throw new Error("register mode requires explicit --broadcast");
  return options;
}

export function officialRegisterTeeArgs(options, stateFile, resume = false) {
  const args = [
    "run", "./cmd/register-tee",
    "-a", resolve(scaffoldRoot, "config/coston2/deployed-addresses.json"),
    "-c", COSTON2_RPC_URL,
    "-p", options.url,
    "-h", options.url,
    "-ep", options.ftdcUrl,
    "-command", "rRap",
    "-state", stateFile,
  ];
  if (resume) args.push("--resume");
  return args;
}

export async function verifyOfficialScaffold(executor = execFileAsync, fileReader = readFile, fileStat = lstat) {
  const runGit = async (args) => (await executor("git", args, { cwd: scaffoldRoot, encoding: "utf8" })).stdout.trim();
  const [commit, status, remote] = await Promise.all([
    runGit(["rev-parse", "HEAD"]),
    runGit(["status", "--porcelain=v1", "--untracked-files=all"]),
    runGit(["remote", "get-url", "origin"]),
  ]);
  if (commit !== FCC_SCAFFOLD_COMMIT || status !== "") throw new Error("official FCC scaffold checkout is not clean at the pinned commit");
  if (remote.replace(/\.git$/, "") !== FCC_SCAFFOLD_REPOSITORY) throw new Error("official FCC scaffold remote mismatch");
  try {
    if ((await fileStat(resolve(scaffoldRoot, ".env"))).isFile()) throw new Error("official FCC scaffold must not contain a local .env file");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  for (const [relative, expected] of OFFICIAL_REGISTRATION_FILES) {
    const actual = createHash("sha256").update(await fileReader(resolve(scaffoldRoot, relative))).digest("hex");
    if (actual !== expected) throw new Error(`official FCC scaffold digest mismatch: ${relative}`);
  }
  return { repository: FCC_SCAFFOLD_REPOSITORY, commit };
}

function machineTuple(value) {
  return { teeId: getAddress(value.teeId ?? value[0]), teeProxyId: getAddress(value.teeProxyId ?? value[1]), url: value.url ?? value[2] };
}

function attestationTuple(value) {
  return {
    teeId: getAddress(value.teeId ?? value[0]), initialTeeId: getAddress(value.initialTeeId ?? value[1]),
    url: value.url ?? value[2], codeHash: (value.codeHash ?? value[3]).toLowerCase(), platform: (value.platform ?? value[4]).toLowerCase(),
  };
}

export async function readMachineSnapshot(client, admission) {
  const [chainId, blockNumber, managerCode, machine, attestation, status, owner, extensionId, lastStatusChange] = await Promise.all([
    client.getChainId(), client.getBlockNumber(), client.getCode({ address: FCC_TEE_MANAGER }),
    client.readContract({ address: FCC_TEE_MANAGER, abi: teeManagerRegistrationAbi, functionName: "getTeeMachine", args: [admission.teeId] }),
    client.readContract({ address: FCC_TEE_MANAGER, abi: teeManagerRegistrationAbi, functionName: "getTeeMachineWithAttestationData", args: [admission.teeId] }),
    client.readContract({ address: FCC_TEE_MANAGER, abi: teeManagerRegistrationAbi, functionName: "getTeeMachineStatus", args: [admission.teeId] }),
    client.readContract({ address: FCC_TEE_MANAGER, abi: teeManagerRegistrationAbi, functionName: "getTeeMachineOwner", args: [admission.teeId] }),
    client.readContract({ address: FCC_TEE_MANAGER, abi: teeManagerRegistrationAbi, functionName: "getExtensionId", args: [admission.teeId] }),
    client.readContract({ address: FCC_TEE_MANAGER, abi: teeManagerRegistrationAbi, functionName: "getLastStatusChangeTs", args: [admission.teeId] }),
  ]);
  return {
    chainId, blockNumber, managerRuntimePresent: Boolean(managerCode && managerCode !== "0x"),
    machine: machineTuple(machine), attestation: attestationTuple(attestation), status: Number(status),
    owner: getAddress(owner), extensionId, lastStatusChange,
  };
}

export function evaluateMachineRegistration({ admission, snapshot, url, codeVersionAction }) {
  const assertions = {
    chainIdVerified: snapshot.chainId === COSTON2_CHAIN_ID,
    managerRuntimePresent: snapshot.managerRuntimePresent === true,
    codeVersionAlreadySupported: codeVersionAction === "already-supported",
    teeIdVerified: snapshot.machine.teeId === admission.teeId && snapshot.attestation.teeId === admission.teeId,
    proxyIdVerified: snapshot.machine.teeProxyId === admission.proxyId,
    ownerVerified: snapshot.owner === PAYGUARD_EXTENSION_OWNER,
    extensionVerified: snapshot.extensionId === PAYGUARD_EXTENSION_ID,
    initialTeeIdVerified: snapshot.attestation.initialTeeId === admission.teeId,
    urlVerified: snapshot.machine.url === url && snapshot.attestation.url === url,
    codeHashVerified: snapshot.attestation.codeHash === admission.codeHash,
    platformVerified: snapshot.attestation.platform === admission.platform,
    productionStatusVerified: snapshot.status === PRODUCTION_MACHINE_STATUS,
  };
  return { status: Object.values(assertions).every(Boolean) ? "verified" : "failed", assertions };
}

export async function resolveMachineEvents(client, admission, expectedUrl) {
  const [registered, production] = await Promise.all([
    client.getContractEvents({ address: FCC_TEE_MANAGER, abi: teeManagerRegistrationAbi, eventName: "TeeMachineRegistered", args: { teeId: admission.teeId }, fromBlock: foundationRegistrationBlock, toBlock: "latest", strict: true }),
    client.getContractEvents({ address: FCC_TEE_MANAGER, abi: teeManagerRegistrationAbi, eventName: "TeeMachineStatusChanged", args: { teeId: admission.teeId, newStatus: PRODUCTION_MACHINE_STATUS }, fromBlock: foundationRegistrationBlock, toBlock: "latest", strict: true }),
  ]);
  const exact = registered.filter(({ args }) => args.teeProxyId === admission.proxyId && args.owner === PAYGUARD_EXTENSION_OWNER
    && args.extensionId === PAYGUARD_EXTENSION_ID && args.codeHash.toLowerCase() === admission.codeHash
    && args.url === expectedUrl && args.platform.toLowerCase() === admission.platform
    && args.governanceHash.toLowerCase() === admission.governanceHash);
  if (exact.length !== 1 || production.length === 0) throw new Error("exact registration and production events were not both found");
  const latestProduction = production.at(-1);
  if (latestProduction.blockNumber < exact[0].blockNumber) throw new Error("production event predates the exact registration event");
  return { registered: exact[0], production: latestProduction };
}

export function buildMachineEvidence({ sourceCommit, admission, snapshot, evaluation, events }) {
  if (evaluation.status !== "verified") throw new Error("cannot build evidence for an unverified machine");
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-fcc-production-machine",
    status: "production-machine-verified",
    recordedAt: new Date().toISOString(),
    network: { name: "flare-coston2", chainId: COSTON2_CHAIN_ID, observedBlock: snapshot.blockNumber.toString() },
    publicIdentifiers: {
      sourceCommit, manager: FCC_TEE_MANAGER, extensionId: PAYGUARD_EXTENSION_ID.toString(),
      teeId: admission.teeId, proxyId: admission.proxyId, url: snapshot.machine.url,
      codeHash: admission.codeHash, platform: admission.platform, governanceHash: admission.governanceHash,
      keyFingerprint: admission.keyFingerprint, registrationTransaction: events.registered.transactionHash,
      registrationBlock: events.registered.blockNumber.toString(), productionTransaction: events.production.transactionHash,
      productionBlock: events.production.blockNumber.toString(), lastStatusChange: snapshot.lastStatusChange.toString(),
    },
    assertions: { ...evaluation.assertions, admissionPkiVerified: true, noRawAttestationRecorded: true, noSignatureRecorded: true, testnetOnly: true },
    blockers: ["TWO_ADDITIONAL_PRODUCTION_MACHINES_REQUIRED", "LIVE_FCC_RESULT_NOT_VERIFIED"],
  };
}

async function git(args) {
  return (await execFileAsync("git", args, { cwd: root, encoding: "utf8" })).stdout.trim();
}

async function cleanSourceCommit() {
  const [commit, status] = await Promise.all([git(["rev-parse", "HEAD"]), git(["status", "--porcelain=v1", "--untracked-files=all"])]);
  if (!/^[0-9a-f]{40}$/.test(commit) || status !== "") throw new Error("machine registration requires a clean committed PayGuard worktree");
  return commit;
}

function loadAccount() {
  try { process.loadEnvFile(resolve(root, ".env.local")); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const configured = process.env.PAYGUARD_DEPLOYER_ADDRESS;
  const key = process.env.PAYGUARD_DEPLOYER_PRIVATE_KEY;
  if (!isAddress(configured ?? "") || !/^0x[0-9a-fA-F]{64}$/.test(key ?? "")) throw new Error("dedicated PayGuard deployer configuration is missing or malformed");
  const account = privateKeyToAccount(key);
  if (account.address !== getAddress(configured) || account.address !== PAYGUARD_EXTENSION_OWNER) throw new Error("configured signer is not the verified PayGuard extension owner");
  return { account, key };
}

function clientFor() {
  return createPublicClient({ chain: coston2, transport: http(COSTON2_RPC_URL, { timeout: 15_000, retryCount: 2 }) });
}

async function createPlan(options, dependencies = {}) {
  const client = dependencies.client ?? clientFor();
  const scaffold = await verifyOfficialScaffold(dependencies.executor, dependencies.readFile, dependencies.fileStat);
  const versionPlan = await createOperationalPlan(options, { client, executor: dependencies.executor, fetcher: dependencies.fetcher });
  if (versionPlan.result.action !== "already-supported") throw new Error("exact FCC code version must be allowed before machine registration");
  return { client, scaffold, ...versionPlan };
}

async function verifyAndRecord(options, plan, sourceCommit) {
  const admission = await runMachineAdmission(options);
  if (admission.teeId !== plan.admission.teeId || admission.codeHash !== plan.admission.codeHash || admission.platform !== plan.admission.platform) {
    throw new Error("machine identity changed during registration");
  }
  const snapshot = await readMachineSnapshot(plan.client, admission);
  const evaluation = evaluateMachineRegistration({ admission, snapshot, url: options.url, codeVersionAction: plan.result.action });
  if (evaluation.status !== "verified") throw new Error("machine registration readback failed closed");
  const events = await resolveMachineEvents(plan.client, admission, options.url);
  const evidence = buildMachineEvidence({ sourceCommit, admission, snapshot, evaluation, events });
  await mkdir(resolve(evidencePath, ".."), { recursive: true });
  const temporary = `${evidencePath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
  await rename(temporary, evidencePath);
  return evidence;
}

async function main() {
  const options = parseMachineRegistrationCLI(process.argv.slice(2));
  const plan = await createPlan(options);
  if (options.mode === "plan") {
    process.stdout.write(`${JSON.stringify({ status: "ready", action: "register-production-machine", teeId: plan.admission.teeId, url: options.url, ftdcUrl: options.ftdcUrl, scaffold: plan.scaffold }, null, 2)}\n`);
    return;
  }
  if (options.mode === "verify") {
    const evidence = await verifyAndRecord(options, plan, await git(["rev-parse", "HEAD"]));
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    return;
  }
  const sourceCommit = await cleanSourceCommit();
  const { account, key } = loadAccount();
  if (await plan.client.getBalance({ address: account.address }) < minimumGasBalance) throw new Error("PayGuard deployer gas balance is below the registration safety buffer");
  await mkdir(localEvidenceRoot, { recursive: true, mode: 0o700 });
  const stateFile = resolve(localEvidenceRoot, `${plan.admission.teeId.toLowerCase()}.state.json`);
  let resume = false;
  try { await access(stateFile); resume = true; } catch {}
  const childEnv = { DEPLOYMENT_PRIVATE_KEY: key };
  for (const name of ["PATH", "HOME", "TMPDIR", "SSL_CERT_FILE", "SSL_CERT_DIR", "GODEBUG"]) {
    if (process.env[name]) childEnv[name] = process.env[name];
  }
  await execFileAsync("go", officialRegisterTeeArgs(options, stateFile, resume), { cwd: scaffoldToolsRoot, env: childEnv, encoding: "utf8", timeout: 15 * 60_000, maxBuffer: 2 * 1024 * 1024 });
  const evidence = await verifyAndRecord(options, plan, sourceCommit);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { process.stderr.write(`FCC machine registration failed: ${error.message}\n`); process.exitCode = 1; });
}
