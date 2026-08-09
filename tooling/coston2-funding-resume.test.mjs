import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  concatHex,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  keccak256,
  numberToHex,
  padHex,
  stringToHex,
  zeroHash,
} from "viem";
import {
  DIRECT_MINT_RESUME_ABI,
  FDC_XRPL_VERIFICATION_ABI,
  buildFundingResumeEvidence,
  collectFundingResumeObservation,
  decodeHistoricalFundingArtifacts,
  parseFundingResumeCLI,
} from "./coston2-funding-resume.mjs";

const address = (digit) => `0x${digit.repeat(40)}`;
const hash = (label) => keccak256(stringToHex(label));
const source = "rJRfrgiV5qaY9qf38NeBF7bDXdsQNn7uSM";
const paymentAddress = "rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p";
const executor = address("1");
const assetManager = address("2");
const fAsset = address("3");
const vault = address("4");
const personalAccount = address("5");
const beneficiary = address("6");
const verification = address("7");
const controller = address("8");
const registry = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";
const amount = 1_000_000n;
const received = 1_200_000n;
const executorFee = 100_000n;
const xrplHash = hash("xrpl-payment");
const directMintHash = hash("direct-mint");

const packedUserOperation = [{ type: "tuple", components: [
  { name: "sender", type: "address" }, { name: "nonce", type: "uint256" },
  { name: "initCode", type: "bytes" }, { name: "callData", type: "bytes" },
  { name: "accountGasLimits", type: "bytes32" }, { name: "preVerificationGas", type: "uint256" },
  { name: "gasFees", type: "bytes32" }, { name: "paymasterAndData", type: "bytes" }, { name: "signature", type: "bytes" },
] }];

const executeUserOpAbi = [{ type: "function", name: "executeUserOp", stateMutability: "nonpayable", inputs: [{ name: "calls", type: "tuple[]", components: [
  { name: "target", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" },
] }], outputs: [] }];
const approveAbi = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "success", type: "bool" }] }];
const depositAbi = [
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }, { name: "beneficiary", type: "address" }], outputs: [] },
  { type: "event", name: "Deposited", inputs: [{ name: "owner", type: "address", indexed: true }, { name: "asset", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }], anonymous: false },
];

function fixture() {
  const approve = encodeFunctionData({ abi: approveAbi, functionName: "approve", args: [vault, amount] });
  const deposit = encodeFunctionData({ abi: depositAbi, functionName: "deposit", args: [fAsset, amount, beneficiary] });
  const callData = encodeFunctionData({ abi: executeUserOpAbi, functionName: "executeUserOp", args: [[
    { target: fAsset, value: 0n, data: approve }, { target: vault, value: 0n, data: deposit },
  ]] });
  const userOperationData = encodeAbiParameters(packedUserOperation, [{ sender: personalAccount, nonce: 0n, initCode: "0x", callData, accountGasLimits: zeroHash, preVerificationGas: 0n, gasFees: zeroHash, paymasterAndData: "0x", signature: "0x" }]);
  const operationHash = keccak256(userOperationData);
  const memo = concatHex(["0xfe", numberToHex(0, { size: 1 }), numberToHex(executorFee, { size: 8 }), operationHash]);
  const proof = {
    merkleProof: [hash("node")],
    data: {
      attestationType: padHex(stringToHex("XRPPayment"), { dir: "right", size: 32 }),
      sourceId: padHex(stringToHex("testXRP"), { dir: "right", size: 32 }),
      votingRound: 22n,
      lowestUsedTimestamp: 1_000n,
      requestBody: { transactionId: xrplHash, proofOwner: executor },
      responseBody: {
        blockNumber: 99n, blockTimestamp: 1_000n, sourceAddress: source,
        sourceAddressHash: hash("source"), receivingAddressHash: hash("receiving"), intendedReceivingAddressHash: hash("intended"),
        spentAmount: received, intendedSpentAmount: received, receivedAmount: received, intendedReceivedAmount: received,
        hasMemoData: true, firstMemoData: memo, hasDestinationTag: false, destinationTag: 0n, status: 0,
      },
    },
  };
  const input = encodeFunctionData({ abi: DIRECT_MINT_RESUME_ABI, functionName: "executeDirectMintingWithData", args: [proof, userOperationData] });
  const proofCommitment = keccak256(encodeFunctionData({ abi: FDC_XRPL_VERIFICATION_ABI, functionName: "verifyXRPPayment", args: [proof] }));
  const topics = encodeEventTopics({ abi: depositAbi, eventName: "Deposited", args: { owner: beneficiary, asset: fAsset } });
  const reference = {
    publicIdentifiers: {
      xrpl: { network: "xrpl-testnet", transactionHash: xrplHash, ledgerIndex: "99", destination: paymentAddress, receivedAmountDrops: received.toString(), validatedResult: "tesSUCCESS" },
      fdc: { requestTransactionHash: hash("fdc-request"), votingRound: "22", proofCommitment },
      directMint: { transactionHash: directMintHash, block: "123", status: "success", executor, assetManager, fTestXrp: fAsset, payGuardVault: vault, depositedUBA: amount.toString() },
    },
  };
  const transaction = { hash: directMintHash, blockNumber: 123n, from: executor, to: assetManager, value: 0n, input };
  const receipt = { transactionHash: directMintHash, blockNumber: 123n, from: executor, to: assetManager, status: "success", logs: [{ address: vault, topics, data: encodeAbiParameters([{ type: "uint256" }], [amount]) }] };
  const xrplPayload = { result: { status: "success", validated: true, hash: xrplHash.slice(2).toUpperCase(), ledger_index: 99, tx_json: { TransactionType: "Payment", Account: source, Destination: paymentAddress, Memos: [{ Memo: { MemoData: memo.slice(2).toUpperCase() } }] }, meta: { TransactionResult: "tesSUCCESS", delivered_amount: received.toString() } } };
  return { reference, transaction, receipt, xrplPayload, proofCommitment, operationHash };
}

function mockClient(f, patch = {}) {
  return {
    async getChainId() { return patch.chainId ?? 114; },
    async getBlockNumber() { return 456n; },
    async getTransaction() { return patch.transaction ?? f.transaction; },
    async getTransactionReceipt() { return patch.receipt ?? f.receipt; },
    async readContract(args) {
      if (args.address.toLowerCase() === registry.toLowerCase()) {
        if (args.args[0] === "AssetManagerFXRP") return assetManager;
        if (args.args[0] === "FdcVerification") return verification;
        if (args.args[0] === "MasterAccountController") return controller;
      }
      if (args.functionName === "fAsset") return fAsset;
      if (args.functionName === "getDirectMintingFeeBIPS") return patch.feeBIPS ?? 10n;
      if (args.functionName === "getDirectMintingMinimumFeeUBA") return patch.minimumFeeUBA ?? 100_000n;
      if (args.functionName === "directMintingPaymentAddress") return patch.paymentAddress ?? paymentAddress;
      if (args.functionName === "getNonce") return patch.currentNonce ?? 1n;
      if (args.functionName === "verifyXRPPayment") return patch.proofVerified ?? true;
      if (args.functionName === "accounting") return patch.accounting ?? { deposited: amount, available: amount, reserved: 0n, spent: 0n, withdrawn: 0n, refunded: 0n };
      throw new Error(`unexpected read ${args.functionName}`);
    },
  };
}

describe("Coston2 public funding resume audit", () => {
  it("accepts only a read-only observe mode", () => {
    assert.deepEqual(parseFundingResumeCLI([]), { mode: "observe", write: false });
    assert.deepEqual(parseFundingResumeCLI(["observe", "--write"]), { mode: "observe", write: true });
    assert.throws(() => parseFundingResumeCLI(["resume"]), /observe/);
    assert.throws(() => parseFundingResumeCLI(["observe", "--write", "--write"]), /duplicate/);
  });

  it("reconstructs the exact public proof, memo operation, approve/deposit pair, and receipt", () => {
    const f = fixture();
    const decoded = decodeHistoricalFundingArtifacts(f);
    assert.equal(decoded.proofCommitment, f.proofCommitment);
    assert.equal(decoded.operation.operationHash, f.operationHash);
    assert.equal(decoded.operation.sender, personalAccount);
    assert.equal(decoded.operation.deposit.beneficiary, beneficiary);
    assert.equal(decoded.operation.executorFeeUBA, executorFee);
  });

  it("rejects proof, operation, address, and receipt drift before any live read can become success", () => {
    const f = fixture();
    assert.throws(() => decodeHistoricalFundingArtifacts({ ...f, reference: { ...f.reference, publicIdentifiers: { ...f.reference.publicIdentifiers, fdc: { ...f.reference.publicIdentifiers.fdc, proofCommitment: hash("wrong-proof") } } } }), /proof commitment drift/);
    assert.throws(() => decodeHistoricalFundingArtifacts({ ...f, xrplPayload: { ...f.xrplPayload, result: { ...f.xrplPayload.result, tx_json: { ...f.xrplPayload.result.tx_json, Memos: [{ Memo: { MemoData: `FF${f.xrplPayload.result.tx_json.Memos[0].Memo.MemoData.slice(2)}` } }] } } } }), /memo opcode drift/);
    assert.throws(() => decodeHistoricalFundingArtifacts({ ...f, xrplPayload: { ...f.xrplPayload, result: { ...f.xrplPayload.result, tx_json: { ...f.xrplPayload.result.tx_json, Destination: "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn" } } } }), /destination drift/);
    assert.throws(() => decodeHistoricalFundingArtifacts({ ...f, receipt: { ...f.receipt, status: "reverted" } }), /receipt checkpoint drift/);
    assert.throws(() => decodeHistoricalFundingArtifacts({ ...f, receipt: { ...f.receipt, logs: [] } }), /deposit event missing/);
  });

  it("revalidates live-bound runtime state and keeps quote, nonce, proof, and conservation drift closed", async () => {
    const f = fixture();
    const observe = (patch) => collectFundingResumeObservation({ client: mockClient(f, patch), xrplReader: async () => f.xrplPayload, reference: f.reference });
    const observation = await observe();
    assert.equal(observation.currentNonce, 1n);
    assert.equal(observation.quote.totalPaymentUBA, received);
    const evidence = buildFundingResumeEvidence({
      ...observation,
      runtime: { ...observation.runtime, apiKey: "must-not-serialize" },
      accounting: { ...observation.accounting, credential: "must-not-serialize" },
    }, "2026-08-09T00:00:00.000Z");
    assert.equal(evidence.assertions.fdcProofReverifiedOnChain, true);
    assert.equal(evidence.assertions.actualDelayedEventObserved, false);
    assert.equal(evidence.publicIdentifiers.operation.observedCurrentNonce, "1");
    assert.equal(JSON.stringify(evidence).includes("must-not-serialize"), false);
    assert.throws(() => buildFundingResumeEvidence({ ...observation, currentNonce: 0n }), /operation is malformed/);
    await assert.rejects(observe({ currentNonce: 0n }), /nonce was not consumed/);
    await assert.rejects(observe({ proofVerified: false }), /proof rejected/);
    await assert.rejects(observe({ paymentAddress: "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn" }), /payment address drift/);
    await assert.rejects(observe({ minimumFeeUBA: 1n }), /quote drift/);
    await assert.rejects(observe({ accounting: { deposited: amount, available: amount - 1n, reserved: 0n, spent: 0n, withdrawn: 0n, refunded: 0n } }), /conservation drift/);
  });
});
