import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { COSTON2_CHAIN_ID, COSTON2_RPC_URL, FCC_TEE_MANAGER } from "./fcc-foundation-registration.mjs";
import { PAYGUARD_EXTENSION_ID, PAYGUARD_EXTENSION_OWNER } from "./fcc-code-version.mjs";

export const STALE_MACHINE_C = getAddress("0xed19Ff73952E4A4783f739194940c0b6823Ae213");
export const ACTIVE_MACHINE_SET = Object.freeze([
  Object.freeze({ teeId: getAddress("0x1C911D007f8203484eD4099bC11849d7e9691044"), url: "https://payguard-fcc-a-production.up.railway.app" }),
  Object.freeze({ teeId: getAddress("0xff49A99535b8c52345D3c0b76bCf60194De7C29b"), url: "https://payguard-fcc-b-production.up.railway.app" }),
  Object.freeze({ teeId: STALE_MACHINE_C, url: "https://payguard-fcc-c-production.up.railway.app" }),
  Object.freeze({ teeId: getAddress("0xd871bc2044a75e8cc2CF06aCdeaDC4CBbEef349A"), url: "https://payguard-fcc-d-production.up.railway.app" }),
]);
export const RETAINED_MACHINE_SET = Object.freeze(ACTIVE_MACHINE_SET.filter(({ teeId }) => teeId !== STALE_MACHINE_C));

const chain = {
  id: COSTON2_CHAIN_ID,
  name: "Flare Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [COSTON2_RPC_URL] } },
};
const abi = parseAbi([
  "event TeeMachineStatusChanged(address indexed teeId,uint8 indexed newStatus)",
  "function getActiveTeeMachines(uint256 extensionId) view returns (address[] teeIds,string[] urls)",
  "function getTeeMachine(address teeId) view returns ((address teeId,address teeProxyId,string url) machine)",
  "function getTeeMachineStatus(address teeId) view returns (uint8 status)",
  "function getTeeMachineOwner(address teeId) view returns (address owner)",
  "function getExtensionId(address teeId) view returns (uint256 extensionId)",
  "function pause(address teeId)",
]);

function canonicalSet(machines) {
  return machines.map(({ teeId, url }) => `${getAddress(teeId)}|${url}`).sort();
}

function exactSet(actual, expected) {
  return JSON.stringify(canonicalSet(actual)) === JSON.stringify(canonicalSet(expected));
}

export function evaluatePausePreflight(snapshot) {
  const assertions = {
    coston2Verified: snapshot.chainId === COSTON2_CHAIN_ID,
    managerRuntimeVerified: snapshot.managerRuntimePresent === true,
    signerVerified: getAddress(snapshot.signer) === PAYGUARD_EXTENSION_OWNER,
    staleMachineOwnerVerified: getAddress(snapshot.owner) === PAYGUARD_EXTENSION_OWNER,
    staleMachineExtensionVerified: snapshot.extensionId === PAYGUARD_EXTENSION_ID,
    staleMachineProductionVerified: snapshot.status === 2,
    staleMachineIdentityVerified: getAddress(snapshot.machine.teeId) === STALE_MACHINE_C,
    staleMachineUrlVerified: snapshot.machine.url === ACTIVE_MACHINE_SET[2].url,
    exactPrePauseSetVerified: exactSet(snapshot.activeMachines, ACTIVE_MACHINE_SET),
    retainedMachinesProductionVerified: snapshot.retainedStatuses.every((status) => status === 2),
  };
  return { status: Object.values(assertions).every(Boolean) ? "ready" : "failed", assertions };
}

export function evaluatePausePostcondition(snapshot) {
  const assertions = {
    coston2Verified: snapshot.chainId === COSTON2_CHAIN_ID,
    staleMachineNoLongerProduction: snapshot.status !== 2,
    exactRetainedSetVerified: exactSet(snapshot.activeMachines, RETAINED_MACHINE_SET),
    retainedMachinesProductionVerified: snapshot.retainedStatuses.every((status) => status === 2),
  };
  return { status: Object.values(assertions).every(Boolean) ? "verified" : "failed", assertions };
}

function normalizeActive(value) {
  const teeIds = value[0];
  const urls = value[1];
  if (!Array.isArray(teeIds) || !Array.isArray(urls) || teeIds.length !== urls.length) {
    throw new Error("active machine readback is malformed");
  }
  return teeIds.map((teeId, index) => ({ teeId: getAddress(teeId), url: urls[index] }));
}

async function readSnapshot(client, signer) {
  const [chainId, blockNumber, code, machine, status, owner, extensionId, active, ...retainedStatuses] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getCode({ address: FCC_TEE_MANAGER }),
    client.readContract({ address: FCC_TEE_MANAGER, abi, functionName: "getTeeMachine", args: [STALE_MACHINE_C] }),
    client.readContract({ address: FCC_TEE_MANAGER, abi, functionName: "getTeeMachineStatus", args: [STALE_MACHINE_C] }),
    client.readContract({ address: FCC_TEE_MANAGER, abi, functionName: "getTeeMachineOwner", args: [STALE_MACHINE_C] }),
    client.readContract({ address: FCC_TEE_MANAGER, abi, functionName: "getExtensionId", args: [STALE_MACHINE_C] }),
    client.readContract({ address: FCC_TEE_MANAGER, abi, functionName: "getActiveTeeMachines", args: [PAYGUARD_EXTENSION_ID] }),
    ...RETAINED_MACHINE_SET.map(({ teeId }) => client.readContract({
      address: FCC_TEE_MANAGER, abi, functionName: "getTeeMachineStatus", args: [teeId],
    })),
  ]);
  return {
    chainId,
    blockNumber,
    managerRuntimePresent: Boolean(code && code !== "0x"),
    signer,
    machine: { teeId: getAddress(machine.teeId), teeProxyId: getAddress(machine.teeProxyId), url: machine.url },
    status: Number(status),
    owner: getAddress(owner),
    extensionId,
    activeMachines: normalizeActive(active),
    retainedStatuses: retainedStatuses.map(Number),
  };
}

function loadSigner() {
  try { process.loadEnvFile(resolve(import.meta.dirname, "../.env.local")); } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const key = process.env.PAYGUARD_DEPLOYER_PRIVATE_KEY;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? "")) throw new Error("PayGuard deployer key is missing or malformed");
  const account = privateKeyToAccount(key);
  if (account.address !== PAYGUARD_EXTENSION_OWNER) throw new Error("configured signer is not the PayGuard extension owner");
  return { account };
}

export async function runStaleMachinePause(argv = process.argv.slice(2)) {
  const [mode, ...flags] = argv;
  if (!new Set(["plan", "pause", "verify"]).has(mode)) throw new Error("mode must be plan, pause, or verify");
  const requiredFlags = mode === "pause"
    ? ["--broadcast", "--confirm-stale-machine-c"]
    : [];
  if (flags.length !== requiredFlags.length || !requiredFlags.every((flag) => flags.includes(flag)) || new Set(flags).size !== flags.length) {
    throw new Error(mode === "pause" ? "pause requires exact broadcast and stale-machine-C confirmation" : `${mode} accepts no flags`);
  }
  if (mode === "verify") {
    const client = createPublicClient({ chain, transport: http(COSTON2_RPC_URL, { timeout: 15_000, retryCount: 2 }) });
    const post = await readSnapshot(client, PAYGUARD_EXTENSION_OWNER);
    const postcondition = evaluatePausePostcondition(post);
    if (postcondition.status !== "verified") throw new Error(`stale machine pause verification failed: ${JSON.stringify(postcondition.assertions)}`);
    return {
      status: "verified", action: "stale-machine-c-paused", manager: FCC_TEE_MANAGER,
      extensionId: PAYGUARD_EXTENSION_ID.toString(), teeId: STALE_MACHINE_C,
      resultingStatus: post.status, observedBlock: post.blockNumber.toString(),
      activeMachines: post.activeMachines, assertions: postcondition.assertions,
    };
  }
  const { account } = loadSigner();
  const client = createPublicClient({ chain, transport: http(COSTON2_RPC_URL, { timeout: 15_000, retryCount: 2 }) });
  const pre = await readSnapshot(client, account.address);
  const existingPostcondition = evaluatePausePostcondition(pre);
  if (existingPostcondition.status === "verified") return {
    status: "already-verified", action: "none", broadcast: false,
    manager: FCC_TEE_MANAGER, extensionId: PAYGUARD_EXTENSION_ID.toString(), teeId: STALE_MACHINE_C,
    resultingStatus: pre.status, observedBlock: pre.blockNumber.toString(),
    activeMachines: pre.activeMachines, assertions: existingPostcondition.assertions,
  };
  const preflight = evaluatePausePreflight(pre);
  if (preflight.status !== "ready") throw new Error(`stale machine pause preflight failed: ${JSON.stringify(preflight.assertions)}`);
  if (mode === "plan") return {
    status: "ready", action: "pause-stale-machine-c", manager: FCC_TEE_MANAGER,
    extensionId: PAYGUARD_EXTENSION_ID.toString(), teeId: STALE_MACHINE_C,
    observedBlock: pre.blockNumber.toString(), assertions: preflight.assertions,
  };

  const wallet = createWalletClient({ account, chain, transport: http(COSTON2_RPC_URL, { timeout: 15_000, retryCount: 2 }) });
  const simulation = await client.simulateContract({
    account: account.address, address: FCC_TEE_MANAGER, abi, functionName: "pause", args: [STALE_MACHINE_C],
  });
  const transactionHash = await wallet.writeContract({ ...simulation.request, account, chain });
  const receipt = await client.waitForTransactionReceipt({ hash: transactionHash, confirmations: 2, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error("stale machine pause transaction reverted");
  const post = await readSnapshot(client, account.address);
  const postcondition = evaluatePausePostcondition(post);
  if (postcondition.status !== "verified") throw new Error(`stale machine pause postcondition failed: ${JSON.stringify(postcondition.assertions)}`);
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-stale-machine-pause",
    status: "verified",
    recordedAt: new Date().toISOString(),
    network: { name: "flare-coston2", chainId: COSTON2_CHAIN_ID, observedBlock: post.blockNumber.toString() },
    publicIdentifiers: {
      manager: FCC_TEE_MANAGER,
      extensionId: PAYGUARD_EXTENSION_ID.toString(),
      teeId: STALE_MACHINE_C,
      transactionHash,
      transactionBlock: receipt.blockNumber.toString(),
      resultingStatus: post.status,
      activeTeeIds: post.activeMachines.map(({ teeId }) => teeId),
      activeUrls: post.activeMachines.map(({ url }) => url),
    },
    assertions: { ...preflight.assertions, ...postcondition.assertions, noPrivateKeyRecorded: true, testnetOnly: true },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runStaleMachinePause().then((value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
