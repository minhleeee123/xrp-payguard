import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  zeroAddress,
} from "viem";
import {
  COSTON2_CHAIN_ID,
  COSTON2_RPC_URL,
  FCC_DEPLOYMENTS_URL,
  FCC_DEPLOYMENTS_SHA256,
  FCC_SCAFFOLD_COMMIT,
  FCC_SCAFFOLD_REPOSITORY,
  FCC_TEE_MANAGER,
  resolveOfficialTeeManager,
} from "./fcc-foundation-registration.mjs";

const root = resolve(import.meta.dirname, "..");
export const DEPENDENCY_EVIDENCE_PATH = resolve(root, "evidence/coston2/coston2-dependency-resolution.json");
export const FLARE_CONTRACT_REGISTRY = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";
export const DEPENDENCY_NAMES = [
  "FdcHub",
  "FdcVerification",
  "FdcRequestFeeConfigurations",
  "FdcInflationConfigurations",
  "FlareSystemsManager",
  "Relay",
  "FtsoV2",
  "AssetManagerFXRP",
  "MasterAccountController",
];
const REGISTRY_ABI = [{
  type: "function",
  name: "getContractAddressByName",
  stateMutability: "view",
  inputs: [{ name: "name", type: "string" }],
  outputs: [{ name: "contractAddress", type: "address" }],
}];
const BLOCKERS = [
  "THREE_STABLE_FCC_MACHINE_ORIGINS_NOT_CONFIGURED",
  "FCC_INDEXER_CREDENTIALS_AND_ENDPOINT_NOT_CONFIGURED",
];

export function parseDependencyCLI(argv) {
  const [mode = "observe", ...tokens] = argv;
  if (mode !== "observe") throw new Error("mode must be observe");
  let write = false;
  for (const token of tokens) {
    if (token === "--write" && !write) {
      write = true;
      continue;
    }
    throw new Error(`invalid or duplicate argument ${token}`);
  }
  return { mode, write };
}

function clientFor() {
  const chain = {
    id: COSTON2_CHAIN_ID,
    name: "Flare Coston2",
    nativeCurrency: { name: "C2FLR", symbol: "C2FLR", decimals: 18 },
    rpcUrls: { default: { http: [COSTON2_RPC_URL] } },
  };
  return createPublicClient({ chain, transport: http(COSTON2_RPC_URL, { timeout: 15_000, retryCount: 2 }) });
}

function requireAddress(value, label) {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) {
    throw new Error(`${label} must be a non-zero address`);
  }
  return getAddress(value);
}

function runtimeBytes(code, label) {
  if (typeof code !== "string" || !/^0x[0-9a-fA-F]*$/.test(code) || code.length <= 2 || (code.length - 2) % 2 !== 0) {
    throw new Error(`${label} runtime bytecode is missing or malformed`);
  }
  return (code.length - 2) / 2;
}

async function readRegistryAddress(client, name) {
  if (name === "FlareContractRegistry") return requireAddress(FLARE_CONTRACT_REGISTRY, name);
  const value = await client.readContract({
    address: FLARE_CONTRACT_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "getContractAddressByName",
    args: [name],
  });
  return requireAddress(value, name);
}

export async function collectDependencyObservation({ client = clientFor(), sourceFetcher = fetch } = {}) {
  const [chainId, observedBlock, registryCode] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getBytecode({ address: FLARE_CONTRACT_REGISTRY }),
  ]);
  if (chainId !== COSTON2_CHAIN_ID) throw new Error("dependency observation must target Coston2");
  const registryRuntimeBytes = runtimeBytes(registryCode, "Flare Contract Registry");
  const dependencies = {};
  for (const name of DEPENDENCY_NAMES) {
    const address = await readRegistryAddress(client, name);
    dependencies[name] = {
      address,
      runtimeBytes: runtimeBytes(await client.getBytecode({ address }), name),
    };
  }
  const response = await sourceFetcher(FCC_DEPLOYMENTS_URL, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`official FCC deployment source returned HTTP ${response.status}`);
  const managerSource = resolveOfficialTeeManager(await response.arrayBuffer());
  if (managerSource.address !== FCC_TEE_MANAGER || managerSource.sha256 !== FCC_DEPLOYMENTS_SHA256) {
    throw new Error("official FCC manager source pin mismatch");
  }
  return {
    chainId,
    observedBlock: observedBlock.toString(),
    registry: requireAddress(FLARE_CONTRACT_REGISTRY, "Flare Contract Registry"),
    registryRuntimeBytes,
    dependencies,
    fccManager: {
      address: managerSource.address,
      sourceRepository: FCC_SCAFFOLD_REPOSITORY,
      sourceCommit: FCC_SCAFFOLD_COMMIT,
      sourceSha256: managerSource.sha256,
    },
  };
}

export function buildDependencyEvidence(observation, recordedAt = new Date().toISOString()) {
  if (observation?.chainId !== COSTON2_CHAIN_ID) throw new Error("dependency evidence must target Coston2");
  if (!/^\d+$/.test(observation.observedBlock ?? "")) throw new Error("dependency evidence block is invalid");
  const registry = requireAddress(observation.registry, "Flare Contract Registry");
  if (registry !== getAddress(FLARE_CONTRACT_REGISTRY)) throw new Error("dependency evidence registry pin mismatch");
  if (!Number.isInteger(observation.registryRuntimeBytes) || observation.registryRuntimeBytes <= 0) {
    throw new Error("registry runtime size is invalid");
  }
  const dependencies = Object.fromEntries(DEPENDENCY_NAMES.map((name) => {
    const entry = observation.dependencies?.[name];
    if (!entry) throw new Error(`missing dependency ${name}`);
    return [name, {
      address: requireAddress(entry.address, `${name} address`),
      runtimeBytes: Number.isInteger(entry.runtimeBytes) && entry.runtimeBytes > 0 ? entry.runtimeBytes : (() => { throw new Error(`${name} runtime size is invalid`); })(),
    }];
  }));
  const manager = observation.fccManager;
  if (!manager || requireAddress(manager.address, "FCC manager") !== FCC_TEE_MANAGER
    || manager.sourceRepository !== FCC_SCAFFOLD_REPOSITORY
    || manager.sourceCommit !== FCC_SCAFFOLD_COMMIT
    || manager.sourceSha256 !== FCC_DEPLOYMENTS_SHA256) throw new Error("FCC manager source pin is invalid");
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-dependency-resolution",
    status: "observed",
    recordedAt,
    network: {
      name: "flare-coston2",
      chainId: COSTON2_CHAIN_ID,
      rpcUrl: COSTON2_RPC_URL,
      observedBlock: observation.observedBlock,
    },
    publicIdentifiers: {
      flareContractRegistry: registry,
      registryRuntimeBytes: observation.registryRuntimeBytes,
      dependencies,
      fccManager: {
        address: FCC_TEE_MANAGER,
        sourceRepository: manager.sourceRepository,
        sourceCommit: manager.sourceCommit,
        sourceSha256: manager.sourceSha256,
      },
    },
    assertions: {
      chainIdVerified: true,
      registryRuntimeVerified: true,
      dependencyAddressesNonZero: true,
      dependencyRuntimeVerified: true,
      fccManagerSourcePinned: true,
      testnetOnly: true,
      noPrivateKeyRecorded: true,
      noCredentialRecorded: true,
      noPayGuardReleaseClaimed: true,
    },
    blockers: BLOCKERS,
    notes: [
      "This is a read-only Contract Registry observation and does not verify a PayGuard release.",
      "Dependency ABI semantics, FDC proof credentials, Smart Account funding, XRPL payment, and live lifecycle evidence remain open.",
    ],
  };
}

async function writeEvidence(evidence) {
  await mkdir(resolve(DEPENDENCY_EVIDENCE_PATH, ".."), { recursive: true });
  const temporary = `${DEPENDENCY_EVIDENCE_PATH}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
  await rename(temporary, DEPENDENCY_EVIDENCE_PATH);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseDependencyCLI(process.argv.slice(2));
    const evidence = buildDependencyEvidence(await collectDependencyObservation());
    if (options.write) await writeEvidence(evidence);
    console.log(JSON.stringify({ status: "ok", write: options.write, evidencePath: options.write ? "evidence/coston2/coston2-dependency-resolution.json" : undefined, observedBlock: evidence.network.observedBlock }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
