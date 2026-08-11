import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import {
  ACTION_FTESTXRP_TRANSFER,
  CHAIN_ID,
  NO_FDC_DESCRIPTOR_V1,
  POLICY_SCHEMA_V1,
  ZERO_BYTES32,
  encryptPrivatePolicyForTeeV1,
  policyCommitment,
  policyIngressAuthorizationDigest,
  policyReceiptAttestationDigest,
  policyReceiptDigest,
  teeMachineDescriptorV1,
  type Hex,
  type PolicyBindingV1,
  type PolicyReceiptV1,
  type PolicyV1,
  type TeePublicKeyV1,
} from "../packages/protocol/src/index.js";
import { PayGuardPolicyRegistryAbi } from "../packages/bindings/src/index.js";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  getAddress,
  hexToBytes,
  http,
  isAddress,
  keccak256,
  padHex,
  parseAbi,
  recoverMessageAddress,
  stringToHex,
  toHex,
  type Address,
  type Hash,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const evidencePath = resolve(root, "evidence/coston2/fcc-live-three-machine-custody.json");
const manager = getAddress("0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE");
const extensionId = 66037n;
const ftestXrp = getAddress("0x0b6A3645c240605887a5532109323A3E12273dc7");
const custodyBundleDomain = keccak256(stringToHex("POLICY_CUSTODY_BUNDLE_V1"));
const simulatedPlatform = padHex(stringToHex("TEST_PLATFORM"), { size: 32, dir: "right" });
const defaultOrigins = [
  "https://payguard-fcc-a-production.up.railway.app",
  "https://payguard-fcc-b-production.up.railway.app",
  "https://payguard-fcc-c-production.up.railway.app",
] as const;
const managerAbi = parseAbi([
  "function getTeeMachine(address teeId) view returns ((address teeId,address teeProxyId,string url) machine)",
  "function getTeeMachineWithAttestationData(address teeId) view returns ((address teeId,address initialTeeId,string url,bytes32 codeHash,bytes32 platform) attestation)",
  "function getTeeMachineStatus(address teeId) view returns (uint8 status)",
  "function getExtensionId(address teeId) view returns (uint256 extensionId)",
  "function isCodeHashPlatformSupported(uint256 extensionId,bytes32 codeHash,bytes32 platform) view returns (bool supported)",
  "function isCodeHashPlatformDisabled(uint256 extensionId,bytes32 codeHash,bytes32 platform) view returns (bool disabled)",
]);

interface CLIOptions {
  mode: "plan" | "run" | "freeze";
  writeLivePrivatePolicy: boolean;
  broadcast: boolean;
  origins: readonly [string, string, string];
}

interface InfoResponse {
  teeInfo: { chainId: number; publicKey: TeePublicKeyV1 };
  machineData: { extensionId: Hex; codeHash: Hex; platform: Hex; publicKey: TeePublicKeyV1 };
}

interface HealthResponse {
  status: string;
  machineId: Hex;
  keyFingerprint: Hex;
  signer: Address;
}

interface LiveMachine {
  origin: string;
  teeId: Address;
  machineId: Hex;
  keyFingerprint: Hex;
  signer: Address;
  proxyId: Address;
  publicKey: TeePublicKeyV1;
  codeHash: Hex;
  platform: Hex;
  status: number;
}

interface ReceiptEnvelopeWire {
  receipt: Record<string, unknown>;
  digest: Hex;
  signer: Address;
  signature: Hex;
}

export interface SanitizedCustodyEvidenceInput {
  sourceCommit: string;
  observedBlock: bigint;
  policyCommitment: Hex;
  bundleHash: Hex;
  machines: readonly LiveMachine[];
  receiptDigests: readonly Hex[];
  machineRegistrationTransactions?: readonly Hash[];
  policyFreezeTransaction?: Hash;
  policyFreezeBlock?: bigint;
  recordedAt?: string;
}

function hex32(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} must be bytes32`);
  return value.toLowerCase() as Hex;
}

function address(value: unknown, label: string): Address {
  if (typeof value !== "string" || !isAddress(value)) throw new Error(`${label} must be an address`);
  return getAddress(value);
}

function decimal(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${label} must be a canonical decimal string`);
  return BigInt(value);
}

function exactKeys(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== [...keys].sort().join(",")) throw new Error(`${label} fields are invalid`);
  return record;
}

function sameHex(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function randomHex32(): Hex {
  return `0x${randomBytes(32).toString("hex")}`;
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString(10) : item, 2)}\n`;
}

async function boundedJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`live FCC request failed with HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > 128 * 1024) throw new Error("live FCC response exceeded the public bound");
  return JSON.parse(body);
}

export function parseLiveCustodyCLI(argv: readonly string[]): CLIOptions {
  const [mode, ...tokens] = argv;
  if (mode !== "plan" && mode !== "run" && mode !== "freeze") throw new Error("mode must be plan, run, or freeze");
  const origins: string[] = [];
  let writeLivePrivatePolicy = false;
  let broadcast = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--write-live-private-policy") {
      if (writeLivePrivatePolicy) throw new Error("duplicate live-private-policy acknowledgement");
      writeLivePrivatePolicy = true;
      continue;
    }
    if (token === "--broadcast") {
      if (broadcast) throw new Error("duplicate broadcast acknowledgement");
      broadcast = true;
      continue;
    }
    if (token === "--url" && index + 1 < tokens.length) {
      const origin = new URL(tokens[index + 1]!).origin;
      if (!origin.startsWith("https://") || origin !== tokens[index + 1]) throw new Error("FCC origin must be a bare HTTPS origin");
      origins.push(origin);
      index += 1;
      continue;
    }
    throw new Error(`invalid argument ${token}`);
  }
  if (mode === "plan" && (writeLivePrivatePolicy || broadcast)) throw new Error("plan cannot acknowledge live writes");
  if (mode !== "plan" && !writeLivePrivatePolicy) throw new Error(`${mode} requires --write-live-private-policy`);
  if (mode === "freeze" && !broadcast) throw new Error("freeze requires --broadcast");
  if (mode !== "freeze" && broadcast) throw new Error("--broadcast is accepted only in freeze mode");
  const selected = origins.length === 0 ? [...defaultOrigins] : origins;
  if (selected.length !== 3 || new Set(selected).size !== 3) throw new Error("exactly three distinct FCC origins are required");
  return { mode, writeLivePrivatePolicy, broadcast, origins: selected as [string, string, string] };
}

export function buildSanitizedCustodyEvidence(input: SanitizedCustodyEvidenceInput) {
  if (!/^[0-9a-f]{40}$/.test(input.sourceCommit)) throw new Error("source commit must be a full git hash");
  if (input.machines.length !== 3 || input.receiptDigests.length !== 3) throw new Error("custody evidence requires three machines and receipts");
  if (new Set(input.machines.map((item) => item.teeId.toLowerCase())).size !== 3) throw new Error("machine identities must be distinct");
  if (new Set(input.receiptDigests.map((item) => item.toLowerCase())).size !== 3) throw new Error("receipt digests must be distinct");
  const frozen = Boolean(input.policyFreezeTransaction && input.policyFreezeBlock !== undefined);
  if ((input.policyFreezeTransaction === undefined) !== (input.policyFreezeBlock === undefined)) throw new Error("policy freeze transaction and block must be supplied together");
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-live-simulated-three-machine-custody",
    status: frozen ? "verified-live-simulated-onchain-three-machine-custody" : "verified-live-simulated-three-machine-custody",
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    network: { name: "flare-coston2", chainId: 114, observedBlock: input.observedBlock.toString() },
    publicIdentifiers: {
      verificationSourceCommit: input.sourceCommit,
      manager,
      extensionId: extensionId.toString(),
      policyCommitment: input.policyCommitment,
      custodyBundleHash: input.bundleHash,
      ...(frozen ? {
        machineRegistrationTransactions: input.machineRegistrationTransactions ?? [],
        policyFreezeTransaction: input.policyFreezeTransaction,
        policyFreezeBlock: input.policyFreezeBlock!.toString(),
      } : {}),
      machines: input.machines.map((item, index) => ({
        teeId: item.teeId,
        proxyId: item.proxyId,
        url: item.origin,
        status: item.status,
        receiptDigest: input.receiptDigests[index],
      })),
    },
    assertions: {
      chainIdVerified: true,
      officialManagerVerified: true,
      exactlyThreeDistinctMachinesVerified: true,
      allMachinesStatusTwoVerified: true,
      allOriginsVerified: true,
      independentEncryptionVerified: true,
      ownerAuthorizationVerified: true,
      allThreeReceiptDigestsVerified: true,
      allThreeReceiptSignersVerified: true,
      ciphertextStoreWriteVerified: true,
      restartRecoveryVerified: false,
      onchainPolicyFreezeVerified: frozen,
      liveThresholdEvaluationVerified: false,
      hardwareAttestationVerified: false,
      simulatedTee: true,
      noPrivateKeyRecorded: true,
      noCredentialRecorded: true,
      noPolicyRecorded: true,
      noCiphertextRecorded: true,
      noSignatureRecorded: true,
      testnetOnly: true,
    },
    blockers: [
      "HARDWARE_ATTESTATION_NOT_VERIFIED",
      ...(frozen ? [] : ["ONCHAIN_POLICY_FREEZE_NOT_YET_VERIFIED"]),
      "TWO_OF_THREE_LIVE_EVALUATION_NOT_YET_VERIFIED",
    ],
    notes: [
      "Organizer-approved SIMULATED_TEE=true was used on Coston2.",
      "The private policy, three ciphertexts, owner authorizations, and machine signatures existed only in process memory and are excluded from public evidence.",
      ...(frozen ? ["The on-chain freeze uses the deployed V1 administrator mapping; official-manager authorization remains a V2 release blocker."] : []),
    ],
  };
}

function policyFor(owner: Address, now: bigint, registry: Address, vault: Address, router: Address): PolicyV1 {
  return {
    schemaVersion: 1,
    chainId: CHAIN_ID,
    registry,
    vault,
    router,
    owner,
    policyId: randomHex32(),
    policyVersion: 1,
    asset: ftestXrp,
    referenceCurrency: padHex(stringToHex("USD"), { size: 32 }),
    maxPerAction: 100_000n,
    dailyCap: 500_000n,
    rollingCap: 500_000n,
    rollingWindowSeconds: 86_400n,
    startAt: now - 60n,
    endAt: now + 30n * 86_400n,
    scheduleIntervalSeconds: 86_400n,
    scheduleGraceSeconds: 3_600n,
    cooldownSeconds: 0n,
    maxOccurrences: 30,
    allowTargets: [owner],
    denyTargets: [],
    allowRequesters: [owner],
    allowActionTypes: [ACTION_FTESTXRP_TRANSFER],
    requireFtso: false,
    ftsoFeedId: ZERO_BYTES32,
    maxPriceAgeSeconds: 0n,
    ...NO_FDC_DESCRIPTOR_V1,
    privateSalt: randomHex32(),
    submissionNonce: randomHex32(),
  };
}

function bindingFor(policy: PolicyV1, machines: readonly LiveMachine[]): PolicyBindingV1 {
  if (machines.length !== 3) throw new Error("three machines are required");
  const nonce = BigInt(`0x${policy.submissionNonce.slice(2, 18)}`) || 1n;
  return {
    chainId: policy.chainId,
    registry: policy.registry,
    vault: policy.vault,
    router: policy.router,
    owner: policy.owner,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyCommitment: policyCommitment(policy),
    schema: POLICY_SCHEMA_V1,
    extensionId: padHex(toHex(extensionId), { size: 32 }),
    codeVersion: machines[0]!.codeHash,
    machineIds: machines.map((item) => item.machineId) as [Hex, Hex, Hex],
    keyFingerprints: machines.map((item) => item.keyFingerprint) as [Hex, Hex, Hex],
    custodyThreshold: 3,
    resultThreshold: 2,
    policyNonce: nonce,
  };
}

function parseReceipt(value: unknown, binding: PolicyBindingV1): { receipt: PolicyReceiptV1; digest: Hex; signer: Address; signature: Hex } {
  const envelope = exactKeys(value, ["receipt", "digest", "signer", "signature"], "receipt envelope") as unknown as ReceiptEnvelopeWire;
  const wire = exactKeys(envelope.receipt, [
    "binding", "machineId", "keyFingerprint", "submissionNonce", "receiptNonce", "issuedAt", "expiry",
  ], "receipt");
  const receipt: PolicyReceiptV1 = {
    binding,
    machineId: hex32(wire.machineId, "receipt.machineId"),
    keyFingerprint: hex32(wire.keyFingerprint, "receipt.keyFingerprint"),
    submissionNonce: hex32(wire.submissionNonce, "receipt.submissionNonce"),
    receiptNonce: decimal(wire.receiptNonce, "receipt.receiptNonce"),
    issuedAt: decimal(wire.issuedAt, "receipt.issuedAt"),
    expiry: decimal(wire.expiry, "receipt.expiry"),
  };
  const digest = hex32(envelope.digest, "receipt digest");
  const signature = envelope.signature;
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error("receipt signature must be 65 bytes");
  if (!sameHex(digest, policyReceiptDigest(receipt))) throw new Error("receipt digest mismatch");
  return { receipt, digest, signer: address(envelope.signer, "receipt signer"), signature };
}

async function machineFor(origin: string, client: ReturnType<typeof createPublicClient>): Promise<LiveMachine> {
  const [rawInfo, rawHealth] = await Promise.all([
    boundedJson(`${origin}/info`),
    boundedJson(`${origin}/private/health`),
  ]);
  const info = rawInfo as InfoResponse;
  const health = rawHealth as HealthResponse;
  if (info?.teeInfo?.chainId !== 114 || !info.machineData || !info.teeInfo.publicKey) throw new Error("FCC /info is outside Coston2");
  if (!sameHex(info.teeInfo.publicKey.x, info.machineData.publicKey.x) || !sameHex(info.teeInfo.publicKey.y, info.machineData.publicKey.y)) {
    throw new Error("FCC public-key views disagree");
  }
  const descriptor = teeMachineDescriptorV1(info.teeInfo.publicKey);
  if (health.status !== "ready" || !sameHex(health.machineId, descriptor.machineId)
    || !sameHex(health.keyFingerprint, descriptor.keyFingerprint)
    || getAddress(health.signer) !== getAddress(descriptor.signer)) throw new Error("private ingress identity does not match /info");
  if (BigInt(info.machineData.extensionId) !== extensionId) throw new Error("FCC machine extension mismatch");
  const teeId = getAddress(descriptor.signer);
  const [registered, attestation, status, registeredExtension, supported, disabled] = await Promise.all([
    client.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachine", args: [teeId] }),
    client.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineWithAttestationData", args: [teeId] }),
    client.readContract({ address: manager, abi: managerAbi, functionName: "getTeeMachineStatus", args: [teeId] }),
    client.readContract({ address: manager, abi: managerAbi, functionName: "getExtensionId", args: [teeId] }),
    client.readContract({ address: manager, abi: managerAbi, functionName: "isCodeHashPlatformSupported", args: [extensionId, info.machineData.codeHash, info.machineData.platform] }),
    client.readContract({ address: manager, abi: managerAbi, functionName: "isCodeHashPlatformDisabled", args: [extensionId, info.machineData.codeHash, info.machineData.platform] }),
  ]);
  // Organizer-supported simulated registrations expose TEST_PLATFORM and a
  // zero initialTeeId; hardware candidates must use the separate admission and
  // release pipeline instead of being silently accepted by this runner.
  if (Number(status) !== 2 || registeredExtension !== extensionId || !supported || disabled
    || getAddress(registered.teeId) !== teeId || getAddress(attestation.teeId) !== teeId
    || getAddress(attestation.initialTeeId) !== zeroAddress || registered.url !== origin || attestation.url !== origin
    || !sameHex(attestation.platform, simulatedPlatform)
    || !sameHex(attestation.codeHash, info.machineData.codeHash) || !sameHex(attestation.platform, info.machineData.platform)) {
    throw new Error("FCC official-manager readback mismatch");
  }
  return {
    origin,
    teeId,
    machineId: descriptor.machineId,
    keyFingerprint: descriptor.keyFingerprint,
    signer: getAddress(descriptor.signer),
    proxyId: getAddress(registered.teeProxyId),
    publicKey: info.teeInfo.publicKey,
    codeHash: hex32(info.machineData.codeHash, "code hash"),
    platform: hex32(info.machineData.platform, "platform"),
    status: Number(status),
  };
}

function loadAccountAndDomain() {
  try { process.loadEnvFile(resolve(root, ".env.local")); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const key = process.env.PAYGUARD_DEPLOYER_PRIVATE_KEY;
  const configured = process.env.PAYGUARD_DEPLOYER_ADDRESS;
  const registry = process.env.PAYGUARD_POLICY_REGISTRY_ADDRESS;
  const vault = process.env.PAYGUARD_VAULT_ADDRESS;
  const router = process.env.PAYGUARD_ACTION_ROUTER_ADDRESS;
  const rpc = process.env.COSTON2_RPC_URL ?? "https://coston2-api.flare.network/ext/C/rpc";
  if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? "") || !isAddress(configured ?? "")
    || !isAddress(registry ?? "") || !isAddress(vault ?? "") || !isAddress(router ?? "")) {
    throw new Error("dedicated PayGuard owner/domain configuration is missing or malformed");
  }
  const account = privateKeyToAccount(key as Hex);
  if (account.address !== getAddress(configured!)) throw new Error("configured PayGuard owner does not match its key");
  return { account, registry: getAddress(registry!), vault: getAddress(vault!), router: getAddress(router!), rpc };
}

async function freezePolicyOnchain(
  client: ReturnType<typeof createPublicClient>,
  rpc: string,
  account: ReturnType<typeof privateKeyToAccount>,
  registry: Address,
  binding: PolicyBindingV1,
  machines: readonly LiveMachine[],
  receipts: readonly { receipt: PolicyReceiptV1; signature: Hex }[],
): Promise<{ machineRegistrationTransactions: Hash[]; policyFreezeTransaction: Hash; policyFreezeBlock: bigint }> {
  const chain = {
    id: 114,
    name: "Flare Coston2",
    nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  } as const;
  if (await client.getBalance({ address: account.address }) < 50_000_000_000_000_000n) throw new Error("owner gas balance is below the custody-freeze safety buffer");
  const wallet = createWalletClient({ account, chain, transport: http(rpc, { timeout: 15_000, retryCount: 2 }) });
  const machineRegistrationTransactions: Hash[] = [];
  for (const machine of machines) {
    const current = await client.readContract({ address: registry, abi: PayGuardPolicyRegistryAbi, functionName: "machine", args: [machine.machineId] });
    if (current[2]) {
      if (getAddress(current[0]) !== machine.signer || !sameHex(current[1], machine.keyFingerprint)) throw new Error("V1 machine registration conflicts with the live identity");
      continue;
    }
    const simulation = await client.simulateContract({
      account: account.address,
      address: registry,
      abi: PayGuardPolicyRegistryAbi,
      functionName: "registerMachine",
      args: [machine.machineId, machine.keyFingerprint, machine.signer],
    });
    const transaction = await wallet.writeContract({ ...simulation.request, account, chain });
    const receipt = await client.waitForTransactionReceipt({ hash: transaction, confirmations: 2, timeout: 180_000 });
    if (receipt.status !== "success") throw new Error("V1 machine registration reverted");
    machineRegistrationTransactions.push(transaction);
  }
  const receiptArguments = receipts.map((item) => ({
    machineId: item.receipt.machineId,
    keyFingerprint: item.receipt.keyFingerprint,
    submissionNonce: item.receipt.submissionNonce,
    receiptNonce: item.receipt.receiptNonce,
    issuedAt: item.receipt.issuedAt,
    expiry: item.receipt.expiry,
    signature: item.signature,
  })) as [
    { machineId: Hex; keyFingerprint: Hex; submissionNonce: Hex; receiptNonce: bigint; issuedAt: bigint; expiry: bigint; signature: Hex },
    { machineId: Hex; keyFingerprint: Hex; submissionNonce: Hex; receiptNonce: bigint; issuedAt: bigint; expiry: bigint; signature: Hex },
    { machineId: Hex; keyFingerprint: Hex; submissionNonce: Hex; receiptNonce: bigint; issuedAt: bigint; expiry: bigint; signature: Hex },
  ];
  const simulation = await client.simulateContract({
    account: account.address,
    address: registry,
    abi: PayGuardPolicyRegistryAbi,
    functionName: "registerPolicy",
    args: [binding, receiptArguments],
  });
  const policyFreezeTransaction = await wallet.writeContract({ ...simulation.request, account, chain });
  const freezeReceipt = await client.waitForTransactionReceipt({ hash: policyFreezeTransaction, confirmations: 2, timeout: 180_000 });
  if (freezeReceipt.status !== "success") throw new Error("V1 policy freeze reverted");
  const [stored, status] = await client.readContract({ address: registry, abi: PayGuardPolicyRegistryAbi, functionName: "getPolicy", args: [binding.policyCommitment] });
  if (Number(status) !== 1 || !sameHex(stored.policyCommitment, binding.policyCommitment)
    || getAddress(stored.owner) !== getAddress(binding.owner)
    || stored.machineIds.some((item, index) => !sameHex(item, binding.machineIds[index]!))) throw new Error("V1 policy freeze readback mismatch");
  return { machineRegistrationTransactions, policyFreezeTransaction, policyFreezeBlock: freezeReceipt.blockNumber };
}

async function cleanSourceCommit(): Promise<string> {
  const [{ stdout: status }, { stdout: commit }] = await Promise.all([
    execFileAsync("git", ["status", "--porcelain=v1"], { cwd: root }),
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root }),
  ]);
  if (status.trim()) throw new Error("live custody evidence requires a clean source commit");
  const value = commit.trim();
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error("unable to resolve source commit");
  return value;
}

async function writeEvidence(value: unknown): Promise<void> {
  await mkdir(resolve(root, "evidence/coston2"), { recursive: true });
  const temporary = `${evidencePath}.${process.pid}.tmp`;
  await writeFile(temporary, serialize(value), { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, evidencePath);
}

async function run(options: CLIOptions): Promise<void> {
  if (options.mode === "plan") {
    console.log(JSON.stringify({
      status: "planned",
      network: "flare-coston2",
      extensionId: extensionId.toString(),
      origins: options.origins,
      writes: ["three independently encrypted private-policy blobs", evidencePath],
      broadcasts: false,
      caveat: "SIMULATED_TEE custody is not hardware attestation, on-chain policy freeze, or threshold evaluation",
    }, null, 2));
    return;
  }
  const sourceCommit = await cleanSourceCommit();
  const { account, registry, vault, router, rpc } = loadAccountAndDomain();
  const client = createPublicClient({ transport: http(rpc, { timeout: 15_000, retryCount: 2 }) });
  if (await client.getChainId() !== 114) throw new Error("RPC is not Coston2");
  const machines = await Promise.all(options.origins.map((origin) => machineFor(origin, client)));
  if (new Set(machines.map((item) => item.teeId.toLowerCase())).size !== 3
    || new Set(machines.map((item) => item.keyFingerprint.toLowerCase())).size !== 3
    || new Set(machines.map((item) => item.codeHash.toLowerCase())).size !== 1) throw new Error("FCC custody set is not compatible and distinct");
  const now = BigInt(Math.floor(Date.now() / 1000));
  const policy = policyFor(account.address, now, registry, vault, router);
  const binding = bindingFor(policy, machines);
  const issuedAt = now;
  const expiry = now + 15n * 60n;
  const receipts: Array<{ receipt: PolicyReceiptV1; digest: Hex; signer: Address; signature: Hex }> = [];
  for (const machine of machines) {
    const ciphertext = await encryptPrivatePolicyForTeeV1(policy, machine.publicKey);
    const authorizationDigest = policyIngressAuthorizationDigest({
      binding,
      submissionNonce: policy.submissionNonce,
      issuedAt,
      expiry,
      ciphertextHash: keccak256(ciphertext),
      machineId: machine.machineId,
      keyFingerprint: machine.keyFingerprint,
    });
    const authorization = await account.signMessage({ message: { raw: authorizationDigest } });
    const rawReceipt = await boundedJson(`${machine.origin}/private/ingress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: serialize({
        binding,
        submissionNonce: policy.submissionNonce,
        issuedAt,
        expiry,
        ciphertext: Buffer.from(hexToBytes(ciphertext)).toString("base64"),
        authorization,
      }),
    });
    const parsed = parseReceipt(rawReceipt, binding);
    if (!sameHex(parsed.receipt.machineId, machine.machineId)
      || !sameHex(parsed.receipt.keyFingerprint, machine.keyFingerprint)
      || !sameHex(parsed.receipt.submissionNonce, policy.submissionNonce)
      || parsed.receipt.receiptNonce !== binding.policyNonce
      || parsed.receipt.issuedAt !== issuedAt || parsed.receipt.expiry !== expiry) throw new Error("live receipt binding mismatch");
    const recovered = await recoverMessageAddress({ message: { raw: policyReceiptAttestationDigest(parsed.receipt) }, signature: parsed.signature });
    if (getAddress(recovered) !== machine.signer || parsed.signer !== machine.signer) throw new Error("live receipt signer mismatch");
    receipts.push(parsed);
  }
  if (new Set(receipts.map((item) => item.digest.toLowerCase())).size !== 3) throw new Error("live receipt digests are not distinct");
  const receiptDigests = receipts.map((item) => item.digest) as [Hex, Hex, Hex];
  const bundleHash = keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32[3]" }],
    [custodyBundleDomain, receiptDigests],
  ));
  const observedBlock = await client.getBlockNumber();
  const freeze = options.mode === "freeze"
    ? await freezePolicyOnchain(client, rpc, account, registry, binding, machines, receipts)
    : undefined;
  const finalObservedBlock = freeze?.policyFreezeBlock ?? observedBlock;
  const evidence = buildSanitizedCustodyEvidence({
    sourceCommit,
    observedBlock: finalObservedBlock,
    policyCommitment: binding.policyCommitment,
    bundleHash,
    machines,
    receiptDigests,
    ...(freeze ?? {}),
  });
  await writeEvidence(evidence);
  console.log(JSON.stringify({
    status: evidence.status,
    observedBlock: finalObservedBlock.toString(),
    policyCommitment: binding.policyCommitment,
    custodyBundleHash: bundleHash,
    machineCount: machines.length,
    receiptCount: receipts.length,
    onchainPolicyFreezeVerified: Boolean(freeze),
    ...(freeze ? { policyFreezeTransaction: freeze.policyFreezeTransaction } : {}),
    evidencePath,
    privateMaterialRecorded: false,
  }));
}

if (import.meta.url === new URL(process.argv[1]!, "file:").href) {
  run(parseLiveCustodyCLI(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "live custody failed");
    process.exitCode = 1;
  });
}
