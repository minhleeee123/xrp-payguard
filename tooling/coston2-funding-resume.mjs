import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createPublicClient,
  decodeAbiParameters,
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  http,
  isAddress,
  keccak256,
  zeroAddress,
  zeroHash,
} from "viem";
import { COSTON2_CHAIN_ID, COSTON2_RPC_URL } from "./fcc-foundation-registration.mjs";
import { FLARE_CONTRACT_REGISTRY } from "./coston2-dependency-resolution.mjs";

const root = resolve(import.meta.dirname, "..");
export const FUNDING_REFERENCE_PATH = resolve(root, "evidence/coston2/xrp-fdc-smart-account-funding-2026-08-09.json");
export const FUNDING_RESUME_EVIDENCE_PATH = resolve(root, "evidence/coston2/coston2-funding-resume-audit-2026-08-09.json");
const versions = JSON.parse(await readFile(resolve(root, "tooling/versions.json"), "utf8"));
export const XRPL_TESTNET_RPC_URL = versions.networks.xrplTestnet.rpc;
const require = createRequire(import.meta.url);
const { isValidClassicAddress } = require("../packages/integrations/node_modules/xrpl");

const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_PUBLIC_BYTES = 131_072;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;

const XRPL_PAYMENT_PROOF_COMPONENT = {
  type: "tuple",
  name: "_payment",
  components: [
    { name: "merkleProof", type: "bytes32[]" },
    {
      name: "data",
      type: "tuple",
      components: [
        { name: "attestationType", type: "bytes32" },
        { name: "sourceId", type: "bytes32" },
        { name: "votingRound", type: "uint64" },
        { name: "lowestUsedTimestamp", type: "uint64" },
        { name: "requestBody", type: "tuple", components: [
          { name: "transactionId", type: "bytes32" },
          { name: "proofOwner", type: "address" },
        ] },
        { name: "responseBody", type: "tuple", components: [
          { name: "blockNumber", type: "uint64" },
          { name: "blockTimestamp", type: "uint64" },
          { name: "sourceAddress", type: "string" },
          { name: "sourceAddressHash", type: "bytes32" },
          { name: "receivingAddressHash", type: "bytes32" },
          { name: "intendedReceivingAddressHash", type: "bytes32" },
          { name: "spentAmount", type: "int256" },
          { name: "intendedSpentAmount", type: "int256" },
          { name: "receivedAmount", type: "int256" },
          { name: "intendedReceivedAmount", type: "int256" },
          { name: "hasMemoData", type: "bool" },
          { name: "firstMemoData", type: "bytes" },
          { name: "hasDestinationTag", type: "bool" },
          { name: "destinationTag", type: "uint256" },
          { name: "status", type: "uint8" },
        ] },
      ],
    },
  ],
};

export const DIRECT_MINT_RESUME_ABI = [{
  type: "function",
  name: "executeDirectMintingWithData",
  stateMutability: "payable",
  inputs: [XRPL_PAYMENT_PROOF_COMPONENT, { name: "_data", type: "bytes" }],
  outputs: [],
}];

export const FDC_XRPL_VERIFICATION_ABI = [{
  type: "function",
  name: "verifyXRPPayment",
  stateMutability: "view",
  inputs: [{ ...XRPL_PAYMENT_PROOF_COMPONENT, name: "_proof" }],
  outputs: [{ name: "_proved", type: "bool" }],
}];

const PACKED_USER_OPERATION_PARAMETER = [{ type: "tuple", components: [
  { name: "sender", type: "address" },
  { name: "nonce", type: "uint256" },
  { name: "initCode", type: "bytes" },
  { name: "callData", type: "bytes" },
  { name: "accountGasLimits", type: "bytes32" },
  { name: "preVerificationGas", type: "uint256" },
  { name: "gasFees", type: "bytes32" },
  { name: "paymasterAndData", type: "bytes" },
  { name: "signature", type: "bytes" },
] }];

const PERSONAL_ACCOUNT_EXECUTE_ABI = [{
  type: "function",
  name: "executeUserOp",
  stateMutability: "nonpayable",
  inputs: [{ name: "_calls", type: "tuple[]", components: [
    { name: "target", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
  ] }],
  outputs: [],
}];

const VAULT_ABI = [
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [
    { name: "asset", type: "address" }, { name: "amount", type: "uint256" }, { name: "beneficiary", type: "address" },
  ], outputs: [] },
  { type: "function", name: "accounting", stateMutability: "view", inputs: [
    { name: "owner", type: "address" }, { name: "asset", type: "address" },
  ], outputs: [{ name: "result", type: "tuple", components: [
    { name: "deposited", type: "uint256" }, { name: "available", type: "uint256" },
    { name: "reserved", type: "uint256" }, { name: "spent", type: "uint256" },
    { name: "withdrawn", type: "uint256" }, { name: "refunded", type: "uint256" },
  ] }] },
  { type: "event", name: "Deposited", inputs: [
    { name: "owner", type: "address", indexed: true }, { name: "asset", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
  ], anonymous: false },
];

const ERC20_APPROVE_ABI = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [
  { name: "spender", type: "address" }, { name: "amount", type: "uint256" },
], outputs: [{ name: "success", type: "bool" }] }];

const REGISTRY_ABI = [{ type: "function", name: "getContractAddressByName", stateMutability: "view", inputs: [
  { name: "name", type: "string" },
], outputs: [{ name: "contractAddress", type: "address" }] }];

const ASSET_MANAGER_ABI = [
  { type: "function", name: "fAsset", stateMutability: "view", inputs: [], outputs: [{ name: "asset", type: "address" }] },
  { type: "function", name: "getDirectMintingFeeBIPS", stateMutability: "view", inputs: [], outputs: [{ name: "feeBIPS", type: "uint256" }] },
  { type: "function", name: "getDirectMintingMinimumFeeUBA", stateMutability: "view", inputs: [], outputs: [{ name: "minimumFeeUBA", type: "uint256" }] },
  { type: "function", name: "directMintingPaymentAddress", stateMutability: "view", inputs: [], outputs: [{ name: "paymentAddress", type: "string" }] },
];

const MASTER_ACCOUNT_CONTROLLER_ABI = [{ type: "function", name: "getNonce", stateMutability: "view", inputs: [
  { name: "personalAccount", type: "address" },
], outputs: [{ name: "nonce", type: "uint256" }] }];

function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} is malformed`);
  return value;
}

function address(value, label) {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) throw new Error(`${label} is invalid`);
  return getAddress(value);
}

function bytes(value, label, exactBytes) {
  if (typeof value !== "string" || !HEX_BYTES.test(value) || (value.length - 2) / 2 > MAX_PUBLIC_BYTES
    || (exactBytes !== undefined && (value.length - 2) / 2 !== exactBytes)) throw new Error(`${label} is malformed`);
  return value.toLowerCase();
}

function bytes32(value, label) {
  const normalized = bytes(value, label, 32);
  if (normalized === zeroHash) throw new Error(`${label} is zero`);
  return normalized;
}

function uint(value, label) {
  if (typeof value !== "bigint" || value < 0n || value > MAX_UINT256) throw new Error(`${label} is invalid`);
  return value;
}

function decimal(value, label) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${label} is malformed`);
  return BigInt(value);
}

function equalAddress(actual, expected, label) {
  if (address(actual, label) !== address(expected, `expected ${label}`)) throw new Error(`${label} drift`);
}

function equalHex(actual, expected, label) {
  if (bytes(actual, label).toLowerCase() !== bytes(expected, `expected ${label}`).toLowerCase()) throw new Error(`${label} drift`);
}

function chainClient() {
  const chain = { id: COSTON2_CHAIN_ID, name: "Flare Coston2", nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 }, rpcUrls: { default: { http: [COSTON2_RPC_URL] } } };
  return createPublicClient({ chain, transport: http(COSTON2_RPC_URL, { timeout: 15_000, retryCount: 2 }) });
}

async function xrplRequest(request, fetcher = fetch) {
  const response = await fetcher(XRPL_TESTNET_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method: request.command, params: [{ ...request, command: undefined }] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 200 || !(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    throw new Error("XRPL public read unavailable");
  }
  return response.json();
}

function normalizeReference(value) {
  const rootValue = record(value, "funding reference");
  const identifiers = record(rootValue.publicIdentifiers, "funding reference identifiers");
  const xrpl = record(identifiers.xrpl, "XRPL funding reference");
  const fdc = record(identifiers.fdc, "FDC funding reference");
  const directMint = record(identifiers.directMint, "direct-mint funding reference");
  if (xrpl.network !== "xrpl-testnet" || directMint.status !== "success") throw new Error("funding reference status is invalid");
  return {
    xrplTransactionHash: bytes32(xrpl.transactionHash, "XRPL transaction hash"),
    xrplLedgerIndex: decimal(xrpl.ledgerIndex, "XRPL ledger index"),
    xrplDestination: xrpl.destination,
    receivedAmountUBA: decimal(xrpl.receivedAmountDrops, "XRPL received amount"),
    fdcRequestTransactionHash: bytes32(fdc.requestTransactionHash, "FDC request transaction hash"),
    votingRound: decimal(fdc.votingRound, "FDC voting round"),
    proofCommitment: bytes32(fdc.proofCommitment, "FDC proof commitment"),
    directMintTransactionHash: bytes32(directMint.transactionHash, "direct-mint transaction hash"),
    directMintBlock: decimal(directMint.block, "direct-mint block"),
    executor: address(directMint.executor, "direct-mint executor"),
    assetManager: address(directMint.assetManager, "AssetManager"),
    fAsset: address(directMint.fTestXrp, "FAsset"),
    vault: address(directMint.payGuardVault, "PayGuard vault"),
    depositedUBA: decimal(directMint.depositedUBA, "deposited UBA"),
  };
}

function parseXrplPayment(payload, reference) {
  const envelope = record(payload, "XRPL response");
  const result = record(envelope.result, "XRPL result");
  if (result.status !== "success" || result.validated !== true) throw new Error("XRPL payment is not validated");
  const transaction = record(result.tx_json, "XRPL transaction");
  const meta = record(result.meta, "XRPL metadata");
  if (transaction.TransactionType !== "Payment" || meta.TransactionResult !== "tesSUCCESS") throw new Error("XRPL payment failed");
  const hash = bytes32(`0x${String(result.hash ?? "")}`, "XRPL response hash");
  equalHex(hash, reference.xrplTransactionHash, "XRPL transaction hash");
  const ledgerIndex = typeof result.ledger_index === "number" && Number.isSafeInteger(result.ledger_index)
    ? BigInt(result.ledger_index) : decimal(result.ledger_index, "XRPL response ledger");
  if (ledgerIndex !== reference.xrplLedgerIndex) throw new Error("XRPL ledger drift");
  if (!isValidClassicAddress(transaction.Account) || !isValidClassicAddress(transaction.Destination)) throw new Error("XRPL account is malformed");
  if (transaction.Destination !== reference.xrplDestination) throw new Error("XRPL destination drift");
  const delivered = typeof meta.delivered_amount === "string" ? decimal(meta.delivered_amount, "XRPL delivered amount") : -1n;
  if (delivered !== reference.receivedAmountUBA) throw new Error("XRPL delivered amount drift");
  if (!Array.isArray(transaction.Memos) || transaction.Memos.length !== 1) throw new Error("XRPL memo count drift");
  const memoData = record(record(transaction.Memos[0], "XRPL memo").Memo, "XRPL memo body").MemoData;
  if (typeof memoData !== "string") throw new Error("XRPL memo is malformed");
  const memo = bytes(memoData.startsWith("0x") ? memoData : `0x${memoData}`, "XRPL memo", 42);
  if (!memo.startsWith("0xfe")) throw new Error("XRPL memo opcode drift");
  return { hash, ledgerIndex, source: transaction.Account, destination: transaction.Destination, deliveredAmountUBA: delivered, memo };
}

function decodeOperation(userOperationData, memo, reference) {
  const data = bytes(userOperationData, "PackedUserOperation");
  const operationHash = keccak256(data);
  equalHex(operationHash, `0x${memo.slice(22)}`, "PackedUserOperation hash");
  const walletId = Number.parseInt(memo.slice(4, 6), 16);
  const executorFeeUBA = BigInt(`0x${memo.slice(6, 22)}`);
  const [packed] = decodeAbiParameters(PACKED_USER_OPERATION_PARAMETER, data);
  const userOperation = record(packed, "PackedUserOperation tuple");
  const sender = address(userOperation.sender, "personal account");
  const nonce = uint(userOperation.nonce, "user operation nonce");
  if (bytes(userOperation.initCode, "user operation initCode") !== "0x"
    || bytes(userOperation.paymasterAndData, "user operation paymaster") !== "0x"
    || bytes(userOperation.signature, "user operation signature") !== "0x"
    || userOperation.accountGasLimits !== zeroHash || userOperation.gasFees !== zeroHash
    || userOperation.preVerificationGas !== 0n) throw new Error("PackedUserOperation public fields drift");
  const decodedCall = decodeFunctionData({ abi: PERSONAL_ACCOUNT_EXECUTE_ABI, data: bytes(userOperation.callData, "personal-account calldata") });
  if (decodedCall.functionName !== "executeUserOp" || !Array.isArray(decodedCall.args?.[0]) || decodedCall.args[0].length === 0 || decodedCall.args[0].length > 64) {
    throw new Error("personal-account operation is malformed");
  }
  let totalCallValue = 0n;
  let approval;
  let deposit;
  for (const candidate of decodedCall.args[0]) {
    const call = record(candidate, "personal-account call");
    const target = address(call.target, "personal-account call target");
    const value = uint(call.value, "personal-account call value");
    totalCallValue += value;
    if (totalCallValue > MAX_UINT256) throw new Error("personal-account call value overflow");
    const callData = bytes(call.data, "personal-account inner calldata");
    if (target === reference.fAsset) {
      const decoded = decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: callData });
      if (decoded.functionName !== "approve") throw new Error("FAsset operation drift");
      approval = { spender: address(decoded.args[0], "approval spender"), amount: uint(decoded.args[1], "approval amount") };
    } else if (target === reference.vault) {
      const decoded = decodeFunctionData({ abi: VAULT_ABI, data: callData });
      if (decoded.functionName !== "deposit") throw new Error("PayGuard vault operation drift");
      deposit = { asset: address(decoded.args[0], "deposit asset"), amount: uint(decoded.args[1], "deposit amount"), beneficiary: address(decoded.args[2], "deposit beneficiary") };
    } else {
      throw new Error("unexpected personal-account call target");
    }
  }
  if (!approval || !deposit || decodedCall.args[0].length !== 2) throw new Error("approve/deposit operation pair is incomplete");
  equalAddress(approval.spender, reference.vault, "approval spender");
  equalAddress(deposit.asset, reference.fAsset, "deposit asset");
  if (approval.amount !== reference.depositedUBA || deposit.amount !== reference.depositedUBA) throw new Error("deposit amount drift");
  return { operationHash, walletId, executorFeeUBA, sender, nonce, callCount: 2, totalCallValue, deposit };
}

function findDepositEvent(receipt, reference, operation) {
  for (const log of receipt.logs ?? []) {
    if (typeof log.address !== "string" || getAddress(log.address) !== reference.vault) continue;
    try {
      const event = decodeEventLog({ abi: VAULT_ABI, data: log.data, topics: log.topics, strict: true });
      if (event.eventName !== "Deposited") continue;
      equalAddress(event.args.owner, operation.deposit.beneficiary, "deposit event owner");
      equalAddress(event.args.asset, reference.fAsset, "deposit event asset");
      if (event.args.amount !== reference.depositedUBA) throw new Error("deposit event amount drift");
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes("drift")) throw error;
    }
  }
  throw new Error("PayGuard deposit event missing");
}

export function decodeHistoricalFundingArtifacts({ transaction, receipt, xrplPayload, reference: rawReference }) {
  const reference = normalizeReference(rawReference);
  if (!transaction || !receipt) throw new Error("direct-mint transaction or receipt unavailable");
  equalHex(transaction.hash, reference.directMintTransactionHash, "direct-mint transaction hash");
  equalHex(receipt.transactionHash, reference.directMintTransactionHash, "direct-mint receipt hash");
  equalAddress(transaction.from, reference.executor, "direct-mint executor");
  equalAddress(receipt.from, reference.executor, "receipt executor");
  equalAddress(transaction.to, reference.assetManager, "direct-mint AssetManager");
  equalAddress(receipt.to, reference.assetManager, "receipt AssetManager");
  if (transaction.blockNumber !== reference.directMintBlock || receipt.blockNumber !== reference.directMintBlock || receipt.status !== "success") {
    throw new Error("direct-mint receipt checkpoint drift");
  }
  const decoded = decodeFunctionData({ abi: DIRECT_MINT_RESUME_ABI, data: bytes(transaction.input, "direct-mint calldata") });
  if (decoded.functionName !== "executeDirectMintingWithData" || decoded.args?.length !== 2) throw new Error("direct-mint function drift");
  const proof = record(decoded.args[0], "FDC proof");
  const proofData = record(proof.data, "FDC proof data");
  const requestBody = record(proofData.requestBody, "FDC request body");
  const responseBody = record(proofData.responseBody, "FDC response body");
  const xrpl = parseXrplPayment(xrplPayload, reference);
  equalHex(requestBody.transactionId, reference.xrplTransactionHash, "FDC transaction ID");
  equalAddress(requestBody.proofOwner, reference.executor, "FDC proof owner");
  if (proofData.votingRound !== reference.votingRound || responseBody.blockNumber !== reference.xrplLedgerIndex
    || responseBody.sourceAddress !== xrpl.source || responseBody.receivedAmount !== reference.receivedAmountUBA
    || responseBody.status !== 0 || responseBody.hasMemoData !== true || responseBody.hasDestinationTag !== false) {
    throw new Error("FDC payment response drift");
  }
  equalHex(responseBody.firstMemoData, xrpl.memo, "FDC memo");
  const proofCommitment = keccak256(encodeFunctionData({ abi: FDC_XRPL_VERIFICATION_ABI, functionName: "verifyXRPPayment", args: [proof] }));
  equalHex(proofCommitment, reference.proofCommitment, "FDC proof commitment");
  const operation = decodeOperation(decoded.args[1], xrpl.memo, reference);
  if (operation.totalCallValue !== transaction.value) throw new Error("direct-mint msg.value drift");
  findDepositEvent(receipt, reference, operation);
  return { reference, xrpl, proof, proofCommitment, operation };
}

function computeSmartAccountQuote(netMintAmountUBA, executorFeeUBA, feeBIPS, minimumFeeUBA) {
  for (const [label, value] of Object.entries({ netMintAmountUBA, executorFeeUBA, feeBIPS, minimumFeeUBA })) uint(value, label);
  if (netMintAmountUBA !== 0n && feeBIPS > MAX_UINT256 / netMintAmountUBA) throw new Error("direct-mint quote overflow");
  const proportionalFeeUBA = netMintAmountUBA * feeBIPS / 10_000n;
  const mintingFeeUBA = proportionalFeeUBA > minimumFeeUBA ? proportionalFeeUBA : minimumFeeUBA;
  if (mintingFeeUBA > MAX_UINT256 - netMintAmountUBA || executorFeeUBA > MAX_UINT256 - netMintAmountUBA - mintingFeeUBA) {
    throw new Error("direct-mint quote overflow");
  }
  return { netMintAmountUBA, executorFeeUBA, feeBIPS, minimumFeeUBA, proportionalFeeUBA, mintingFeeUBA, totalPaymentUBA: netMintAmountUBA + mintingFeeUBA + executorFeeUBA };
}

function normalizeAccounting(value) {
  const accounting = record(value, "PayGuard vault accounting");
  const normalized = Object.fromEntries(["deposited", "available", "reserved", "spent", "withdrawn", "refunded"].map((key) => [key, uint(accounting[key], `accounting ${key}`)]));
  if (normalized.deposited !== normalized.available + normalized.reserved + normalized.spent + normalized.withdrawn + normalized.refunded) {
    throw new Error("PayGuard vault conservation drift");
  }
  return normalized;
}

export async function collectFundingResumeObservation({ client = chainClient(), xrplReader = xrplRequest, reference: rawReference } = {}) {
  const referenceValue = rawReference ?? JSON.parse(await readFile(FUNDING_REFERENCE_PATH, "utf8"));
  const reference = normalizeReference(referenceValue);
  const [chainId, observedBlock, transaction, receipt, xrplPayload, assetManager, verificationAddress, controller] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getTransaction({ hash: reference.directMintTransactionHash }),
    client.getTransactionReceipt({ hash: reference.directMintTransactionHash }),
    xrplReader({ command: "tx", transaction: reference.xrplTransactionHash.slice(2).toUpperCase(), binary: false, api_version: 2 }),
    client.readContract({ address: FLARE_CONTRACT_REGISTRY, abi: REGISTRY_ABI, functionName: "getContractAddressByName", args: ["AssetManagerFXRP"] }),
    client.readContract({ address: FLARE_CONTRACT_REGISTRY, abi: REGISTRY_ABI, functionName: "getContractAddressByName", args: ["FdcVerification"] }),
    client.readContract({ address: FLARE_CONTRACT_REGISTRY, abi: REGISTRY_ABI, functionName: "getContractAddressByName", args: ["MasterAccountController"] }),
  ]);
  if (chainId !== COSTON2_CHAIN_ID) throw new Error("funding resume audit must target Coston2");
  equalAddress(assetManager, reference.assetManager, "runtime AssetManager");
  const decoded = decodeHistoricalFundingArtifacts({ transaction, receipt, xrplPayload, reference: referenceValue });
  const runtimeVerification = address(verificationAddress, "runtime FDC verification");
  const runtimeController = address(controller, "runtime MasterAccountController");
  const [fAsset, feeBIPS, minimumFeeUBA, paymentAddress, currentNonce, proofVerified, accounting] = await Promise.all([
    client.readContract({ address: reference.assetManager, abi: ASSET_MANAGER_ABI, functionName: "fAsset", args: [] }),
    client.readContract({ address: reference.assetManager, abi: ASSET_MANAGER_ABI, functionName: "getDirectMintingFeeBIPS", args: [] }),
    client.readContract({ address: reference.assetManager, abi: ASSET_MANAGER_ABI, functionName: "getDirectMintingMinimumFeeUBA", args: [] }),
    client.readContract({ address: reference.assetManager, abi: ASSET_MANAGER_ABI, functionName: "directMintingPaymentAddress", args: [] }),
    client.readContract({ address: runtimeController, abi: MASTER_ACCOUNT_CONTROLLER_ABI, functionName: "getNonce", args: [decoded.operation.sender] }),
    client.readContract({ address: runtimeVerification, abi: FDC_XRPL_VERIFICATION_ABI, functionName: "verifyXRPPayment", args: [decoded.proof] }),
    client.readContract({ address: reference.vault, abi: VAULT_ABI, functionName: "accounting", args: [decoded.operation.deposit.beneficiary, reference.fAsset] }),
  ]);
  equalAddress(fAsset, reference.fAsset, "runtime FAsset");
  if (typeof paymentAddress !== "string" || !isValidClassicAddress(paymentAddress) || paymentAddress !== decoded.xrpl.destination) {
    throw new Error("runtime direct-mint payment address drift");
  }
  if (proofVerified !== true) throw new Error("historical FDC proof rejected on-chain");
  const nonce = uint(currentNonce, "current personal-account nonce");
  if (nonce <= decoded.operation.nonce) throw new Error("successful operation nonce was not consumed");
  const vaultAccounting = normalizeAccounting(accounting);
  if (vaultAccounting.deposited < reference.depositedUBA) throw new Error("PayGuard deposited accounting regressed");
  const quote = computeSmartAccountQuote(reference.depositedUBA, decoded.operation.executorFeeUBA, uint(feeBIPS, "fee BIPS"), uint(minimumFeeUBA, "minimum fee"));
  if (quote.totalPaymentUBA !== reference.receivedAmountUBA) throw new Error("current direct-mint quote drift");
  return {
    chainId,
    observedBlock: uint(observedBlock, "observed block"),
    runtime: { assetManager: reference.assetManager, fAsset: reference.fAsset, fdcVerification: runtimeVerification, masterAccountController: runtimeController, paymentAddress },
    xrpl: decoded.xrpl,
    fdc: { votingRound: reference.votingRound, proofOwner: reference.executor, proofCommitment: decoded.proofCommitment, onChainVerified: true },
    operation: decoded.operation,
    currentNonce: nonce,
    receipt: { transactionHash: reference.directMintTransactionHash, blockNumber: reference.directMintBlock, executor: reference.executor, depositEventVerified: true },
    quote,
    accounting: vaultAccounting,
  };
}

export function buildFundingResumeEvidence(observation, recordedAt = new Date().toISOString()) {
  if (observation?.chainId !== COSTON2_CHAIN_ID || observation.fdc?.onChainVerified !== true || observation.receipt?.depositEventVerified !== true) {
    throw new Error("funding resume observation is incomplete");
  }
  const observedBlock = uint(observation.observedBlock, "observed block");
  if (observedBlock === 0n) throw new Error("observed block is empty");
  const xrpl = {
    hash: bytes32(observation.xrpl.hash, "XRPL transaction hash"),
    ledgerIndex: uint(observation.xrpl.ledgerIndex, "XRPL ledger index"),
    source: observation.xrpl.source,
    destination: observation.xrpl.destination,
    deliveredAmountUBA: uint(observation.xrpl.deliveredAmountUBA, "XRPL delivered amount"),
    memo: bytes(observation.xrpl.memo, "XRPL memo", 42),
  };
  if (!isValidClassicAddress(xrpl.source) || !isValidClassicAddress(xrpl.destination)) throw new Error("XRPL account is malformed");
  const quote = computeSmartAccountQuote(observation.quote.netMintAmountUBA, observation.quote.executorFeeUBA, observation.quote.feeBIPS, observation.quote.minimumFeeUBA);
  if (quote.totalPaymentUBA !== xrpl.deliveredAmountUBA) throw new Error("funding resume quote drift");
  const operation = observation.operation;
  const currentNonce = uint(observation.currentNonce, "observed current nonce");
  if (operation.nonce >= MAX_UINT256 || currentNonce <= operation.nonce || operation.callCount !== 2
    || uint(operation.totalCallValue, "operation call value") < 0n) throw new Error("funding resume operation is malformed");
  const normalizedOperation = {
    operationHash: bytes32(operation.operationHash, "operation hash"),
    sender: address(operation.sender, "personal account"),
    nonce: uint(operation.nonce, "consumed nonce"),
    callCount: operation.callCount,
    totalCallValue: operation.totalCallValue,
    beneficiary: address(operation.deposit?.beneficiary, "deposit beneficiary"),
    asset: address(operation.deposit?.asset, "deposit asset"),
    depositedUBA: uint(operation.deposit?.amount, "deposit amount"),
  };
  const fdc = {
    votingRound: uint(observation.fdc.votingRound, "FDC voting round"),
    proofOwner: address(observation.fdc.proofOwner, "FDC proof owner"),
    proofCommitment: bytes32(observation.fdc.proofCommitment, "FDC proof commitment"),
  };
  const receipt = {
    transactionHash: bytes32(observation.receipt.transactionHash, "direct-mint receipt hash"),
    blockNumber: uint(observation.receipt.blockNumber, "direct-mint receipt block"),
    executor: address(observation.receipt.executor, "direct-mint receipt executor"),
  };
  const runtime = {
    assetManager: address(observation.runtime.assetManager, "runtime AssetManager"),
    fAsset: address(observation.runtime.fAsset, "runtime FAsset"),
    fdcVerification: address(observation.runtime.fdcVerification, "runtime FDC verification"),
    masterAccountController: address(observation.runtime.masterAccountController, "runtime MasterAccountController"),
    paymentAddress: observation.runtime.paymentAddress,
  };
  if (typeof runtime.paymentAddress !== "string" || !isValidClassicAddress(runtime.paymentAddress)) {
    throw new Error("runtime payment address is malformed");
  }
  const accounting = normalizeAccounting(observation.accounting);
  if (runtime.paymentAddress !== xrpl.destination || runtime.fAsset !== normalizedOperation.asset
    || fdc.proofOwner !== receipt.executor || quote.netMintAmountUBA !== normalizedOperation.depositedUBA
    || accounting.deposited < normalizedOperation.depositedUBA) throw new Error("funding resume cross-binding drift");
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-funding-resume-audit",
    status: "historical-checkpoint-reconstructed",
    recordedAt,
    network: { name: "flare-coston2", chainId: COSTON2_CHAIN_ID, observedBlock: observedBlock.toString() },
    publicIdentifiers: {
      xrpl: { transactionHash: xrpl.hash, ledgerIndex: xrpl.ledgerIndex.toString(), source: xrpl.source, destination: xrpl.destination, deliveredAmountUBA: xrpl.deliveredAmountUBA.toString(), memoHash: keccak256(xrpl.memo) },
      fdc: { votingRound: fdc.votingRound.toString(), proofOwner: fdc.proofOwner, proofCommitment: fdc.proofCommitment },
      operation: { operationHash: normalizedOperation.operationHash, personalAccount: normalizedOperation.sender, consumedNonce: normalizedOperation.nonce.toString(), observedCurrentNonce: currentNonce.toString(), callCount: normalizedOperation.callCount, totalCallValueWei: normalizedOperation.totalCallValue.toString(), beneficiary: normalizedOperation.beneficiary, asset: normalizedOperation.asset, depositedUBA: normalizedOperation.depositedUBA.toString() },
      receipt: { transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber.toString(), executor: receipt.executor },
      runtime,
      quote: Object.fromEntries(Object.entries(quote).map(([key, value]) => [key, value.toString()])),
      vaultAccounting: Object.fromEntries(Object.entries(accounting).map(([key, value]) => [key, value.toString()])),
    },
    assertions: {
      xrplPaymentRevalidated: true,
      runtimePaymentAddressMatched: true,
      fdcProofDecodedFromPublicCalldata: true,
      fdcProofCommitmentMatched: true,
      fdcProofReverifiedOnChain: true,
      memoOperationHashMatched: true,
      packedUserOperationDecoded: true,
      operationNonceConsumed: true,
      approveDepositPairMatched: true,
      smartAccountQuoteRecomputed: true,
      directMintReceiptSuccessful: true,
      payGuardDepositEventMatched: true,
      payGuardConservationVerified: true,
      noTransactionSubmitted: true,
      actualDelayedEventObserved: false,
      testnetOnly: true,
      noPrivateKeyRecorded: true,
      noCredentialRecorded: true,
      noRawProofOrUserOperationRecorded: true,
      noPolicyPlaintextOrCiphertextRecorded: true,
      noPayGuardReleaseClaimed: true,
    },
    blockers: ["ACTUAL_DIRECT_MINT_DELAY_AND_RESUBMISSION_NOT_OBSERVED", "PAYGUARD_RELEASE_MANIFEST_NOT_VERIFIED"],
    notes: [
      "This credential-free audit reconstructs the completed funding checkpoint from public XRPL and Coston2 history and re-verifies the calldata FDC proof through the runtime FdcVerification contract.",
      "The 0xFE memo commitment, PackedUserOperation, consumed nonce, approve/deposit pair, receipt, runtime payment address, current fee quote, PayGuard deposit event, and conservation state are bound fail-closed.",
      "Raw FDC proof nodes, raw PackedUserOperation bytes, credentials, and signing material are intentionally excluded from this evidence.",
      "This historical transaction completed without a recorded DirectMintingDelayed event. A real delayed-event wait and resubmission remains open and is not simulated as live success.",
      "This is testnet funding evidence, not FCC custody/evaluation or a verified PayGuard release.",
    ],
  };
}

export function parseFundingResumeCLI(argv) {
  const [mode = "observe", ...tokens] = argv;
  if (mode !== "observe") throw new Error("mode must be observe");
  let write = false;
  for (const token of tokens) {
    if (token === "--write" && !write) { write = true; continue; }
    throw new Error(`invalid or duplicate argument ${token}`);
  }
  return { mode, write };
}

async function writeEvidence(evidence) {
  await mkdir(resolve(FUNDING_RESUME_EVIDENCE_PATH, ".."), { recursive: true });
  const temporary = `${FUNDING_RESUME_EVIDENCE_PATH}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
  await rename(temporary, FUNDING_RESUME_EVIDENCE_PATH);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseFundingResumeCLI(process.argv.slice(2));
    const observation = await collectFundingResumeObservation();
    const evidence = buildFundingResumeEvidence(observation);
    if (options.write) await writeEvidence(evidence);
    console.log(JSON.stringify({ status: "ok", write: options.write, observedBlock: evidence.network.observedBlock, xrplTransactionHash: evidence.publicIdentifiers.xrpl.transactionHash, directMintTransactionHash: evidence.publicIdentifiers.receipt.transactionHash, actualDelayedEventObserved: false }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
