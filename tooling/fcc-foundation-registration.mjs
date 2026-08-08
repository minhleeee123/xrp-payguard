import { createHash } from "node:crypto";
import { getAddress, parseAbi, zeroAddress } from "viem";

export const COSTON2_CHAIN_ID = 114;
export const COSTON2_RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";
export const FCC_SCAFFOLD_REPOSITORY = "https://github.com/flare-foundation/fce-extension-scaffold";
export const FCC_SCAFFOLD_COMMIT = "ffb6c4ca7c160c49be59e00fe537e24d2477b000";
export const FCC_DEPLOYMENTS_PATH = "config/coston2/deployed-addresses.json";
export const FCC_DEPLOYMENTS_SHA256 = "c158350ea5a9bbba8c6485a680252b8f401bc2e25ea10830101eb6d0b40b022e";
export const FCC_DEPLOYMENTS_URL =
  `https://raw.githubusercontent.com/flare-foundation/fce-extension-scaffold/${FCC_SCAFFOLD_COMMIT}/${FCC_DEPLOYMENTS_PATH}`;
export const FCC_TEE_MANAGER = getAddress("0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE");
export const FIRST_PUBLIC_EXTENSION_ID = 0x10000n;
export const EVM_KEY_TYPE = `0x${Buffer.from("EVM").toString("hex").padEnd(64, "0")}`;

export const teeManagerRegistrationAbi = parseAbi([
  "event TeeExtensionRegistered(uint256 indexed extensionId, address indexed owner)",
  "event TeeExtensionContractsSet(uint256 indexed extensionId, address indexed teeExtensionStateVerifier, address indexed teeExtensionInstructionsSender)",
  "function nextPublicExtensionId() view returns (uint256)",
  "function allExtensionOwnersAllowed() view returns (bool)",
  "function isAllowedExtensionOwner(address owner) view returns (bool)",
  "function register(address teeExtensionStateVerifier, address teeExtensionInstructionsSender) returns (uint256)",
  "function getTeeExtensionInstructionsSender(uint256 extensionId) view returns (address)",
  "function getTeeExtensionStateVerifier(uint256 extensionId) view returns (address)",
  "function isAllowedTeeMachineOwner(uint256 extensionId, address owner) view returns (bool)",
  "function addAllowedTeeMachineOwners(uint256 extensionId, address[] owners)",
  "function isAllowedTeeWalletProjectOwner(uint256 extensionId, address owner) view returns (bool)",
  "function addAllowedTeeWalletProjectOwners(uint256 extensionId, address[] owners)",
  "function isKeyTypeSupported(uint256 extensionId, bytes32 keyType) view returns (bool)",
  "function addSupportedKeyTypes(uint256 extensionId, bytes32[] keyTypes)",
  "event TeeVersionAdded(uint256 indexed extensionId, bytes32 version, bytes32 indexed codeHash, bytes32[] platforms)",
  "function getExtensionOwner(uint256 extensionId) view returns (address)",
  "function getSystemSupportedPlatforms() view returns (bytes32[])",
  "function getSupportedCodeHashes(uint256 extensionId) view returns (bytes32[])",
  "function getCodeHashInfo(uint256 extensionId, bytes32 codeHash) view returns (bytes32 version, bytes32[] platforms)",
  "function isCodeHashPlatformDisabled(uint256 extensionId, bytes32 codeHash, bytes32 platform) view returns (bool)",
  "function isCodeHashPlatformSupported(uint256 extensionId, bytes32 codeHash, bytes32 platform) view returns (bool)",
  "function addTeeVersion(uint256 extensionId, bytes32 version, bytes32 codeHash, bytes32[] platforms)",
  "event TeeMachineRegistered(address indexed teeId, address indexed teeProxyId, address indexed owner, uint256 extensionId, string url, bytes32 codeHash, bytes32 platform, bytes32 governanceHash)",
  "event TeeMachineStatusChanged(address indexed teeId, uint8 indexed newStatus)",
  "function getTeeMachine(address teeId) view returns ((address teeId, address teeProxyId, string url))",
  "function getTeeMachineWithAttestationData(address teeId) view returns ((address teeId, address initialTeeId, string url, bytes32 codeHash, bytes32 platform))",
  "function getTeeMachineStatus(address teeId) view returns (uint8)",
  "function getTeeMachineOwner(address teeId) view returns (address)",
  "function getExtensionId(address teeId) view returns (uint256)",
  "function getLastStatusChangeTs(address teeId) view returns (uint256)",
]);

const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const hashPattern = /^0x[0-9a-fA-F]{64}$/;
const commitPattern = /^[0-9a-f]{40}$/;
const decimalPattern = /^(0|[1-9][0-9]*)$/;
const privateFieldPattern = /^(?:privateKey|private_key|secret|seed|ciphertext|policyPlaintext|credential|password|mnemonic|signature)$/i;

function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function publicOnly(value, label = "foundation registration") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => publicOnly(entry, `${label}[${index}]`));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (privateFieldPattern.test(key)) throw new Error(`${label} contains forbidden field ${key}`);
    publicOnly(child, `${label}.${key}`);
  }
}

function address(value, label) {
  if (typeof value !== "string" || !addressPattern.test(value) || value.toLowerCase() === zeroAddress) {
    throw new Error(`${label} must be a non-zero address`);
  }
  return getAddress(value);
}

function hash(value, label) {
  if (typeof value !== "string" || !hashPattern.test(value) || /^0x0{64}$/i.test(value)) {
    throw new Error(`${label} must be non-zero bytes32`);
  }
  return value.toLowerCase();
}

function decimal(value, label) {
  if (typeof value !== "string" || !decimalPattern.test(value)) {
    throw new Error(`${label} must be a quoted decimal`);
  }
  return value;
}

export function resolveOfficialTeeManager(bytes, { expectedSha256 = FCC_DEPLOYMENTS_SHA256 } = {}) {
  const contents = typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes);
  const digest = createHash("sha256").update(contents).digest("hex");
  if (digest !== expectedSha256) throw new Error("official FCC deployment source digest mismatch");
  let deployments;
  try {
    deployments = JSON.parse(contents.toString("utf8"));
  } catch (error) {
    throw new Error("official FCC deployment source is not valid JSON", { cause: error });
  }
  if (!Array.isArray(deployments)) throw new Error("official FCC deployment source must be an array");
  const matches = deployments.filter((entry) => entry?.name === "FlareTeeManager");
  if (matches.length !== 1) throw new Error("official FCC deployment source must contain exactly one FlareTeeManager");
  return { address: address(matches[0].address, "official FlareTeeManager"), sha256: digest };
}

export function evaluateFoundationRegistration(input) {
  const assertions = {
    chainIdVerified: input.chainId === COSTON2_CHAIN_ID,
    officialSourceVerified: input.officialSourceVerified === true,
    managerRuntimePresent: input.managerRuntimePresent === true,
    deployerMatchesConfiguredAddress: input.deployerMatchesConfiguredAddress === true,
    deployerHadRegistrationPermission: input.deployerHadRegistrationPermission === true,
    senderDeploymentSucceeded:
      input.senderDeploymentStatus === "success" && input.senderAddress === input.senderReceiptAddress,
    senderRuntimeVerified: input.senderRuntimeVerified === true,
    constructorManagerBindingsVerified: input.constructorManagerBindingsVerified === true,
    extensionRegistrationSucceeded: input.registrationStatus === "success",
    extensionIdIsPublic:
      typeof input.extensionId === "bigint" && input.extensionId >= FIRST_PUBLIC_EXTENSION_ID
        && input.extensionId < input.nextPublicExtensionId,
    extensionOwnerVerified: input.extensionOwner === input.deployer,
    registeredSenderVerified: input.registeredSender === input.senderAddress,
    zeroStateVerifierVerified: input.registeredStateVerifier === zeroAddress,
    senderChainVerified: input.senderChainId === BigInt(COSTON2_CHAIN_ID),
    senderVersionVerified: input.senderVersion === 1,
    senderOwnerVerified: input.senderOwner === input.deployer,
    senderRegistryVerified: input.senderRegistry === input.manager,
    machineRegistryBindingVerified: input.senderMachineRegistry === input.manager,
    extensionIdBindingVerified: input.senderExtensionId === input.extensionId,
    machineOwnerAllowed: input.machineOwnerAllowed === true,
    walletProjectOwnerAllowed: input.walletProjectOwnerAllowed === true,
    evmKeyTypeSupported: input.evmKeyTypeSupported === true,
  };
  return { status: Object.values(assertions).every(Boolean) ? "verified" : "failed", assertions };
}

export function validateFoundationRegistrationState(value, { requireComplete = false } = {}) {
  const state = record(value, "foundation registration state");
  publicOnly(state);
  if (state.schemaVersion !== 1) throw new Error("unsupported foundation registration schema");
  if (state.status !== "in-progress" && state.status !== "verified") throw new Error("invalid foundation registration status");
  if (!commitPattern.test(state.sourceCommit ?? "")) throw new Error("invalid foundation registration source commit");
  const deployer = address(state.deployer, "foundation deployer");
  const network = record(state.network, "foundation network");
  if (network.name !== "flare-coston2" || network.chainId !== COSTON2_CHAIN_ID || network.rpcUrl !== COSTON2_RPC_URL) {
    throw new Error("foundation registration must target the pinned Coston2 network");
  }
  const officialSource = record(state.officialSource, "official FCC source");
  if (
    officialSource.repository !== FCC_SCAFFOLD_REPOSITORY || officialSource.commit !== FCC_SCAFFOLD_COMMIT
      || officialSource.path !== FCC_DEPLOYMENTS_PATH || officialSource.url !== FCC_DEPLOYMENTS_URL
      || officialSource.sha256 !== FCC_DEPLOYMENTS_SHA256
  ) throw new Error("official FCC source pin mismatch");
  const manager = address(officialSource.manager, "FlareTeeManager");
  if (manager !== FCC_TEE_MANAGER) throw new Error("official FlareTeeManager resolution mismatch");
  const artifact = record(state.artifact, "foundation artifact");
  if (artifact.contractName !== "PayGuardFoundationSender") throw new Error("foundation artifact name mismatch");
  hash(artifact.creationCodeHash, "foundation creation code hash");
  if (state.plannedExtensionId !== undefined) decimal(state.plannedExtensionId, "planned extension ID");
  if (state.registrationTransaction !== undefined) {
    hash(state.registrationTransaction, "pending extension registration transaction");
  }

  if (state.sender) {
    const sender = record(state.sender, "foundation sender");
    address(sender.address, "foundation sender address");
    decimal(sender.nonce, "foundation sender nonce");
    if (sender.transactionHash !== undefined) hash(sender.transactionHash, "foundation deployment transaction");
    if (sender.blockNumber !== undefined) decimal(sender.blockNumber, "foundation deployment block");
    if (sender.runtimeCodeHash !== undefined) hash(sender.runtimeCodeHash, "foundation runtime hash");
  }
  if (state.registration) {
    const registration = record(state.registration, "extension registration");
    decimal(registration.extensionId, "extension ID");
    if (BigInt(registration.extensionId) < FIRST_PUBLIC_EXTENSION_ID) throw new Error("extension ID is reserved");
    hash(registration.transactionHash, "extension registration transaction");
    decimal(registration.blockNumber, "extension registration block");
  }
  if (state.configuration) {
    const configuration = record(state.configuration, "extension configuration");
    for (const key of ["binding", "machineOwner", "walletProjectOwner", "evmKeyType"]) {
      if (!configuration[key]) continue;
      const entry = record(configuration[key], `extension configuration ${key}`);
      if (entry.transactionHash) {
        if (entry.source !== "transaction") throw new Error(`${key} configuration source is invalid`);
        hash(entry.transactionHash, `${key} transaction`);
        decimal(entry.blockNumber, `${key} block`);
      } else {
        if (entry.source !== "already-configured") throw new Error(`${key} configuration source is invalid`);
        decimal(entry.observedBlock, `${key} observed block`);
      }
    }
  }
  if (requireComplete) {
    if (!state.sender || !state.registration || !state.configuration) throw new Error("foundation registration is incomplete");
    if (
      !state.sender.transactionHash || !state.sender.blockNumber || !state.sender.runtimeCodeHash
        || state.sender.receiptStatus !== "success" || state.sender.runtimeVerified !== true
        || !Number.isInteger(state.sender.runtimeBytes) || state.sender.runtimeBytes <= 0
        || state.registration.receiptStatus !== "success"
    ) throw new Error("foundation deployment or registration is incomplete");
    for (const key of ["binding", "machineOwner", "walletProjectOwner", "evmKeyType"]) {
      if (!["success", "not-required"].includes(state.configuration[key]?.receiptStatus)) {
        throw new Error(`${key} configuration is incomplete`);
      }
    }
    const assertions = record(state.assertions, "foundation assertions");
    const expectedAssertions = Object.keys(evaluateFoundationRegistration({}).assertions).sort();
    if (
      JSON.stringify(Object.keys(assertions).sort()) !== JSON.stringify(expectedAssertions)
        || Object.values(assertions).some((result) => result !== true)
    ) throw new Error("all exact foundation assertions must pass");
    if (state.status !== "verified" || typeof state.verifiedAt !== "string") throw new Error("foundation registration is not verified");
    decimal(state.observedBlock, "foundation observed block");
  }
  return { state, deployer, manager };
}

export function buildFoundationRegistrationEvidence(state) {
  validateFoundationRegistrationState(state, { requireComplete: true });
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-fcc-foundation-registration",
    status: "registered-bound-configuration-ready",
    recordedAt: state.verifiedAt,
    network: { name: "flare-coston2", chainId: COSTON2_CHAIN_ID, observedBlock: state.observedBlock },
    officialSource: state.officialSource,
    publicIdentifiers: {
      sourceCommit: state.sourceCommit,
      deployer: state.deployer,
      manager: state.officialSource.manager,
      foundationSender: state.sender.address,
      extensionId: state.registration.extensionId,
      deploymentTransaction: state.sender.transactionHash,
      deploymentBlock: state.sender.blockNumber,
      registrationTransaction: state.registration.transactionHash,
      registrationBlock: state.registration.blockNumber,
      runtimeCodeHash: state.sender.runtimeCodeHash,
      bindingTransaction: state.configuration.binding.transactionHash ?? null,
      machineOwnerTransaction: state.configuration.machineOwner.transactionHash ?? null,
      walletProjectOwnerTransaction: state.configuration.walletProjectOwner.transactionHash ?? null,
      evmKeyTypeTransaction: state.configuration.evmKeyType.transactionHash ?? null,
    },
    assertions: {
      ...state.assertions,
      testnetOnly: true,
      noMachineClaimed: true,
      noFccResultClaimed: true,
      noPrivateKeyRecorded: true,
      noCredentialRecorded: true,
    },
    blockers: [
      "CODE_VERSION_NOT_ALLOWED",
      "PRODUCTION_MACHINE_NOT_REGISTERED",
      "LIVE_FCC_FOUNDATION_RESULT_NOT_VERIFIED",
    ],
    notes: [
      "This proves only sender deployment, extension registration, explicit ID binding, owner allowlists, and EVM key-type configuration.",
      "It does not prove a production TEE machine, FCC action result, private policy custody, evaluation, or payment.",
    ],
  };
}
