import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  COSTON2_CHAIN_ID,
  COSTON2_RPC_URL,
} from "./fcc-foundation-registration.mjs";

const root = resolve(import.meta.dirname, "..");
export const PUBLIC_ENDPOINT_EVIDENCE_PATH = resolve(
  root,
  "evidence/coston2/coston2-public-endpoint-reachability.json",
);
export const COSTON2_EXPLORER_URL = "https://coston2-explorer.flare.network";
export const COSTON2_EXPLORER_API_URL = `${COSTON2_EXPLORER_URL}/api`;
export const COSTON2_FAUCET_URL = "https://faucet.flare.network";
export const FLARE_CONTRACT_REGISTRY = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

const REQUEST_TIMEOUT_MS = 15_000;

function timeoutSignal() {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

function requireStatus(response, label) {
  if (!response || !Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
    throw new Error(`${label} returned HTTP ${response?.status ?? "unknown"}`);
  }
}

async function readJson(response, label) {
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} JSON envelope is invalid`);
  }
  return value;
}

function parseHexBlock(value) {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error("Coston2 RPC returned an invalid block number");
  }
  const block = BigInt(value);
  if (block <= 0n) throw new Error("Coston2 RPC returned an empty block number");
  return block.toString();
}

function parseChainId(value) {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value) || BigInt(value) !== BigInt(COSTON2_CHAIN_ID)) {
    throw new Error("Coston2 RPC returned the wrong chain ID");
  }
  return value.toLowerCase();
}

function explorerApiQuery() {
  const params = new URLSearchParams({
    module: "contract",
    action: "getabi",
    address: FLARE_CONTRACT_REGISTRY,
  });
  return `${COSTON2_EXPLORER_API_URL}?${params}`;
}

function parseExplorerAbiEnvelope(value) {
  if (value.status !== "1" || typeof value.result !== "string") {
    throw new Error("Coston2 Explorer API did not return a successful ABI response");
  }
  let abi;
  try {
    abi = JSON.parse(value.result);
  } catch {
    throw new Error("Coston2 Explorer API returned malformed ABI JSON");
  }
  if (!Array.isArray(abi) || abi.length === 0) {
    throw new Error("Coston2 Explorer API returned an empty ABI");
  }
  return abi.length;
}

export function parsePublicEndpointCLI(argv) {
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

export async function collectPublicEndpointObservation({ fetcher = fetch } = {}) {
  const rpcChainResponse = await fetcher(COSTON2_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
    signal: timeoutSignal(),
  });
  requireStatus(rpcChainResponse, "Coston2 RPC chain-id request");
  const rpcChain = await readJson(rpcChainResponse, "Coston2 RPC chain-id request");
  const chainIdHex = parseChainId(rpcChain.result);

  const rpcBlockResponse = await fetcher(COSTON2_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 2 }),
    signal: timeoutSignal(),
  });
  requireStatus(rpcBlockResponse, "Coston2 RPC block request");
  const rpcBlock = await readJson(rpcBlockResponse, "Coston2 RPC block request");
  const observedBlock = parseHexBlock(rpcBlock.result);

  const explorerResponse = await fetcher(COSTON2_EXPLORER_URL, {
    method: "GET",
    signal: timeoutSignal(),
  });
  requireStatus(explorerResponse, "Coston2 explorer");

  const explorerApiResponse = await fetcher(explorerApiQuery(), {
    method: "GET",
    signal: timeoutSignal(),
  });
  requireStatus(explorerApiResponse, "Coston2 explorer API");
  const explorerAbiItems = parseExplorerAbiEnvelope(await readJson(explorerApiResponse, "Coston2 explorer API"));

  const faucetResponse = await fetcher(COSTON2_FAUCET_URL, {
    method: "GET",
    signal: timeoutSignal(),
  });
  requireStatus(faucetResponse, "Coston2 faucet");

  return {
    chainId: COSTON2_CHAIN_ID,
    chainIdHex,
    observedBlock,
    rpcStatus: rpcChainResponse.status,
    explorerStatus: explorerResponse.status,
    explorerApiStatus: explorerApiResponse.status,
    explorerAbiItems,
    faucetStatus: faucetResponse.status,
  };
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  return value;
}

export function buildPublicEndpointEvidence(observation, recordedAt = new Date().toISOString()) {
  if (observation?.chainId !== COSTON2_CHAIN_ID || observation.chainIdHex !== "0x72") {
    throw new Error("public endpoint evidence must target Coston2 chain 114");
  }
  if (!/^\d+$/.test(observation.observedBlock ?? "") || BigInt(observation.observedBlock) <= 0n) {
    throw new Error("public endpoint evidence block is invalid");
  }
  const rpcStatus = requirePositiveInteger(observation.rpcStatus, "RPC status");
  const explorerStatus = requirePositiveInteger(observation.explorerStatus, "explorer status");
  const explorerApiStatus = requirePositiveInteger(observation.explorerApiStatus, "explorer API status");
  const faucetStatus = requirePositiveInteger(observation.faucetStatus, "faucet status");
  const explorerAbiItems = requirePositiveInteger(observation.explorerAbiItems, "explorer ABI item count");
  for (const [label, status] of Object.entries({ rpcStatus, explorerStatus, explorerApiStatus, faucetStatus })) {
    if (status < 200 || status >= 300) throw new Error(`${label} must be a successful HTTP status`);
  }
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-public-endpoint-reachability",
    status: "observed",
    recordedAt,
    network: {
      name: "flare-coston2",
      chainId: COSTON2_CHAIN_ID,
      rpcUrl: COSTON2_RPC_URL,
      observedBlock: observation.observedBlock,
    },
    publicIdentifiers: {
      rpc: {
        url: COSTON2_RPC_URL,
        statusCode: rpcStatus,
        chainIdHex: observation.chainIdHex,
      },
      explorer: {
        url: COSTON2_EXPLORER_URL,
        statusCode: explorerStatus,
      },
      explorerApi: {
        url: COSTON2_EXPLORER_API_URL,
        statusCode: explorerApiStatus,
        registryAbiItems: explorerAbiItems,
      },
      faucet: {
        url: COSTON2_FAUCET_URL,
        statusCode: faucetStatus,
      },
    },
    assertions: {
      chainIdVerified: true,
      rpcReachable: true,
      explorerReachable: true,
      explorerApiReachable: true,
      explorerApiReturnedRegistryAbi: true,
      faucetPageReachable: true,
      faucetRequestNotSubmitted: true,
      testnetOnly: true,
      noPrivateKeyRecorded: true,
      noCredentialRecorded: true,
      noPayGuardReleaseClaimed: true,
    },
    blockers: [
      "THREE_STABLE_FCC_MACHINE_ORIGINS_NOT_CONFIGURED",
      "FCC_INDEXER_CREDENTIALS_AND_ENDPOINT_NOT_CONFIGURED",
    ],
    notes: [
      "This is a credential-free HTTP/RPC reachability observation, not a faucet grant or PayGuard release.",
      "The Explorer API observation only verifies a public registry ABI response; it is not an FCC machine/indexer path.",
      "No wallet, faucet request, transaction, private policy, or authenticated response was recorded.",
    ],
  };
}

async function writeEvidence(evidence) {
  await mkdir(resolve(PUBLIC_ENDPOINT_EVIDENCE_PATH, ".."), { recursive: true });
  const temporary = `${PUBLIC_ENDPOINT_EVIDENCE_PATH}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
  await rename(temporary, PUBLIC_ENDPOINT_EVIDENCE_PATH);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parsePublicEndpointCLI(process.argv.slice(2));
    const evidence = buildPublicEndpointEvidence(await collectPublicEndpointObservation());
    if (options.write) await writeEvidence(evidence);
    console.log(JSON.stringify({
      status: "ok",
      write: options.write,
      evidencePath: options.write ? "evidence/coston2/coston2-public-endpoint-reachability.json" : undefined,
      observedBlock: evidence.network.observedBlock,
    }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
